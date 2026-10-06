// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — supervisor-pin.ts
//
// Clave de Supervisor tenant-level. Toda lectura/escritura recibe el
// PrismaClient EFECTIVO del caller (`context.client` de
// requireOperationalContext) — nunca Prisma global — para que en
// RUNTIME_CLIENT / Dedicated Runtime la clave viva y se valide en la
// base runtime del cliente.
//
// Garantías:
//   - solo se persiste el hash bcrypt; el texto claro jamás se guarda,
//     se devuelve ni se loguea;
//   - ninguna función exportada devuelve el hash;
//   - fail closed: sin configuración o sin hash → NOT_CONFIGURED;
//   - anti fuerza bruta: 5 fallos consecutivos bloquean 5 minutos.
// ─────────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { pinFingerprint } from "./grant-token";

if (typeof window !== "undefined") {
  throw new Error("[supervisor-pin] Módulo server-only.");
}

export const SUPERVISOR_PIN_MIN_LENGTH = 6;
export const SUPERVISOR_PIN_MAX_LENGTH = 32;
export const SUPERVISOR_PIN_MAX_FAILED_ATTEMPTS = 5;
export const SUPERVISOR_PIN_LOCK_MINUTES = 5;
const BCRYPT_COST = 10;

const PIN_FORMAT_RE = new RegExp(
  `^\\S{${SUPERVISOR_PIN_MIN_LENGTH},${SUPERVISOR_PIN_MAX_LENGTH}}$`,
);

type Db = Pick<PrismaClient, "tenantSecurityConfig">;

/** Valida formato de una nueva clave + confirmación. Devuelve mensaje de error o null. */
export function validateNewSupervisorPin(pin: string, confirmation: string): string | null {
  if (!pin) return "Ingresa la nueva clave de supervisor.";
  if (!PIN_FORMAT_RE.test(pin)) {
    return `La clave debe tener entre ${SUPERVISOR_PIN_MIN_LENGTH} y ${SUPERVISOR_PIN_MAX_LENGTH} caracteres y no puede contener espacios.`;
  }
  if (pin !== confirmation) return "La confirmación no coincide con la nueva clave.";
  return null;
}

export interface SupervisorPinStatus {
  configured: boolean;
  updatedAt: Date | null;
}

/** Estado público de la clave — NUNCA incluye el hash. */
export async function getSupervisorPinStatus(db: Db, tenantId: string): Promise<SupervisorPinStatus> {
  const row = await db.tenantSecurityConfig.findUnique({
    where: { tenant_id: tenantId },
    select: { supervisor_pin_hash: true, supervisor_pin_updated_at: true },
  });
  return {
    configured: !!row?.supervisor_pin_hash,
    updatedAt: row?.supervisor_pin_hash ? (row.supervisor_pin_updated_at ?? null) : null,
  };
}

/** Establece / cambia / restablece la clave (upsert). Reinicia contadores de bloqueo. */
export async function setSupervisorPin(
  db: Db,
  tenantId: string,
  userId: string,
  pin: string,
  now: Date = new Date(),
): Promise<void> {
  const hash = await bcrypt.hash(pin, BCRYPT_COST);
  await db.tenantSecurityConfig.upsert({
    where: { tenant_id: tenantId },
    create: {
      tenant_id: tenantId,
      supervisor_pin_hash: hash,
      supervisor_pin_updated_at: now,
      supervisor_pin_failed_attempts: 0,
      supervisor_pin_locked_until: null,
      created_by: userId,
      updated_by: userId,
    },
    update: {
      supervisor_pin_hash: hash,
      supervisor_pin_updated_at: now,
      supervisor_pin_failed_attempts: 0,
      supervisor_pin_locked_until: null,
      updated_by: userId,
    },
    select: { id: true },
  });
}

/** Huella de la clave vigente, o null si no hay clave configurada (fail closed). */
export async function getActivePinFingerprint(db: Db, tenantId: string): Promise<string | null> {
  const row = await db.tenantSecurityConfig.findUnique({
    where: { tenant_id: tenantId },
    select: { supervisor_pin_hash: true },
  });
  return row?.supervisor_pin_hash ? pinFingerprint(row.supervisor_pin_hash) : null;
}

export type VerifySupervisorPinResult =
  | { ok: true; fingerprint: string }
  | { ok: false; code: "REQUIRED" | "NOT_CONFIGURED" | "INVALID" | "LOCKED" };

/** Compara la clave recibida con bcrypt contra el hash del tenant en la DB efectiva. */
export async function verifySupervisorPin(
  db: Db,
  tenantId: string,
  pin: string,
  now: Date = new Date(),
): Promise<VerifySupervisorPinResult> {
  if (!pin) return { ok: false, code: "REQUIRED" };

  const row = await db.tenantSecurityConfig.findUnique({
    where: { tenant_id: tenantId },
    select: {
      supervisor_pin_hash: true,
      supervisor_pin_failed_attempts: true,
      supervisor_pin_locked_until: true,
    },
  });

  if (!row?.supervisor_pin_hash) return { ok: false, code: "NOT_CONFIGURED" };

  if (row.supervisor_pin_locked_until && row.supervisor_pin_locked_until > now) {
    return { ok: false, code: "LOCKED" };
  }

  // Longitud fuera de rango → incorrecta, pero igual cuenta como intento.
  const valid = pin.length <= SUPERVISOR_PIN_MAX_LENGTH && (await bcrypt.compare(pin, row.supervisor_pin_hash));

  if (!valid) {
    const attempts = row.supervisor_pin_failed_attempts + 1;
    const lock = attempts >= SUPERVISOR_PIN_MAX_FAILED_ATTEMPTS;
    await db.tenantSecurityConfig.update({
      where: { tenant_id: tenantId },
      data: lock
        ? {
            supervisor_pin_failed_attempts: 0,
            supervisor_pin_locked_until: new Date(now.getTime() + SUPERVISOR_PIN_LOCK_MINUTES * 60_000),
          }
        : { supervisor_pin_failed_attempts: attempts },
      select: { id: true },
    });
    return { ok: false, code: lock ? "LOCKED" : "INVALID" };
  }

  if (row.supervisor_pin_failed_attempts > 0 || row.supervisor_pin_locked_until) {
    await db.tenantSecurityConfig.update({
      where: { tenant_id: tenantId },
      data: { supervisor_pin_failed_attempts: 0, supervisor_pin_locked_until: null },
      select: { id: true },
    });
  }

  return { ok: true, fingerprint: pinFingerprint(row.supervisor_pin_hash) };
}
