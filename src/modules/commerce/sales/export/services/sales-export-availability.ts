// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — sales-export-availability.ts
//
// FINAL-RUNTIME-CLOSURE — criterio ÚNICO de disponibilidad de Ventas
// de exportación (FEX 11), compartido por páginas (UI) y server actions:
//
//   disponible = capability por organización "fiscal.dte.export"
//                (modelo comercial: Organization override → Plan)
//              AND flag técnico DTE_FEX11_* del ambiente fiscal efectivo
//              AND emisor DTE activo único válido en la sucursal
//
// Los flags DTE_FEX11_* siguen siendo solo safety gate técnico del
// ambiente (TEST/PRODUCTION) — nunca deciden QUÉ organización accede.
// Sin dependencia de hostname ni de vertical.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { PLATFORM_MODULE_CODES } from "@/modules/platform/constants/platform-modules.constants";
import {
  hasOrganizationModule,
  resolveCommercialEnforcementContext,
  type CommercialEnforcementContext,
} from "@/modules/platform/runtime/commercial-enforcement";
import type { Fex11Environment } from "../../../dte/utils/fex11-feature-guard";
import { resolveFex11AvailabilityForLocation } from "./export-sale.service";

export const FEX_EXPORT_MODULE_CODE = PLATFORM_MODULE_CODES.FISCAL_DTE_EXPORT;

/** ¿La organización del contexto comercial tiene la capability de exportación? */
export function hasFexExportCapability(ctx: CommercialEnforcementContext): boolean {
  return hasOrganizationModule(ctx, FEX_EXPORT_MODULE_CODE);
}

/**
 * UI (páginas): Ventas de exportación disponible para la sucursal solo si
 * la organización tiene la capability Y el ambiente fiscal/emisor lo
 * permiten. Fail-closed.
 */
export async function resolveSalesExportAvailability(
  tenant_id:   string,
  location_id: string,
  db?: PrismaClient,
): Promise<{ enabled: boolean; environment: Fex11Environment | null }> {
  const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
  if (!hasFexExportCapability(commercialCtx)) return { enabled: false, environment: null };
  return resolveFex11AvailabilityForLocation(tenant_id, location_id, db);
}
