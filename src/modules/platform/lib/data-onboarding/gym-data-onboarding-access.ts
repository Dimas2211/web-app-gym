// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — gym-data-onboarding-access.ts
//
// GYM-ONBOARDING. Acceso efectivo de la organización DESTINO a los
// datasets GYM del Data Onboarding Center (gym_clients, gym_trainers).
// Server-first: lo consumen la página (visibilidad), la ruta de
// plantillas, el preview y el pipeline de import — nunca solo la UI.
//
// Reglas (mismas fuentes que la superficie GYM del runtime):
// - gym_clients  → vertical GYM efectiva (no existe module code
//                  "gym.clients"; ver effective-vertical.ts).
// - gym_trainers → vertical GYM efectiva + módulo gym.trainers.
// - Modalidad PERSONALIZED/GROUP en gym_clients → gym.classes (mismo
//   requisito que createClientAction).
// Configuración comercial = Control Plane, resuelta por tenant_id de
// PlatformOrganization (nunca de la sesión del super_admin).
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[gym-data-onboarding-access] Módulo server-only. No usar en contexto de navegador.",
  );
}

import {
  resolveCommercialEnforcementContext,
  hasOrganizationModule,
  type CommercialEnforcementContext,
} from "../../runtime/commercial-enforcement";
import { resolveEffectiveVerticalCode, hasEffectiveVertical } from "../../runtime/effective-vertical";
import type { DataOnboardingGymAccess } from "../../types/platform.types";

export const GYM_VERTICAL_CODE = "GYM";

export const GYM_ONBOARDING_VERTICAL_REQUIRED_MESSAGE =
  "La organización destino no opera la vertical GYM. Los datos de gimnasio no están disponibles para esta organización.";
export const GYM_ONBOARDING_TRAINERS_MODULE_REQUIRED_MESSAGE =
  "El módulo de entrenadores (gym.trainers) no está habilitado para la organización destino.";

export async function resolveDataOnboardingGymAccessFromContext(
  commercialCtx: CommercialEnforcementContext,
): Promise<DataOnboardingGymAccess> {
  const verticalCode = await resolveEffectiveVerticalCode(commercialCtx);
  const gymVerticalEnabled = hasEffectiveVertical(commercialCtx, verticalCode, GYM_VERTICAL_CODE);
  return {
    gymVerticalEnabled,
    trainersModuleEnabled: gymVerticalEnabled && hasOrganizationModule(commercialCtx, "gym.trainers"),
    classesModuleEnabled:  gymVerticalEnabled && hasOrganizationModule(commercialCtx, "gym.classes"),
  };
}

/** Puede lanzar CommercialEnforcementError (Control Plane inaccesible) — el caller decide el mensaje. */
export async function resolveDataOnboardingGymAccess(tenantId: string): Promise<DataOnboardingGymAccess> {
  return resolveDataOnboardingGymAccessFromContext(await resolveCommercialEnforcementContext(tenantId));
}

export const NO_GYM_ACCESS: DataOnboardingGymAccess = {
  gymVerticalEnabled:    false,
  trainersModuleEnabled: false,
  classesModuleEnabled:  false,
};

/**
 * Solo para VISIBILIDAD de la sección GYM en la página: ante cualquier
 * error del Control Plane se oculta la sección (fail-closed). Las actions
 * y rutas vuelven a verificar el acceso por su cuenta.
 */
export async function resolveDataOnboardingGymAccessForDisplay(tenantId: string): Promise<DataOnboardingGymAccess> {
  try {
    return await resolveDataOnboardingGymAccess(tenantId);
  } catch {
    return NO_GYM_ACCESS;
  }
}

/** Decisión pura: ¿se permite operar `datasetKey` GYM con este acceso? */
export function evaluateGymDataOnboardingAccess(
  access: DataOnboardingGymAccess,
  datasetKey: "gym_clients" | "gym_trainers",
): { allowed: true } | { allowed: false; reason: string } {
  if (!access.gymVerticalEnabled) {
    return { allowed: false, reason: GYM_ONBOARDING_VERTICAL_REQUIRED_MESSAGE };
  }
  if (datasetKey === "gym_trainers" && !access.trainersModuleEnabled) {
    return { allowed: false, reason: GYM_ONBOARDING_TRAINERS_MODULE_REQUIRED_MESSAGE };
  }
  return { allowed: true };
}
