// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — gym-template-access.ts
//
// GYM-ONBOARDING. Guard de las rutas de descarga de plantillas: las
// plantillas GYM solo se entregan si la organización (por su tenant_id del
// Control Plane) opera la vertical GYM — y gym.trainers para Entrenadores.
// Los datasets Commerce no pasan por aquí (contrato histórico intacto).
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[gym-template-access] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { NextResponse } from "next/server";
import { CommercialEnforcementError } from "../../runtime/commercial-enforcement";
import { isGymDataOnboardingDataset } from "./data-onboarding-definitions";
import {
  resolveDataOnboardingGymAccess,
  evaluateGymDataOnboardingAccess,
} from "./gym-data-onboarding-access";

/** null = permitido (o dataset no GYM); si no, la respuesta de error a devolver. */
export async function denyGymTemplateIfNotAllowed(
  datasetKey: string,
  tenantId:   string | null,
): Promise<NextResponse | null> {
  if (!isGymDataOnboardingDataset(datasetKey)) return null;

  if (!tenantId) {
    return NextResponse.json({ error: "La organización no tiene tenant asignado." }, { status: 409 });
  }

  let access;
  try {
    access = await resolveDataOnboardingGymAccess(tenantId);
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }

  const decision = evaluateGymDataOnboardingAccess(access, datasetKey);
  return decision.allowed ? null : NextResponse.json({ error: decision.reason }, { status: 403 });
}
