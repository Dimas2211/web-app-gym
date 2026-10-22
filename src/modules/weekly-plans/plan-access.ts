// ─────────────────────────────────────────────────────────────────
// GYM-5A — autorización de planes semanales de cliente y de sus días.
//
// Un único punto para las acciones de escritura y las lecturas del
// entrenador/administrador:
//  - el rol que autoriza es el LIVE (context.effectiveUser.role);
//  - roles acotados a sede (branch_admin / recepción): la sede del JWT debe
//    seguir siendo la sede vigente del usuario (misma regla que GYM-4 H01);
//  - el plan se resuelve SIEMPRE con tenant_id del contexto;
//  - el día se resuelve por (id, client_weekly_plan_id): un day_id que no
//    pertenezca al plan autorizado equivale a "no encontrado";
//  - el entrenador opera solo planes con ClientWeeklyPlan.trainer_id igual a
//    su perfil Trainer activo (Trainer.user_id = usuario). No usa
//    Client.assigned_trainer_id ni el entrenador de una clase GYM-4.
//
// Ningún identificador del navegador (tenant, entrenador, alumno) autoriza
// por sí mismo.
// ─────────────────────────────────────────────────────────────────

import type { ClientWeeklyPlan, ClientWeeklyPlanDay, PrismaClient, Status } from "@prisma/client";
import { LIVE_IDENTITY_CHANGED_MESSAGE, liveLocationMatches, resolveLinkedTrainer } from "@/modules/classes/trainer/trainer-access";
import type { RuntimeMode } from "@/modules/platform/runtime/effective-tenant-context";

export const PLAN_STAFF_ROLES: ReadonlySet<string> = new Set(["super_admin", "branch_admin", "reception", "trainer"]);

/** Roles que registran ejecuciones y retroalimentación del entrenamiento. */
export const PLAN_TRAINING_ROLES: ReadonlySet<string> = new Set(["super_admin", "branch_admin", "trainer"]);

export interface PlanAccessContext {
  effectiveUser: { id: string; role: string; location_id: string | null };
  tenantId: string;
  locationId: string | null;
  client: PrismaClient;
  runtimeMode: RuntimeMode;
}

export type PlanScope = "admin" | "trainer";

export type PlanAccess =
  | { ok: true; plan: ClientWeeklyPlan; scope: PlanScope; trainerId: string | null }
  | { ok: false; error: string };

export type PlanDayAccess =
  | { ok: true; plan: ClientWeeklyPlan; day: ClientWeeklyPlanDay; scope: PlanScope; trainerId: string | null }
  | { ok: false; error: string };

export const PLAN_NOT_FOUND = "Plan no encontrado.";
export const PLAN_DAY_NOT_FOUND = "Día de plan no encontrado.";
export const PLAN_FORBIDDEN = "Sin permiso para gestionar este plan.";

export interface AuthorizeOptions {
  /** Si se indica, el plan debe estar en uno de estos estados. */
  statuses?: readonly Status[];
  /** Roles LIVE admitidos (por defecto, todos los roles de operación). */
  roles?: ReadonlySet<string>;
}

/** Lee el plan por (id, tenant) y exige alcance real del usuario LIVE. */
export async function authorizePlan(ctx: PlanAccessContext, planId: string, opts: AuthorizeOptions = {}): Promise<PlanAccess> {
  const role = ctx.effectiveUser.role;
  if (!(opts.roles ?? PLAN_STAFF_ROLES).has(role)) return { ok: false, error: PLAN_FORBIDDEN };

  const sameLocation = await liveLocationMatches({
    runtimeMode: ctx.runtimeMode,
    client: ctx.client,
    userId: ctx.effectiveUser.id,
    role,
    locationId: ctx.locationId,
  });
  if (!sameLocation) return { ok: false, error: LIVE_IDENTITY_CHANGED_MESSAGE };

  const plan = await ctx.client.clientWeeklyPlan.findFirst({ where: { id: planId, tenant_id: ctx.tenantId } });
  if (!plan) return { ok: false, error: PLAN_NOT_FOUND };
  if (opts.statuses && !opts.statuses.includes(plan.status)) return { ok: false, error: "El plan no está en un estado que permita esta operación." };

  if (role === "super_admin") return { ok: true, plan, scope: "admin", trainerId: null };
  if (role === "branch_admin" || role === "reception") {
    if (plan.branch_id !== ctx.effectiveUser.location_id) return { ok: false, error: PLAN_FORBIDDEN };
    return { ok: true, plan, scope: "admin", trainerId: null };
  }
  // trainer: perfil activo vinculado + plan asignado a ese perfil + misma sede
  const trainer = await resolveLinkedTrainer(ctx.client, ctx.effectiveUser.id, ctx.tenantId);
  if (!trainer || plan.trainer_id !== trainer.id || plan.branch_id !== trainer.branch_id) return { ok: false, error: PLAN_FORBIDDEN };
  return { ok: true, plan, scope: "trainer", trainerId: trainer.id };
}

/** Como authorizePlan, y además el día debe pertenecer EXACTAMENTE a ese plan. */
export async function authorizePlanDay(
  ctx: PlanAccessContext,
  planId: string,
  dayId: string,
  opts: AuthorizeOptions = {}
): Promise<PlanDayAccess> {
  const access = await authorizePlan(ctx, planId, opts);
  if (!access.ok) return access;
  const day = await ctx.client.clientWeeklyPlanDay.findFirst({ where: { id: dayId, client_weekly_plan_id: access.plan.id } });
  if (!day) return { ok: false, error: PLAN_DAY_NOT_FOUND };
  return { ...access, day };
}
