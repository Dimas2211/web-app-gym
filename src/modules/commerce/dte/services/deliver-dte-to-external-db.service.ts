// commerce/dte — deliver-dte-to-external-db.service.ts
//
// Entrega un DteOutgoingDocument ACCEPTED a la base MariaDB externa.
//
// Flujo:
//   1. Resolver destino por organización (Control Plane).
//   2. Cargar documento con scope tenant/location (incluye campos sensibles solo aquí).
//   3. Validar elegibilidad (ACCEPTED, tipo soportado, campos requeridos).
//   4. Construir payload externo (contrato sin cambios: JSON fiscal +
//      codigoEmpresa + responseMH + token).
//   5. FISCAL-ONBOARDING — reclamar la fila del ledger (outbox) por
//      organización + ambiente + documento. Solo el poseedor del lease
//      ejecuta el INSERT; dobles clics / workers concurrentes reciben
//      DELIVERY_IN_PROGRESS o ALREADY_DELIVERED.
//   6. Insertar en MariaDB externa vía adapter (INSERT-only).
//   7. Registrar el resultado en el ledger ANTES que en el log: si el log
//      falla, el ledger ya impide repetir el INSERT.
//   8. Registrar DteTransmissionLog (operation_type = EXTERNAL_DELIVERY).
//
// Reglas de reintento (guía §06): el receptor no deduplica, así que un
// resultado UNCERTAIN (timeout/conexión perdida tras enviar el INSERT, o
// affectedRows=0) bloquea cualquier reintento hasta conciliación humana.
// Solo NOT_INSERTED (la sentencia nunca se ejecutó o el servidor la
// rechazó) vuelve a FAILED_RETRYABLE.
//
// Evidencia previa al ledger: si el runtime ya tiene un log
// EXTERNAL_DELIVERY ok=true para el documento (p.ej. la primera entrega
// de MetaTraining del 30/10/2026) se marca DELIVERED sin volver a insertar.
//
// Seguridad:
//   - signed_jws y json_document no se loguean completos.
//   - Destino resuelto por ORGANIZACIÓN; fallback legado por env SOLO para
//     PLATFORM_NATIVE sin PlatformOrganization (ver resolve-external-dte-destination.ts).
//   - La organización debe ser dueña del tenant del documento
//     (ORG_TENANT_MISMATCH) — nunca se entrega a la tabla de otra organización.

import { prisma }                      from "@/lib/db/prisma";
import type { PrismaClient }           from "@prisma/client";
import { randomUUID }                  from "node:crypto";
import { controlPlanePrisma }          from "@/modules/platform/runtime/control-plane-prisma";
import { ExternalDteMariaDbAdapter }   from "../adapters/external-dte-mariadb.adapter";
import { resolveExternalDteMariaDbDestination } from "../config/resolve-external-dte-destination";
import {
  buildExternalDtePayload,
  type DteDocumentForExternalPayload,
} from "./build-external-dte-payload.service";
import type {
  DeliverDteToExternalDbResult,
  ExternalDteDeliveryResult,
  ExternalDteMariaDbConfig,
} from "../types/external-dte-delivery.types";
import { getExternalDeliveryLedger } from "../outbox/external-delivery-ledger";
import {
  computeNextAttemptAt,
  type ExternalDeliveryJob,
  type ExternalDeliveryLedger,
  type ExternalDeliveryTrigger,
} from "../outbox/external-delivery-ledger.types";

// ── Parámetros ────────────────────────────────────────────────────

export interface DeliverDteToExternalDbParams {
  dteDocumentId: string;
  userId:        string;
  tenantId:      string;
  locationId:    string;
  /**
   * PrismaClient contra el que se lee/escribe el documento DTE (runtime
   * del cliente cuando hay sesión "Operar como cliente"). El destino
   * MariaDB se resuelve SIEMPRE por organización, nunca por este client.
   */
  client?: PrismaClient;
  /** Organización efectiva resuelta server-side. */
  organizationId: string | null;
  /** true SOLO en modo normal sin PlatformOrganization resoluble. */
  allowLegacyEnvFallback: boolean;
  /** FISCAL-ONBOARDING — MANUAL (botón) o AUTO (outbox). Default MANUAL. */
  trigger?: ExternalDeliveryTrigger;
}

export interface DeliverDteToExternalDbDeps {
  ledger?:  ExternalDeliveryLedger;
  adapter?: { insert(config: ExternalDteMariaDbConfig, payload: unknown, tableName?: string): Promise<ExternalDteDeliveryResult> };
  now?:     () => Date;
  leaseMs?: number;
  /** tenant_id de la organización en Control Plane (null = sin vínculo). */
  getOrganizationTenantId?: (organizationId: string) => Promise<string | null>;
}

const DEFAULT_LEASE_MS = 120_000;

// ── Error de negocio interno ──────────────────────────────────────

class DeliverDteBusinessError extends Error {
  errorCode?: string;
  constructor(message: string, errorCode?: string) {
    super(message);
    this.name = "DeliverDteBusinessError";
    this.errorCode = errorCode;
  }
}

// ── Evidencia previa en DteTransmissionLog (runtime) ──────────────

const UNCERTAIN_LEGACY_PATTERN =
  /timeout|ETIMEDOUT|ECONNRESET|PROTOCOL_CONNECTION_LOST|PROTOCOL_SEQUENCE_TIMEOUT|Respuesta inesperada/i;
const UNCERTAIN_LEGACY_CODES = new Set(["INSERT_UNCERTAIN", "UNEXPECTED_RESULT", "NO_ROWS_AFFECTED"]);

export interface LegacyDeliveryEvidence {
  delivered: boolean;
  uncertain: boolean;
}

export async function readLegacyDeliveryEvidence(
  client: Pick<PrismaClient, "dteTransmissionLog">,
  dteDocumentId: string,
): Promise<LegacyDeliveryEvidence> {
  const logs = await client.dteTransmissionLog.findMany({
    where:   { dte_document_id: dteDocumentId, operation_type: "EXTERNAL_DELIVERY" },
    select:  { response_body: true, error_message: true },
    orderBy: { created_at: "asc" },
  });

  let delivered = false;
  let uncertain = false;
  for (const log of logs ?? []) {
    const body = (log.response_body ?? {}) as Record<string, unknown>;
    // Logs escritos bajo el ledger (con jobId) ya están gobernados por su
    // fila: el ledger es la fuente de verdad (incluida la conciliación).
    if (typeof body["jobId"] === "string" && body["jobId"]) continue;
    if (body["ok"] === true && (typeof body["affectedRows"] !== "number" || (body["affectedRows"] as number) >= 1 || body["outcome"] === "DUPLICATE")) {
      delivered = true;
      continue;
    }
    // Logs nuevos traen `outcome` explícito; los anteriores al ledger se
    // clasifican de forma conservadora por código/mensaje.
    if (typeof body["outcome"] === "string") {
      if (body["outcome"] === "UNCERTAIN") uncertain = true;
      continue;
    }
    const code = typeof body["errorCode"] === "string" ? body["errorCode"] : "";
    if (UNCERTAIN_LEGACY_CODES.has(code) || UNCERTAIN_LEGACY_PATTERN.test(log.error_message ?? "")) {
      uncertain = true;
    }
  }
  return { delivered, uncertain: uncertain && !delivered };
}

function blockedResultForJob(job: ExternalDeliveryJob, targetTable: string | null): DeliverDteToExternalDbResult | null {
  switch (job.status) {
    case "DELIVERED":
    case "RECONCILED_DELIVERED":
      return { ok: false, error: "Este DTE ya fue entregado a MariaDB para esta organización y ambiente; no se vuelve a insertar.", targetTable, errorCode: "ALREADY_DELIVERED", jobId: job.id };
    case "IN_PROGRESS":
      return { ok: false, error: "Ya hay una entrega en curso para este DTE. Espere el resultado.", targetTable, errorCode: "DELIVERY_IN_PROGRESS", jobId: job.id };
    case "UNCERTAIN":
      return { ok: false, error: "La entrega anterior tuvo resultado incierto (el destino pudo haber guardado el DTE). Requiere conciliación con el receptor antes de reenviar.", targetTable, errorCode: "REQUIRES_RECONCILIATION", jobId: job.id };
    case "CANCELLED":
      return { ok: false, error: "La entrega externa de este DTE fue cancelada administrativamente.", targetTable, errorCode: "CANCELLED", jobId: job.id };
    default:
      return null;
  }
}

async function defaultGetOrganizationTenantId(organizationId: string): Promise<string | null> {
  const org = await controlPlanePrisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: { tenant_id: true },
  });
  return org?.tenant_id ?? null;
}

// ── Función principal ─────────────────────────────────────────────

export async function deliverDteToExternalDb(
  params: DeliverDteToExternalDbParams,
  deps: DeliverDteToExternalDbDeps = {},
): Promise<DeliverDteToExternalDbResult> {
  const { dteDocumentId, userId, tenantId, locationId, client = prisma, organizationId, allowLegacyEnvFallback } = params;
  const trigger = params.trigger ?? "MANUAL";
  const now     = deps.now ?? (() => new Date());

  const destination = await resolveExternalDteMariaDbDestination({ organizationId, allowLegacyEnvFallback, tenantId });

  if (destination.status === "NOT_CONFIGURED") {
    return {
      ok:          false,
      error:       "Esta organización no tiene configurada la entrega externa a MariaDB.",
      targetTable: null,
      errorCode:   "NOT_CONFIGURED",
    };
  }
  if (destination.status === "DISABLED") {
    return {
      ok:          false,
      error:       "La entrega externa a MariaDB está deshabilitada para esta organización.",
      targetTable: null,
      errorCode:   "DISABLED",
    };
  }
  if (destination.status === "TENANT_MISMATCH") {
    return {
      ok:          false,
      error:       "No se pudo verificar que el destino MariaDB pertenezca al tenant del documento. Entrega bloqueada.",
      targetTable: null,
      errorCode:   "ORG_TENANT_MISMATCH",
    };
  }

  const config  = destination.config;
  const adapter = deps.adapter ?? new ExternalDteMariaDbAdapter();

  try {
    // 1. Documento con scope tenant/location.
    const dteDoc = await client.dteOutgoingDocument.findFirst({
      where:  { id: dteDocumentId, tenant_id: tenantId, location_id: locationId },
      select: {
        id: true, tenant_id: true, location_id: true, sale_id: true, purchase_id: true,
        dte_type_code: true, control_number: true, generation_code: true, environment: true,
        dte_status: true, accepted_at: true, json_document: true, signed_jws: true,
        reception_stamp: true, mh_response: true, retry_count: true,
      },
    });

    if (!dteDoc) {
      throw new DeliverDteBusinessError("El documento DTE no existe o no pertenece a la location activa.");
    }

    // 2. Payload externo (valida elegibilidad: ACCEPTED + sello + firma).
    const doc: DteDocumentForExternalPayload = {
      id: dteDoc.id, tenant_id: dteDoc.tenant_id, location_id: dteDoc.location_id,
      sale_id: dteDoc.sale_id, purchase_id: dteDoc.purchase_id, dte_type_code: dteDoc.dte_type_code,
      control_number: dteDoc.control_number, generation_code: dteDoc.generation_code,
      environment: dteDoc.environment, dte_status: dteDoc.dte_status, accepted_at: dteDoc.accepted_at,
      json_document: dteDoc.json_document, signed_jws: dteDoc.signed_jws,
      reception_stamp: dteDoc.reception_stamp, mh_response: dteDoc.mh_response,
    };

    const buildResult = buildExternalDtePayload(doc);
    if (!buildResult.ok) {
      throw new DeliverDteBusinessError(buildResult.error);
    }

    const legacy = await readLegacyDeliveryEvidence(client, dteDocumentId);

    // 3. Ledger (solo destino por ORGANIZACIÓN).
    let job: ExternalDeliveryJob | null = null;
    let ledger: ExternalDeliveryLedger | null = null;
    const owner = `${trigger}:${randomUUID()}`;

    if (destination.source === "ORGANIZATION" && organizationId) {
      const orgTenantId = await (deps.getOrganizationTenantId ?? defaultGetOrganizationTenantId)(organizationId);
      if (!orgTenantId || orgTenantId !== tenantId) {
        throw new DeliverDteBusinessError(
          "La organización del destino MariaDB no corresponde al tenant del documento. Entrega bloqueada.",
          "ORG_TENANT_MISMATCH",
        );
      }

      ledger = deps.ledger ?? getExternalDeliveryLedger();
      job = await ledger.ensureJob({
        organizationId, tenantId, locationId,
        environment:    dteDoc.environment,
        dteDocumentId,
        generationCode: dteDoc.generation_code,
        trigger,
        userId,
        destination: { integrationId: destination.integrationId ?? null, host: config.host, database: config.database, table: config.table },
      });

      const blocked = blockedResultForJob(job, config.table || null);
      if (blocked) return blocked;

      if (legacy.delivered) {
        await ledger.markDeliveredFromLegacyEvidence(job.id, "Entrega previa registrada en DteTransmissionLog (anterior al ledger).", now());
        return { ok: false, error: "Este DTE ya tiene una entrega MariaDB exitosa registrada; no se vuelve a insertar.", targetTable: config.table || null, errorCode: "ALREADY_DELIVERED", jobId: job.id };
      }
      if (legacy.uncertain) {
        await ledger.markUncertainFromLegacyEvidence(job.id, "Intento previo con resultado incierto en DteTransmissionLog.", now());
        return { ok: false, error: "Hay un intento previo con resultado incierto. Requiere conciliación con el receptor antes de reenviar.", targetTable: config.table || null, errorCode: "REQUIRES_RECONCILIATION", jobId: job.id };
      }

      const claimed = await ledger.claim(job.id, { owner, leaseMs: deps.leaseMs ?? DEFAULT_LEASE_MS, now: now(), manual: trigger === "MANUAL" });
      if (!claimed) {
        const current = (await ledger.get(job.id)) ?? job;
        const blockedNow = blockedResultForJob(current, config.table || null);
        if (blockedNow) return blockedNow;
        const maxed = current.attempts >= current.max_attempts;
        return {
          ok:          false,
          error:       maxed
            ? "Se alcanzó el máximo de intentos automáticos; reintente manualmente tras revisar el destino."
            : "Reintento programado; todavía no corresponde un nuevo intento automático.",
          targetTable: config.table || null,
          errorCode:   maxed ? "MAX_ATTEMPTS_REACHED" : "RETRY_SCHEDULED",
          jobId:       current.id,
        };
      }
      job = claimed;
    } else {
      // Flujo legado sin organización: misma defensa contra duplicados
      // basada en la evidencia del runtime (no hay ledger sin organización).
      if (legacy.delivered) {
        return { ok: false, error: "Este DTE ya tiene una entrega MariaDB exitosa registrada; no se vuelve a insertar.", targetTable: config.table || null, errorCode: "ALREADY_DELIVERED", jobId: null };
      }
      if (legacy.uncertain) {
        return { ok: false, error: "Hay un intento previo con resultado incierto. Requiere conciliación con el receptor antes de reenviar.", targetTable: config.table || null, errorCode: "REQUIRES_RECONCILIATION", jobId: null };
      }
    }

    // 4. INSERT externo.
    const deliveryResult = await adapter.insert(config, buildResult.payload);
    const attemptNumber  = job ? job.attempts : dteDoc.retry_count + 1;
    const at = now();

    // 5. Ledger primero (fuente de verdad anti-duplicado).
    if (ledger && job) {
      if (deliveryResult.ok) {
        await ledger.markDelivered(job.id, owner, {
          insertId:     deliveryResult.insertId?.toString() ?? null,
          affectedRows: deliveryResult.affectedRows,
          note:         deliveryResult.outcome === "DUPLICATE" ? "El receptor reportó clave duplicada: el documento ya existía." : null,
          now:          at,
        });
      } else if (deliveryResult.outcome === "NOT_INSERTED") {
        await ledger.markFailedRetryable(job.id, owner, {
          code: deliveryResult.errorCode ?? "INSERT_FAILED", message: deliveryResult.error,
          nextAttemptAt: computeNextAttemptAt(at, job.attempts), now: at,
        });
      } else {
        // UNCERTAIN o resultado sin clasificar: nunca reintentar a ciegas.
        await ledger.markUncertain(job.id, owner, {
          code: deliveryResult.errorCode ?? "INSERT_UNCERTAIN", message: deliveryResult.error, now: at,
        });
      }
    }

    // 6. Log en runtime — metadatos únicamente. Un fallo aquí no debe
    //    provocar un reintento del INSERT: el ledger ya registró el resultado.
    try {
      if (deliveryResult.ok) {
        await client.dteTransmissionLog.create({
          data: {
            dte_document_id: dteDocumentId,
            attempt_number:  attemptNumber,
            operation_type:  "EXTERNAL_DELIVERY",
            request_url:     `mariadb://${config.host}:${config.port}/${deliveryResult.targetDatabase}/${deliveryResult.targetTable}`,
            http_status:     null,
            error_message:   null,
            response_body:   {
              ok:               true,
              outcome:          deliveryResult.outcome ?? "CONFIRMED",
              insertId:         deliveryResult.insertId?.toString() ?? null,
              affectedRows:     deliveryResult.affectedRows,
              targetTable:      deliveryResult.targetTable,
              targetDatabase:   deliveryResult.targetDatabase,
              tipoDte:          dteDoc.dte_type_code,
              numeroControl:    dteDoc.control_number,
              codigoGeneracion: dteDoc.generation_code,
              deliveredBy:      userId,
              trigger,
              jobId:            job?.id ?? null,
            },
          },
        });
      } else {
        await client.dteTransmissionLog.create({
          data: {
            dte_document_id: dteDocumentId,
            attempt_number:  attemptNumber,
            operation_type:  "EXTERNAL_DELIVERY",
            request_url:     `mariadb://${config.host}:${config.port}/${config.database}/${config.table}`,
            http_status:     null,
            error_message:   deliveryResult.error,
            response_body:   {
              ok:               false,
              outcome:          deliveryResult.outcome ?? "UNCERTAIN",
              errorCode:        deliveryResult.errorCode ?? null,
              targetTable:      config.table || null,
              targetDatabase:   config.database || null,
              tipoDte:          dteDoc.dte_type_code,
              numeroControl:    dteDoc.control_number,
              codigoGeneracion: dteDoc.generation_code,
              trigger,
              jobId:            job?.id ?? null,
            },
          },
        });
      }
    } catch (logErr) {
      console.error(
        `[external-delivery] No se pudo registrar DteTransmissionLog para ${dteDocumentId} (job=${job?.id ?? "legacy"}): ` +
        (logErr instanceof Error ? logErr.name : "error"),
      );
    }

    if (deliveryResult.ok) {
      return {
        ok:           true,
        insertId:     deliveryResult.insertId,
        affectedRows: deliveryResult.affectedRows,
        targetTable:  deliveryResult.targetTable,
        jobId:        job?.id ?? null,
      };
    }

    const uncertain = deliveryResult.outcome !== "NOT_INSERTED";
    return {
      ok:          false,
      error:       uncertain
        ? `${deliveryResult.error} — Resultado incierto: no se reintentará automáticamente; requiere conciliación.`
        : deliveryResult.error,
      targetTable: config.table || null,
      errorCode:   uncertain ? "UNCERTAIN" : deliveryResult.errorCode,
      jobId:       job?.id ?? null,
    };

  } catch (error) {
    if (error instanceof DeliverDteBusinessError) {
      return {
        ok:          false,
        error:       error.message,
        targetTable: config.table || null,
        errorCode:   error.errorCode,
      };
    }
    throw error;
  }
}
