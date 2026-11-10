// ─────────────────────────────────────────────────────────────────
// commerce/dte/outbox — external-delivery-ledger.ts
//
// FISCAL-ONBOARDING — implementación Prisma (Control Plane) del ledger
// de entregas MariaDB. La exclusión mutua se obtiene con UPDATE
// condicional (updateMany ... WHERE status IN (...) ) — PostgreSQL
// serializa los UPDATE sobre la misma fila, así que dos clics, dos
// pestañas o dos workers concurrentes nunca reclaman la misma entrega.
//
// Nunca guarda credenciales ni payload: solo metadatos del destino.
// ─────────────────────────────────────────────────────────────────

import { Prisma, type PrismaClient } from "@prisma/client";
import { controlPlanePrisma } from "@/modules/platform/runtime/control-plane-prisma";
import {
  buildExternalDeliveryIdempotencyKey,
  CLAIMABLE_STATUSES,
  type ClaimOptions,
  type EnsureExternalDeliveryJobInput,
  type ExternalDeliveryJob,
  type ExternalDeliveryLedger,
  type ReconcileDecision,
} from "./external-delivery-ledger.types";

const DOCUMENT_KIND = "DTE";

export class PrismaExternalDeliveryLedger implements ExternalDeliveryLedger {
  constructor(private readonly db: PrismaClient = controlPlanePrisma) {}

  private get jobs() {
    return this.db.platformDteExternalDeliveryJob;
  }

  async ensureJob(input: EnsureExternalDeliveryJobInput): Promise<ExternalDeliveryJob> {
    const key = buildExternalDeliveryIdempotencyKey({
      organizationId: input.organizationId,
      environment:    input.environment,
      documentKind:   DOCUMENT_KIND,
      dteDocumentId:  input.dteDocumentId,
    });

    const existing = await this.jobs.findUnique({ where: { idempotency_key: key } });
    if (existing) return this.refreshDestinationIfPending(existing as ExternalDeliveryJob, input);

    try {
      const created = await this.jobs.create({
        data: {
          organization_id: input.organizationId,
          tenant_id:       input.tenantId,
          location_id:     input.locationId,
          environment:     input.environment,
          document_kind:   DOCUMENT_KIND,
          dte_document_id: input.dteDocumentId,
          generation_code: input.generationCode ?? null,
          idempotency_key: key,
          integration_id:  input.destination.integrationId ?? null,
          target_host:     input.destination.host,
          target_database: input.destination.database,
          target_table:    input.destination.table,
          trigger:         input.trigger,
          created_by:      input.userId ?? null,
          updated_by:      input.userId ?? null,
        },
      });
      return created as ExternalDeliveryJob;
    } catch (err) {
      // Carrera de creación (dos clics simultáneos): la otra petición ganó.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const row = await this.jobs.findUnique({ where: { idempotency_key: key } });
        if (row) return row as ExternalDeliveryJob;
      }
      throw err;
    }
  }

  // Si el admin corrigió la tabla/base mientras el job seguía PENDING o
  // FAILED_RETRYABLE (nunca se insertó), se actualiza el snapshot. Jamás
  // se toca un job IN_PROGRESS / UNCERTAIN / DELIVERED.
  private async refreshDestinationIfPending(
    job: ExternalDeliveryJob,
    input: EnsureExternalDeliveryJobInput,
  ): Promise<ExternalDeliveryJob> {
    const d = input.destination;
    const changed =
      job.target_host !== d.host || job.target_database !== d.database || job.target_table !== d.table ||
      (d.integrationId ?? null) !== job.integration_id;
    if (!changed || !CLAIMABLE_STATUSES.includes(job.status)) return job;

    await this.jobs.updateMany({
      where: { id: job.id, status: { in: CLAIMABLE_STATUSES } },
      data:  {
        target_host: d.host, target_database: d.database, target_table: d.table,
        integration_id: d.integrationId ?? null, updated_by: input.userId ?? null,
      },
    });
    return ((await this.get(job.id)) ?? job);
  }

  async listKnownDocumentIds(organizationId: string, dteDocumentIds: string[]): Promise<Set<string>> {
    if (dteDocumentIds.length === 0) return new Set();
    const rows = await this.jobs.findMany({
      where:  { organization_id: organizationId, document_kind: DOCUMENT_KIND, dte_document_id: { in: dteDocumentIds } },
      select: { dte_document_id: true },
    });
    return new Set(rows.map((r) => r.dte_document_id));
  }

  async get(jobId: string): Promise<ExternalDeliveryJob | null> {
    return (await this.jobs.findUnique({ where: { id: jobId } })) as ExternalDeliveryJob | null;
  }

  async claim(jobId: string, opts: ClaimOptions): Promise<ExternalDeliveryJob | null> {
    const where: Prisma.PlatformDteExternalDeliveryJobWhereInput = {
      id:     jobId,
      status: { in: CLAIMABLE_STATUSES },
    };
    if (!opts.manual) {
      where.attempts = { lt: this.db.platformDteExternalDeliveryJob.fields.max_attempts };
      where.OR = [{ next_attempt_at: null }, { next_attempt_at: { lte: opts.now } }];
    }

    const res = await this.jobs.updateMany({
      where,
      data: {
        status:           "IN_PROGRESS",
        lease_owner:      opts.owner,
        lease_expires_at: new Date(opts.now.getTime() + opts.leaseMs),
        attempts:         { increment: 1 },
      },
    });
    if (res.count !== 1) return null;
    return this.get(jobId);
  }

  async markDelivered(jobId: string, owner: string, data: { insertId: string | null; affectedRows: number; note?: string | null; now: Date }) {
    const res = await this.jobs.updateMany({
      where: { id: jobId, status: "IN_PROGRESS", lease_owner: owner },
      data:  {
        status: "DELIVERED", delivered_at: data.now, insert_id: data.insertId, affected_rows: data.affectedRows,
        lease_owner: null, lease_expires_at: null, last_error_code: null, last_error_message: data.note ?? null,
      },
    });
    return res.count === 1;
  }

  async markFailedRetryable(jobId: string, owner: string, data: { code: string; message: string; nextAttemptAt: Date | null; now: Date }) {
    const res = await this.jobs.updateMany({
      where: { id: jobId, status: "IN_PROGRESS", lease_owner: owner },
      data:  {
        status: "FAILED_RETRYABLE", next_attempt_at: data.nextAttemptAt,
        lease_owner: null, lease_expires_at: null,
        last_error_code: data.code, last_error_message: data.message.slice(0, 1000),
      },
    });
    return res.count === 1;
  }

  async markUncertain(jobId: string, owner: string, data: { code: string; message: string; now: Date }) {
    const res = await this.jobs.updateMany({
      where: { id: jobId, status: "IN_PROGRESS", lease_owner: owner },
      data:  {
        status: "UNCERTAIN", lease_owner: null, lease_expires_at: null, next_attempt_at: null,
        last_error_code: data.code, last_error_message: data.message.slice(0, 1000),
      },
    });
    return res.count === 1;
  }

  async markDeliveredFromLegacyEvidence(jobId: string, note: string, now: Date) {
    const res = await this.jobs.updateMany({
      where: { id: jobId, status: { in: CLAIMABLE_STATUSES } },
      data:  { status: "DELIVERED", delivered_at: now, last_error_code: "LEGACY_DELIVERY_LOG", last_error_message: note },
    });
    return res.count === 1;
  }

  async markUncertainFromLegacyEvidence(jobId: string, note: string) {
    const res = await this.jobs.updateMany({
      where: { id: jobId, status: { in: CLAIMABLE_STATUSES } },
      data:  { status: "UNCERTAIN", last_error_code: "LEGACY_UNCERTAIN_LOG", last_error_message: note },
    });
    return res.count === 1;
  }

  async expireStaleLeases(now: Date): Promise<number> {
    const res = await this.jobs.updateMany({
      where: { status: "IN_PROGRESS", lease_expires_at: { lt: now } },
      data:  {
        status: "UNCERTAIN", lease_owner: null, lease_expires_at: null,
        last_error_code: "LEASE_EXPIRED",
        last_error_message: "El proceso de entrega no confirmó resultado antes de vencer su lease; el INSERT pudo haberse ejecutado. Requiere conciliación.",
      },
    });
    return res.count;
  }

  async listDue(now: Date, limit: number, organizationId?: string): Promise<ExternalDeliveryJob[]> {
    const rows = await this.jobs.findMany({
      where: {
        ...(organizationId ? { organization_id: organizationId } : {}),
        status:   { in: CLAIMABLE_STATUSES },
        attempts: { lt: this.db.platformDteExternalDeliveryJob.fields.max_attempts },
        OR:       [{ next_attempt_at: null }, { next_attempt_at: { lte: now } }],
      },
      orderBy: { created_at: "asc" },
      take:    limit,
    });
    return rows as ExternalDeliveryJob[];
  }

  async reconcile(jobId: string, decision: ReconcileDecision, userId: string, note: string, now: Date) {
    const allowedFrom =
      decision === "CANCEL" ? (["PENDING", "FAILED_RETRYABLE", "UNCERTAIN"] as const) : (["UNCERTAIN"] as const);
    const target =
      decision === "CONFIRMED_DELIVERED" ? "RECONCILED_DELIVERED" : decision === "CANCEL" ? "CANCELLED" : "PENDING";

    const res = await this.jobs.updateMany({
      where: { id: jobId, status: { in: [...allowedFrom] } },
      data:  {
        status: target,
        reconciled_by: userId, reconciled_at: now, reconciliation_note: note.slice(0, 1000),
        next_attempt_at: null, updated_by: userId,
      },
    });
    if (res.count !== 1) return null;
    return this.get(jobId);
  }
}

let defaultLedger: ExternalDeliveryLedger | null = null;

export function getExternalDeliveryLedger(): ExternalDeliveryLedger {
  if (!defaultLedger) defaultLedger = new PrismaExternalDeliveryLedger();
  return defaultLedger;
}
