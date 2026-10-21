// ─────────────────────────────────────────────────────────────────
// GYM-4 — identidad operativa del entrenador.
//
// El entrenador se resuelve SIEMPRE desde la sesión autenticada:
// Trainer.user_id = effectiveUser.id, del tenant efectivo, status active,
// leído en la base runtime (context.client). Nunca un trainerId del
// navegador. El rol es el LIVE (effectiveUser.role / effectiveRole); un
// rol degradado pierde el acceso en la siguiente petición aunque el JWT
// siga vigente.
//
// Este archivo no amplía canManageClass ni requireMembershipManager: el
// entrenador opera solo por el canal TRAINER del motor, que además verifica
// la asignación de la sesión bajo lock.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { GymBookingActor } from "../booking/booking-contracts";

export interface LinkedTrainer {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string;
}

/** Perfil Trainer ACTIVO vinculado al usuario dentro del tenant efectivo (o null). */
export async function resolveLinkedTrainer(
  client: PrismaClient | undefined,
  userId: string,
  tenantId: string
): Promise<LinkedTrainer | null> {
  return (client ?? prisma).trainer.findFirst({
    where: { user_id: userId, tenant_id: tenantId, status: "active" },
    select: { id: true, branch_id: true, first_name: true, last_name: true },
  });
}

export type SessionOperator =
  | { ok: true; channel: "TRAINER"; actor: GymBookingActor; trainerId: string }
  | { ok: true; channel: "STAFF"; actor: GymBookingActor; trainerId: null }
  | { ok: false; error: string };

export const TRAINER_PROFILE_MISSING_MESSAGE =
  "Tu cuenta no tiene un perfil de entrenador activo vinculado. Contacta al administrador.";
export const TRAINER_OPERATION_FORBIDDEN_MESSAGE = "Sin permiso para registrar el entrenamiento de esta clase.";

/**
 * Quién opera el registro de entrenamiento con el rol LIVE:
 *  - trainer → canal TRAINER, con perfil Trainer activo vinculado;
 *  - super_admin / branch_admin → canal STAFF (solo si `allowAdmin`);
 *  - recepción, alumno u otro → rechazo.
 */
export async function resolveSessionOperator(
  context: { effectiveUser: { id: string; role: string }; tenantId: string; client: PrismaClient | undefined },
  opts: { allowAdmin: boolean }
): Promise<SessionOperator> {
  const { id, role } = context.effectiveUser;
  if (role === "trainer") {
    const trainer = await resolveLinkedTrainer(context.client, id, context.tenantId);
    if (!trainer) return { ok: false, error: TRAINER_PROFILE_MISSING_MESSAGE };
    return { ok: true, channel: "TRAINER", actor: { userId: id, role: "trainer" }, trainerId: trainer.id };
  }
  if (opts.allowAdmin && (role === "super_admin" || role === "branch_admin")) {
    return { ok: true, channel: "STAFF", actor: { userId: id, role }, trainerId: null };
  }
  return { ok: false, error: TRAINER_OPERATION_FORBIDDEN_MESSAGE };
}
