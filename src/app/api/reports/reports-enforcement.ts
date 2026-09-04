// ─────────────────────────────────────────────────────────────────
// api/reports — reports-enforcement.ts
//
// Bloque B (cierre de cobertura — reporting) — guard central de module
// enforcement para /api/reports/**. Reutiliza TAL CUAL el Commercial
// Enforcement Context y el module guard ya existentes
// (resolveCommercialEnforcementContext, hasOrganizationModule,
// assertOrganizationModule) — no reimplementa precedencia MANAGED vs
// LEGACY_UNMANAGED ni ninguna lógica de bypass nueva.
//
// - assertReportModule: para reportes de UN SOLO dominio funcional.
//   Bloquea el Route Handler completo (la query de negocio NUNCA se
//   ejecuta) si el module code no está habilitado. LEGACY_UNMANAGED
//   sigue permitiendo todo (bypass ya existente en hasOrganizationModule).
//
// - resolveEnabledReportModules: para reportes COMPUESTOS (varios
//   module codes en un mismo endpoint). Resuelve el contexto comercial
//   UNA sola vez y devuelve `isEnabled(code)` para que el propio route
//   handler decida, sección por sección, si ejecuta esa query y si el
//   campo va en la respuesta o se marca como no disponible (null).
//   Nunca exige TODOS los módulos para responder, ni ANY-habilita-TODO.
// ─────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import {
  resolveCommercialEnforcementContext,
  hasOrganizationModule,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export async function assertReportModule(
  tenantId: string,
  moduleCode: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  try {
    const ctx = await resolveCommercialEnforcementContext(tenantId);
    assertOrganizationModule(ctx, moduleCode);
    return { ok: true };
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return {
        ok: false,
        response: NextResponse.json({ error: err.userMessage }, { status: err.httpStatus }),
      };
    }
    throw err;
  }
}

export async function resolveEnabledReportModules(tenantId: string) {
  const ctx = await resolveCommercialEnforcementContext(tenantId);
  return {
    ctx,
    isEnabled: (moduleCode: string) => hasOrganizationModule(ctx, moduleCode),
  };
}
