// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-fiscal-metering.service.ts
//
// FASE IV-A — motor de reserva/consumo/liberación de
// fiscal.dte.monthly_issued. Ver docs/modules/platform-phase-4-dte-monthly-metering.md
// para la política comercial completa (auditoría previa a esta
// implementación).
//
// Responsabilidad única: resolver la carrera de concurrencia entre el
// check de capacidad y la llamada HTTP a MH, sin mantener una
// transacción SQL abierta durante esa llamada. NO es la fuente de
// verdad fiscal — DteOutgoingDocument sigue siéndolo. Este servicio
// solo gestiona el ledger DteFiscalMeteringReservation.
//
// Máquina de estados (una fila por dte_document_id, UNIQUE):
//   (sin fila)  --reserveDteFiscalCapacity-->            PENDING
//   PENDING     --reserveDteFiscalCapacity (retry)-->    PENDING   (idempotente, no vuelve a contar)
//   PENDING     --finalizeDteFiscalCapacityConsumed-->   CONSUMED
//   PENDING     --releaseDteFiscalCapacity-->             RELEASED
//   RELEASED    --reserveDteFiscalCapacity (reopen)-->   PENDING   (misma fila, period_key/reserved_at nuevos)
//   CONSUMED    --reserveDteFiscalCapacity-->             CONSUMED  (idempotente, no reintenta)
// ─────────────────────────────────────────────────────────────────

import { Prisma, type PrismaClient } from "@prisma/client";
import {
  assertCapacityAvailable,
  getCapacityStatus,
} from "@/modules/platform/runtime/commercial-enforcement/capacity-engine";
import {
  CommercialEnforcementError,
  type CommercialEnforcementContext,
  type CommercialErrorCode,
} from "@/modules/platform/runtime/commercial-enforcement/types";
import { resolveDteMonthlyPeriodKey } from "../utils/dte-fiscal-period.util";

export const DTE_MONTHLY_ENTITLEMENT_CODE = "fiscal.dte.monthly_issued";

type RuntimeDb = PrismaClient | Prisma.TransactionClient;

// ── Token de metering ──────────────────────────────────────────────
//
// Devuelto por reserveDteFiscalCapacity y consumido por
// finalize/release. Al capturar explícitamente el "modo" resuelto en
// el momento de reservar, finalize/release nunca necesitan re-derivar
// TEST/LEGACY/entitlement — evitan así cualquier divergencia entre lo
// que se decidió al reservar y lo que se decidiría después.

export type DteMeteringToken =
  | { mode: "BYPASS_TEST" }
  | { mode: "BYPASS_LEGACY_UNMANAGED" }
  | { mode: "ALREADY_CONSUMED"; reservationId: string }
  | { mode: "RESERVED"; reservationId: string; periodKey: string };

export interface ReserveDteFiscalCapacityParams {
  dteDocumentId: string;
  tenantId: string;
  environment: "TEST" | "PRODUCTION";
  commercialCtx: CommercialEnforcementContext;
  runtimeDb: PrismaClient;
  userId?: string | null;
  /** Inyectable para tests — default `new Date()`. */
  now?: Date;
  /** Reintentos adicionales ante conflicto de serialización (P2034). Default 2, igual que withCapacityCheckedTransaction. */
  maxRetries?: number;
}

export type ReserveDteFiscalCapacityResult =
  | { ok: true; token: DteMeteringToken }
  | { ok: false; code: CommercialErrorCode; error: string };

function isSerializationConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2034" || err.meta?.["code"] === "40001")
  );
}

function isUniqueConstraintOnDteDocumentId(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = err.meta?.["target"];
  if (Array.isArray(target)) return target.includes("dte_document_id");
  if (typeof target === "string") return target.includes("dte_document_id");
  return false;
}

/**
 * Reserva (o reutiliza/reabre) una unidad de fiscal.dte.monthly_issued
 * para `dteDocumentId`. Debe llamarse UNA vez, inmediatamente antes de
 * la primera transmisión real a MH (transmit-dte-document.service.ts) —
 * nunca en createPending/generate/sign, y nunca dentro de la misma
 * transacción que hace la llamada HTTP a MH.
 *
 * Reglas de bypass (no crean fila de ledger):
 *   - environment === "TEST": TEST nunca consume ni reserva.
 *   - commercialCtx.mode === "LEGACY_UNMANAGED": bypass explícito de
 *     compatibilidad, igual que el resto del Commercial Enforcement —
 *     nunca se finge "Unlimited".
 *
 * MANAGED + PRODUCTION siempre pasa por el ledger, incluso si el
 * entitlement efectivo es Unlimited — Unlimited significa "no
 * bloquear", NO "no medir" (ver política comercial).
 */
export async function reserveDteFiscalCapacity(
  params: ReserveDteFiscalCapacityParams,
): Promise<ReserveDteFiscalCapacityResult> {
  const {
    dteDocumentId,
    tenantId,
    environment,
    commercialCtx,
    runtimeDb,
    userId = null,
    now = new Date(),
    maxRetries = 2,
  } = params;

  // ── Bypass TEST — nunca reserva, nunca cuenta ──────────────────
  if (environment === "TEST") {
    return { ok: true, token: { mode: "BYPASS_TEST" } };
  }

  // ── Bypass LEGACY_UNMANAGED — bypass por modo, no por "unlimited" ──
  if (commercialCtx.mode === "LEGACY_UNMANAGED") {
    return { ok: true, token: { mode: "BYPASS_LEGACY_UNMANAGED" } };
  }

  // ── PRODUCTION + MANAGED — timezone obligatorio, sin fallback ──────
  const periodResult = resolveDteMonthlyPeriodKey(now, commercialCtx.organizationTimezone);
  if (!periodResult.ok) {
    return { ok: false, code: "TIMEZONE_INVALID_OR_MISSING", error: periodResult.error };
  }
  const periodKey = periodResult.periodKey;

  for (let attempt = 0; ; attempt++) {
    try {
      const outcome = await runtimeDb.$transaction(
        async (tx) => {
          const existing = await tx.dteFiscalMeteringReservation.findUnique({
            where: { dte_document_id: dteDocumentId },
          });

          // Idempotencia — retry del mismo documento nunca vuelve a contar.
          if (existing?.status === "PENDING") {
            return { mode: "RESERVED", reservationId: existing.id, periodKey: existing.period_key } as const;
          }
          if (existing?.status === "CONSUMED") {
            return { mode: "ALREADY_CONSUMED", reservationId: existing.id } as const;
          }

          // Sin fila, o RELEASED (reapertura) — ambos requieren checar
          // capacidad fresca dentro de esta misma transacción Serializable.
          await assertCapacityAvailable(DTE_MONTHLY_ENTITLEMENT_CODE, 1, commercialCtx, tx, { periodKey });

          const row = existing
            ? await tx.dteFiscalMeteringReservation.update({
                where: { id: existing.id },
                data: {
                  status: "PENDING",
                  period_key: periodKey,
                  reserved_at: now,
                  resolved_at: null,
                },
              })
            : await tx.dteFiscalMeteringReservation.create({
                data: {
                  tenant_id: tenantId,
                  dte_document_id: dteDocumentId,
                  entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE,
                  period_key: periodKey,
                  status: "PENDING",
                  reserved_at: now,
                  created_by: userId ?? undefined,
                },
              });

          return { mode: "RESERVED", reservationId: row.id, periodKey: row.period_key } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return { ok: true, token: outcome };
    } catch (err) {
      // CommercialEnforcementError (CAPACITY_LIMIT_REACHED / ENTITLEMENT_NOT_CONFIGURED)
      // nunca se reintenta — se propaga tal cual.
      if (err instanceof CommercialEnforcementError) {
        return { ok: false, code: err.code, error: err.userMessage };
      }

      if (isSerializationConflict(err) && attempt < maxRetries) continue;

      // Dos requests concurrentes para el MISMO dteDocumentId: uno gana el
      // create, el otro pierde por el @@unique([dte_document_id]) — se
      // relee y se devuelve la reserva ganadora como éxito idempotente.
      // Solo si el P2002 es realmente sobre esa constraint — cualquier
      // otro P2002 se relanza sin disfrazarlo de éxito.
      if (isUniqueConstraintOnDteDocumentId(err)) {
        const existing = await runtimeDb.dteFiscalMeteringReservation.findUnique({
          where: { dte_document_id: dteDocumentId },
        });
        if (existing?.status === "PENDING") {
          return { ok: true, token: { mode: "RESERVED", reservationId: existing.id, periodKey: existing.period_key } };
        }
        if (existing?.status === "CONSUMED") {
          return { ok: true, token: { mode: "ALREADY_CONSUMED", reservationId: existing.id } };
        }
        // Divergencia real (ej. quedó RELEASED tras la carrera) — no se
        // esconde, se relanza para que el caller falle de forma visible.
        throw err;
      }

      throw err;
    }
  }
}

/**
 * Marca CONSUMED la reserva de `token` — llamar dentro de la MISMA
 * transacción Prisma que ya actualiza DteOutgoingDocument.dte_status a
 * ACCEPTED u OBSERVED. Los bypass (TEST/LEGACY/ALREADY_CONSUMED) son
 * no-op: no hay fila que tocar. Si `token.mode === "RESERVED"` pero la
 * fila ya no está PENDING (0 filas afectadas), lanza — divergencia del
 * ledger que nunca debe esconderse.
 */
export async function finalizeDteFiscalCapacityConsumed(
  tx: Prisma.TransactionClient,
  token: DteMeteringToken,
  now: Date = new Date(),
): Promise<void> {
  if (token.mode !== "RESERVED") return;

  const result = await tx.dteFiscalMeteringReservation.updateMany({
    where: { id: token.reservationId, status: "PENDING" },
    data: { status: "CONSUMED", resolved_at: now },
  });

  if (result.count !== 1) {
    throw new Error(
      `[dte-fiscal-metering] Divergencia de ledger: no se pudo marcar CONSUMED la reserva ${token.reservationId} ` +
        `(se esperaba status PENDING). Requiere revisión manual — no se sobrescribió en silencio.`,
    );
  }
}

/**
 * Marca RELEASED la reserva de `token` — llamar dentro de la MISMA
 * transacción Prisma que ya actualiza DteOutgoingDocument.dte_status a
 * REJECTED. Igual semántica de no-op/divergencia que finalize.
 */
export async function releaseDteFiscalCapacity(
  tx: Prisma.TransactionClient,
  token: DteMeteringToken,
  now: Date = new Date(),
): Promise<void> {
  if (token.mode !== "RESERVED") return;

  const result = await tx.dteFiscalMeteringReservation.updateMany({
    where: { id: token.reservationId, status: "PENDING" },
    data: { status: "RELEASED", resolved_at: now },
  });

  if (result.count !== 1) {
    throw new Error(
      `[dte-fiscal-metering] Divergencia de ledger: no se pudo marcar RELEASED la reserva ${token.reservationId} ` +
        `(se esperaba status PENDING). Requiere revisión manual — no se sobrescribió en silencio.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// Reporting — read-only. Nada aquí escribe el ledger.
// ─────────────────────────────────────────────────────────────────

export interface DteMonthlyMeteringStatus {
  entitlementCode: string;
  periodKey: string | null;
  timezone: string | null;
  consumed: number;
  pending: number;
  occupied: number;
  limit: number | null;
  isUnlimited: boolean;
  configured: boolean;
  remainingForNewIssue: number | null;
  source: string;
}

/**
 * Estado agregado del periodo vigente para reporting/auditoría — NUNCA
 * usado como gate previo a transmit (ese gate vive en
 * reserveDteFiscalCapacity, vía assertCapacityAvailable). Separa
 * explícitamente consumed vs pending para que "137/500" sea siempre
 * trazable a filas reales, nunca un contador opaco.
 */
export async function getDteMonthlyMeteringStatus(
  commercialCtx: CommercialEnforcementContext,
  runtimeDb: RuntimeDb,
  now: Date = new Date(),
): Promise<DteMonthlyMeteringStatus> {
  const entitlementCode = DTE_MONTHLY_ENTITLEMENT_CODE;

  if (commercialCtx.mode === "LEGACY_UNMANAGED") {
    return {
      entitlementCode,
      periodKey: null,
      timezone: null,
      consumed: 0,
      pending: 0,
      occupied: 0,
      limit: null,
      isUnlimited: false,
      configured: false,
      remainingForNewIssue: null,
      source: "LEGACY_UNMANAGED_BYPASS",
    };
  }

  const periodResult = resolveDteMonthlyPeriodKey(now, commercialCtx.organizationTimezone);
  if (!periodResult.ok) {
    return {
      entitlementCode,
      periodKey: null,
      timezone: commercialCtx.organizationTimezone,
      consumed: 0,
      pending: 0,
      occupied: 0,
      limit: null,
      isUnlimited: false,
      configured: false,
      remainingForNewIssue: null,
      source: "TIMEZONE_INVALID_OR_MISSING",
    };
  }
  const periodKey = periodResult.periodKey;

  const [consumed, pending, status] = await Promise.all([
    runtimeDb.dteFiscalMeteringReservation.count({
      where: { tenant_id: commercialCtx.tenantId, entitlement_code: entitlementCode, period_key: periodKey, status: "CONSUMED" },
    }),
    runtimeDb.dteFiscalMeteringReservation.count({
      where: { tenant_id: commercialCtx.tenantId, entitlement_code: entitlementCode, period_key: periodKey, status: "PENDING" },
    }),
    getCapacityStatus(entitlementCode, commercialCtx, runtimeDb, { periodKey }).catch((err) => {
      if (err instanceof CommercialEnforcementError && err.code === "ENTITLEMENT_NOT_CONFIGURED") return null;
      throw err;
    }),
  ]);

  const occupied = consumed + pending;

  if (!status) {
    return {
      entitlementCode,
      periodKey,
      timezone: commercialCtx.organizationTimezone,
      consumed,
      pending,
      occupied,
      limit: null,
      isUnlimited: false,
      configured: false,
      remainingForNewIssue: null,
      source: "UNCONFIGURED",
    };
  }

  return {
    entitlementCode,
    periodKey,
    timezone: commercialCtx.organizationTimezone,
    consumed,
    pending,
    occupied,
    limit: status.isUnlimited ? null : status.limit,
    isUnlimited: status.isUnlimited,
    configured: status.configured,
    // null cuando Unlimited (no aplica límite) o cuando no está configurado
    // (nunca se inventa 0 como si fuera el plan real).
    remainingForNewIssue:
      status.isUnlimited || !status.configured ? null : Math.max(0, (status.limit ?? 0) - occupied),
    source: status.source,
  };
}

export interface DteMonthlyMeteringEntry {
  dteDocumentId: string;
  status: "PENDING" | "CONSUMED" | "RELEASED";
  periodKey: string;
  reservedAt: Date;
  resolvedAt: Date | null;
  dteTypeCode: string;
  controlNumber: string | null;
  generationCode: string | null;
  dteStatus: string;
  environment: string;
  acceptedAt: Date | null;
  observedAt: Date | null;
  invalidatedAt: Date | null;
}

/** Detalle auditable de un periodo — responde "qué documentos forman los 137". Read-only. */
export async function listDteMonthlyMeteringEntries(
  tenantId: string,
  periodKey: string,
  runtimeDb: RuntimeDb,
  statusFilter?: ("PENDING" | "CONSUMED" | "RELEASED")[],
): Promise<DteMonthlyMeteringEntry[]> {
  const rows = await runtimeDb.dteFiscalMeteringReservation.findMany({
    where: {
      tenant_id: tenantId,
      entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE,
      period_key: periodKey,
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
    },
    orderBy: { reserved_at: "asc" },
    select: {
      dte_document_id: true,
      status: true,
      period_key: true,
      reserved_at: true,
      resolved_at: true,
      dte_document: {
        select: {
          dte_type_code: true,
          control_number: true,
          generation_code: true,
          dte_status: true,
          environment: true,
          accepted_at: true,
          observed_at: true,
          invalidated_at: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    dteDocumentId: row.dte_document_id,
    status: row.status,
    periodKey: row.period_key,
    reservedAt: row.reserved_at,
    resolvedAt: row.resolved_at,
    dteTypeCode: row.dte_document.dte_type_code,
    controlNumber: row.dte_document.control_number,
    generationCode: row.dte_document.generation_code,
    dteStatus: row.dte_document.dte_status,
    environment: row.dte_document.environment,
    acceptedAt: row.dte_document.accepted_at,
    observedAt: row.dte_document.observed_at,
    invalidatedAt: row.dte_document.invalidated_at,
  }));
}

/**
 * Lista reservas PENDING — inspección read-only para preparar la
 * futura reconciliación MH (query/consulta de estado). NUNCA cambia
 * PENDING a CONSUMED/RELEASED sin evidencia fiscal real — esta función
 * no escribe nada.
 */
export async function listPendingDteMeteringReservations(
  runtimeDb: RuntimeDb,
  filters?: { tenantId?: string; olderThan?: Date },
): Promise<DteMonthlyMeteringEntry[]> {
  const rows = await runtimeDb.dteFiscalMeteringReservation.findMany({
    where: {
      status: "PENDING",
      ...(filters?.tenantId ? { tenant_id: filters.tenantId } : {}),
      ...(filters?.olderThan ? { reserved_at: { lt: filters.olderThan } } : {}),
    },
    orderBy: { reserved_at: "asc" },
    select: {
      dte_document_id: true,
      status: true,
      period_key: true,
      reserved_at: true,
      resolved_at: true,
      dte_document: {
        select: {
          dte_type_code: true,
          control_number: true,
          generation_code: true,
          dte_status: true,
          environment: true,
          accepted_at: true,
          observed_at: true,
          invalidated_at: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    dteDocumentId: row.dte_document_id,
    status: row.status,
    periodKey: row.period_key,
    reservedAt: row.reserved_at,
    resolvedAt: row.resolved_at,
    dteTypeCode: row.dte_document.dte_type_code,
    controlNumber: row.dte_document.control_number,
    generationCode: row.dte_document.generation_code,
    dteStatus: row.dte_document.dte_status,
    environment: row.dte_document.environment,
    acceptedAt: row.dte_document.accepted_at,
    observedAt: row.dte_document.observed_at,
    invalidatedAt: row.dte_document.invalidated_at,
  }));
}
