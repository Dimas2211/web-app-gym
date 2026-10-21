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

import type { PrismaClient, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import type { RuntimeMode } from "@/modules/platform/runtime/effective-tenant-context";
import type { GymBookingActor } from "../booking/booking-contracts";

// ── Identidad LIVE (auditoría GYM-4 H01) ─────────────────────────
//
// En RUNTIME_CLIENT el JWT puede tener horas de antigüedad: el rol LIVE lo
// revalida la plataforma (context.effectiveRole), pero la sede del JWT no se
// compara con la vigente. Para las lecturas y escrituras de clases:
//  - el rol que autoriza es SIEMPRE el LIVE (nunca sessionUser.role);
//  - si el rol LIVE está acotado a sede (branch_admin / recepción), la sede
//    vigente del usuario (users.branch_id en la base runtime) debe coincidir
//    con la del JWT; si no, falla cerrado y se pide volver a iniciar sesión.
// PLATFORM_NATIVE / SUPPORT_RUNTIME no cambian: su rol efectivo es el del JWT.

const BRANCH_SCOPED_ROLES: ReadonlySet<string> = new Set(["branch_admin", "reception"]);

export const LIVE_IDENTITY_CHANGED_MESSAGE = "Tu rol o tu sede cambiaron. Vuelve a iniciar sesión para continuar.";

/** ¿La sede del JWT sigue siendo la sede LIVE del usuario? Solo se exige en RUNTIME_CLIENT con rol de sede. */
export async function liveLocationMatches(input: {
  runtimeMode: RuntimeMode;
  client: PrismaClient | undefined;
  userId: string;
  role: string;
  locationId: string | null;
}): Promise<boolean> {
  if (input.runtimeMode !== "RUNTIME_CLIENT" || !BRANCH_SCOPED_ROLES.has(input.role)) return true;
  if (!input.client || !input.locationId) return false;
  const live = await input.client.user.findUnique({ where: { id: input.userId }, select: { branch_id: true } });
  return live?.branch_id === input.locationId;
}

export type LiveClassViewer = { ok: true; user: SessionUser } | { ok: false; message: string };

/**
 * Usuario con el que las páginas de clases filtran y autorizan: rol LIVE,
 * tenant efectivo y sede efectiva validada. Sustituye a sessionUser en
 * branchScope, canManageClass y en las banderas de UI.
 */
export async function resolveLiveClassViewer(
  sessionUser: SessionUser,
  context: { tenantId: string; client?: PrismaClient; locationId: string | null; runtimeMode: RuntimeMode; effectiveRole: string }
): Promise<LiveClassViewer> {
  const role = context.effectiveRole;
  if (!getCapabilities(role).canViewOperations) return { ok: false, message: LIVE_IDENTITY_CHANGED_MESSAGE };
  const sameLocation = await liveLocationMatches({
    runtimeMode: context.runtimeMode,
    client: context.client,
    userId: sessionUser.id,
    role,
    locationId: context.locationId,
  });
  if (!sameLocation) return { ok: false, message: LIVE_IDENTITY_CHANGED_MESSAGE };
  return {
    ok: true,
    user: {
      ...sessionUser,
      role: role as UserRole,
      tenant_id: context.tenantId,
      location_id: context.runtimeMode === "SUPPORT_RUNTIME" ? sessionUser.location_id : context.locationId,
    },
  };
}

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
  context: {
    effectiveUser: { id: string; role: string };
    tenantId: string;
    client: PrismaClient | undefined;
    runtimeMode?: RuntimeMode;
    locationId?: string | null;
  },
  opts: { allowAdmin: boolean }
): Promise<SessionOperator> {
  const { id, role } = context.effectiveUser;
  if (role === "trainer") {
    const trainer = await resolveLinkedTrainer(context.client, id, context.tenantId);
    if (!trainer) return { ok: false, error: TRAINER_PROFILE_MISSING_MESSAGE };
    return { ok: true, channel: "TRAINER", actor: { userId: id, role: "trainer" }, trainerId: trainer.id };
  }
  if (opts.allowAdmin && (role === "super_admin" || role === "branch_admin")) {
    // H01: branch_admin opera con la sede del JWT solo si sigue siendo su sede LIVE.
    const sameLocation = await liveLocationMatches({
      runtimeMode: context.runtimeMode ?? "PLATFORM_NATIVE",
      client: context.client,
      userId: id,
      role,
      locationId: context.locationId ?? null,
    });
    if (!sameLocation) return { ok: false, error: LIVE_IDENTITY_CHANGED_MESSAGE };
    return { ok: true, channel: "STAFF", actor: { userId: id, role }, trainerId: null };
  }
  return { ok: false, error: TRAINER_OPERATION_FORBIDDEN_MESSAGE };
}
