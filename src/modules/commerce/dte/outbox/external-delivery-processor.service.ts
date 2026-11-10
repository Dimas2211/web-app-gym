// ─────────────────────────────────────────────────────────────────
// commerce/dte/outbox — external-delivery-processor.service.ts
//
// FISCAL-ONBOARDING — entrega automática de DTE ACCEPTED a MariaDB.
//
// Diseño: la transmisión fiscal (transmit-dte-document) NO se toca y
// sigue sin acceder al Control Plane (invariante certificado). La
// entrega automática la hace este worker (acción admin o script CLI
// programado), en dos fases:
//   1. DESCUBRIR — por cada organización con integración activa y
//      auto_delivery_enabled, lee del runtime los DTE ACCEPTED con
//      accepted_at >= auto_delivery_enabled_at y asegura su fila en el
//      ledger (idempotente: nunca duplica). Históricos anteriores a la
//      habilitación jamás se encolan.
//   2. ENTREGAR — IN_PROGRESS con lease vencido -> UNCERTAIN; luego
//      PENDING / FAILED_RETRYABLE vencidos -> deliverDteToExternalDb con
//      el runtime de SU organización. El reclamo atómico del ledger
//      impide que dos workers (o un clic manual) inserten dos veces.
//
// No regenera, no firma, no retransmite a Hacienda.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { controlPlanePrisma } from "@/modules/platform/runtime/control-plane-prisma";
import { resolveExternalDteMariaDbDestination } from "../config/resolve-external-dte-destination";
import {
  deliverDteToExternalDb,
  type DeliverDteToExternalDbDeps,
} from "../services/deliver-dte-to-external-db.service";
import type { DeliverDteToExternalDbResult } from "../types/external-dte-delivery.types";
import { getExternalDeliveryLedger } from "./external-delivery-ledger";
import type { ExternalDeliveryLedger } from "./external-delivery-ledger.types";

export const OUTBOX_SYSTEM_USER = "system:dte-external-delivery-outbox";

export type RuntimeRunner = <T>(organizationId: string, cb: (client: PrismaClient) => Promise<T>) => Promise<T>;

export interface AutoDeliveryOrganization {
  organizationId: string;
  tenantId:       string;
  enabledAt:      Date;
}

export interface ProcessorDeps extends DeliverDteToExternalDbDeps {
  ledger?:        ExternalDeliveryLedger;
  runtimeRunner?: RuntimeRunner;
  listAutoDeliveryOrganizations?: (organizationId?: string) => Promise<AutoDeliveryOrganization[]>;
}

async function defaultRuntimeRunner<T>(organizationId: string, cb: (client: PrismaClient) => Promise<T>): Promise<T> {
  const { withOrganizationRuntimePrisma } = await import("@/modules/platform/runtime/runtime-database-router");
  return withOrganizationRuntimePrisma(organizationId, (client) => cb(client));
}

async function defaultListAutoDeliveryOrganizations(organizationId?: string): Promise<AutoDeliveryOrganization[]> {
  const rows = await controlPlanePrisma.platformExternalIntegration.findMany({
    where: {
      type: "DTE_MARIADB", is_active: true, auto_delivery_enabled: true,
      auto_delivery_enabled_at: { not: null },
      ...(organizationId ? { organization_id: organizationId } : {}),
    },
    select: { organization_id: true, auto_delivery_enabled_at: true, organization: { select: { tenant_id: true } } },
  });
  return rows
    .filter((r) => r.organization.tenant_id && r.auto_delivery_enabled_at)
    .map((r) => ({ organizationId: r.organization_id, tenantId: r.organization.tenant_id!, enabledAt: r.auto_delivery_enabled_at! }));
}

export interface DiscoverySummary {
  organizations: number;
  enqueued:      number;
  errors:        Array<{ organizationId: string; error: string }>;
}

// Página de lectura del runtime y tope de páginas por organización y pasada.
// Los DTE ya presentes en el ledger se saltan, así el descubrimiento avanza
// aunque existan más de `limitPerOrganization` aceptados desde la habilitación
// (antes se releían siempre los primeros N y los posteriores nunca se encolaban).
const DISCOVERY_PAGE_SIZE = 200;
const DISCOVERY_MAX_PAGES = 50;

/** Fase 1 — encola (idempotente) los DTE ACCEPTED posteriores a la habilitación. */
export async function discoverAcceptedDocumentsForAutoDelivery(
  opts: { organizationId?: string; limitPerOrganization?: number } = {},
  deps: ProcessorDeps = {},
): Promise<DiscoverySummary> {
  const ledger = deps.ledger ?? getExternalDeliveryLedger();
  const runner = deps.runtimeRunner ?? defaultRuntimeRunner;
  const orgs = await (deps.listAutoDeliveryOrganizations ?? defaultListAutoDeliveryOrganizations)(opts.organizationId);
  const summary: DiscoverySummary = { organizations: orgs.length, enqueued: 0, errors: [] };
  const limit = opts.limitPerOrganization ?? 50;

  for (const org of orgs) {
    const destination = await resolveExternalDteMariaDbDestination({ organizationId: org.organizationId, allowLegacyEnvFallback: false, tenantId: org.tenantId });
    if (destination.status !== "CONFIGURED" || !destination.autoDeliveryEnabled) continue;

    try {
      const docs: Array<{ id: string; location_id: string; environment: string; generation_code: string | null }> = [];
      for (let page = 0; page < DISCOVERY_MAX_PAGES && docs.length < limit; page++) {
        const batch = await runner(org.organizationId, (client) =>
          client.dteOutgoingDocument.findMany({
            where:   { tenant_id: org.tenantId, dte_status: "ACCEPTED", accepted_at: { gte: org.enabledAt } },
            select:  { id: true, location_id: true, environment: true, generation_code: true },
            orderBy: [{ accepted_at: "asc" }, { id: "asc" }],
            skip:    page * DISCOVERY_PAGE_SIZE,
            take:    DISCOVERY_PAGE_SIZE,
          }),
        );
        const known = await ledger.listKnownDocumentIds(org.organizationId, batch.map((d) => d.id));
        for (const d of batch) {
          if (!known.has(d.id) && docs.length < limit) docs.push(d);
        }
        if (batch.length < DISCOVERY_PAGE_SIZE) break;
      }
      for (const d of docs) {
        const job = await ledger.ensureJob({
          organizationId: org.organizationId, tenantId: org.tenantId, locationId: d.location_id,
          environment: d.environment, dteDocumentId: d.id, generationCode: d.generation_code,
          trigger: "AUTO", userId: OUTBOX_SYSTEM_USER,
          destination: {
            integrationId: destination.integrationId ?? null,
            host: destination.config.host, database: destination.config.database, table: destination.config.table,
          },
        });
        if (job.status === "PENDING" && job.attempts === 0) summary.enqueued++;
      }
    } catch (err) {
      summary.errors.push({ organizationId: org.organizationId, error: err instanceof Error ? err.name : "Error" });
    }
  }
  return summary;
}

export interface ProcessDueJobsSummary {
  discovered:   DiscoverySummary;
  expiredLeasesMarkedUncertain: number;
  examined:   number;
  delivered:  number;
  failed:     number;
  uncertain:  number;
  skipped:    number;
  details:    Array<{ jobId: string; organizationId: string; outcome: string; errorCode?: string }>;
}

/** Fase 1 + Fase 2. */
export async function processDueExternalDeliveryJobs(
  opts: { limit?: number; organizationId?: string; now?: Date } = {},
  deps: ProcessorDeps = {},
): Promise<ProcessDueJobsSummary> {
  const ledger = deps.ledger ?? getExternalDeliveryLedger();
  const now    = opts.now ?? new Date();
  const runner = deps.runtimeRunner ?? defaultRuntimeRunner;

  const discovered = await discoverAcceptedDocumentsForAutoDelivery({ organizationId: opts.organizationId }, { ...deps, ledger });

  const summary: ProcessDueJobsSummary = {
    discovered,
    expiredLeasesMarkedUncertain: await ledger.expireStaleLeases(now),
    examined: 0, delivered: 0, failed: 0, uncertain: 0, skipped: 0, details: [],
  };

  const due = await ledger.listDue(now, opts.limit ?? 25, opts.organizationId);

  for (const job of due) {
    summary.examined++;

    const destination = await resolveExternalDteMariaDbDestination({
      organizationId: job.organization_id,
      allowLegacyEnvFallback: false,
      tenantId:       job.tenant_id,
    });
    if (destination.status !== "CONFIGURED" || !destination.autoDeliveryEnabled) {
      summary.skipped++;
      summary.details.push({
        jobId: job.id, organizationId: job.organization_id,
        outcome: destination.status === "TENANT_MISMATCH" ? "SKIPPED_TENANT_MISMATCH" : "SKIPPED_AUTO_OFF",
      });
      continue;
    }

    let result: DeliverDteToExternalDbResult;
    try {
      result = await runner(job.organization_id, (client) =>
        deliverDteToExternalDb(
          {
            dteDocumentId: job.dte_document_id,
            userId:        OUTBOX_SYSTEM_USER,
            tenantId:      job.tenant_id,
            locationId:    job.location_id,
            client,
            organizationId: job.organization_id,
            allowLegacyEnvFallback: false,
            trigger:       "AUTO",
          },
          { ...deps, ledger },
        ),
      );
    } catch (err) {
      summary.skipped++;
      summary.details.push({
        jobId: job.id, organizationId: job.organization_id, outcome: "RUNTIME_UNAVAILABLE",
        errorCode: err instanceof Error ? err.name : "Error",
      });
      continue;
    }

    if (result.ok) {
      summary.delivered++;
      summary.details.push({ jobId: job.id, organizationId: job.organization_id, outcome: "DELIVERED" });
    } else if (result.errorCode === "UNCERTAIN" || result.errorCode === "REQUIRES_RECONCILIATION") {
      summary.uncertain++;
      summary.details.push({ jobId: job.id, organizationId: job.organization_id, outcome: "UNCERTAIN", errorCode: result.errorCode });
    } else if (result.errorCode === "ALREADY_DELIVERED") {
      summary.skipped++;
      summary.details.push({ jobId: job.id, organizationId: job.organization_id, outcome: "ALREADY_DELIVERED" });
    } else {
      summary.failed++;
      summary.details.push({ jobId: job.id, organizationId: job.organization_id, outcome: "FAILED", errorCode: result.errorCode });
    }
  }

  return summary;
}
