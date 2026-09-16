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

import type { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/permissions/guards";
import {
  resolveCommercialEnforcementContext,
  hasOrganizationModule,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";

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

// PASO 6C — Auditoría de aislamiento GYM: /api/reports/** solo se llamaba
// con `user.tenant_id` (el del super_admin autenticado), nunca con el
// tenant EFECTIVO de una sesión runtime "Operar como cliente" — un
// super_admin operando como cliente veía/podía ejecutar reportes contra
// SU PROPIO tenant real en vez del contrato/datos del cliente runtime.
//
// resolveReportApiContext resuelve tenant + PrismaClient EFECTIVOS
// (perfil runtime si hay sesión activa, o el tenant normal del usuario)
// y aplica el module guard sobre ESE MISMO tenant efectivo — nunca
// sobre `baseTenantId` directamente. El caller SIEMPRE debe invocar
// `dispose()` (ideal: try/finally) para cerrar el PrismaClient runtime
// si se abrió uno.
export type ReportApiContext =
  | { ok: true; tenantId: string; client: PrismaClient; dispose: () => Promise<void> }
  | { ok: false; response: NextResponse };

export async function resolveReportApiContext(
  baseTenantId: string,
  moduleCode: string,
  user?: Pick<SessionUser, "id" | "auth_scope" | "organization_id" | "tenant_id" | "location_id" | "role">,
): Promise<ReportApiContext> {
  // FASE VI-D6: `user` se propaga a resolveEffectiveApiContext — antes se
  // omitía y una identidad RUNTIME_CLIENT caía silenciosamente al branch
  // PLATFORM_NATIVO (Prisma global + tenant_id de JWT sin revalidar).
  const { context, dispose } = await resolveEffectiveApiContext({ tenantId: baseTenantId }, user);

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(context.tenantId);
    assertOrganizationModule(commercialCtx, moduleCode);
  } catch (err) {
    await dispose();
    if (err instanceof CommercialEnforcementError) {
      return {
        ok: false,
        response: NextResponse.json({ error: err.userMessage }, { status: err.httpStatus }),
      };
    }
    throw err;
  }

  return { ok: true, tenantId: context.tenantId, client: context.client, dispose };
}

export async function resolveEnabledReportModules(tenantId: string) {
  const ctx = await resolveCommercialEnforcementContext(tenantId);
  return {
    ctx,
    isEnabled: (moduleCode: string) => hasOrganizationModule(ctx, moduleCode),
  };
}
