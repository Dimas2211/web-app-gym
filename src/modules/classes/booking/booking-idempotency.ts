// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2A — idempotencia A NIVEL DE COMANDO.
//
// Identificadores (no se mezclan):
//  - idempotencyKey: lo genera el cliente por ORDEN lógica (un clic, un
//    envío de formulario) y lo reenvía en cada reintento.
//  - GymBookingOperation.id: identificador de la OPERACIÓN ejecutada.
//  - ClassBookingEvent.id: un efecto concreto sobre UNA reserva. Una
//    operación puede generar N eventos (cancelSession), únicos por
//    (operation_id, booking_id).
//
// Protocolo obligatorio del servicio de 2B, en UNA transacción:
//  1. SELECT pg_advisory_xact_lock(hashtextextended(idempotencyLockText(tenantId, key), 0)) —
//     PRIMER lock (GYM_BOOKING_LOCK_ORDER[0]). Serializa reintentos
//     concurrentes de la misma orden; se libera solo al terminar la tx.
//  2. SELECT de gym_booking_operations por (tenant_id, idempotency_key) →
//     decideIdempotency(existente, comando, huella):
//       REPLAY   → devolver `result` almacenado, sin efectos ni eventos;
//       CONFLICT → IDEMPOTENCY_KEY_REUSED (misma key, otra orden);
//       EXECUTE  → seguir.
//  3. Resto de locks en orden, efectos, INSERT de la operación con su
//     `result` (append-only: se inserta una sola vez, ya completa) y un
//     ClassBookingEvent por reserva afectada con operation_id. El índice
//     único (tenant_id, idempotency_key) es el respaldo si una ruta omite
//     el paso 1: la segunda transacción falla y no confirma efectos.
//  Rechazos de negocio (SESSION_FULL, etc.) no dejan operación: no tienen
//  efectos, así que un reintento simplemente se reevalúa.
// ─────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import type { GymBookingCommand } from "@prisma/client";
import type { GymBookingErrorCode } from "./booking-contracts";

/** Campos que NO forman parte de la identidad de la orden. */
const NON_IDENTITY_FIELDS = new Set(["idempotencyKey", "now"]);

function canonicalize(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (NON_IDENTITY_FIELDS.has(key)) continue;
    const v = canonicalize((value as Record<string, unknown>)[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** Huella sha256 (hex, 64) del comando canónico; independiente del orden de claves. */
export function commandFingerprint(command: GymBookingCommand, payload: object): string {
  const canonical = JSON.stringify({ command, payload: canonicalize(payload) });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface StoredOperation {
  id: string;
  command: GymBookingCommand;
  request_fingerprint: string;
  result: unknown;
}

export type IdempotencyDecision =
  | { kind: "EXECUTE" }
  | { kind: "REPLAY"; operationId: string; result: unknown }
  | { kind: "CONFLICT"; code: Extract<GymBookingErrorCode, "IDEMPOTENCY_KEY_REUSED"> };

export function decideIdempotency(
  existing: StoredOperation | null,
  command: GymBookingCommand,
  fingerprint: string
): IdempotencyDecision {
  if (!existing) return { kind: "EXECUTE" };
  if (existing.command === command && existing.request_fingerprint === fingerprint) {
    return { kind: "REPLAY", operationId: existing.id, result: existing.result };
  }
  return { kind: "CONFLICT", code: "IDEMPOTENCY_KEY_REUSED" };
}

/**
 * Texto que se pasa a `pg_advisory_xact_lock(hashtextextended($1, 0))`.
 * Incluye el tenant: dos tenants con la misma key no se bloquean entre sí.
 */
export function idempotencyLockText(tenantId: string, idempotencyKey: string): string {
  return `gym_booking_op:${tenantId}:${idempotencyKey}`;
}

const KEY_PATTERN =/^[A-Za-z0-9_\-:.]{8,200}$/;

/** Mismo rango que gym_booking_operations_shape_chk. */
export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === "string" && KEY_PATTERN.test(key);
}
