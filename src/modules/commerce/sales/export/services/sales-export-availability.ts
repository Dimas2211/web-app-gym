// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — sales-export-availability.ts
//
// FEX11-FINAL-CLOSURE — criterio ÚNICO de disponibilidad de Ventas de
// exportación (FEX 11), compartido por páginas (UI) y server actions.
// FEX 11 es un tipo DTE normal de fiscal.dte:
//
//   disponible = organización con módulo "fiscal.dte"
//                (modelo comercial: Organization override → Plan)
//              AND DteIssuerConfig activo único y válido en la sucursal
//
// El ambiente (TEST / PRODUCTION) sale de DteIssuerConfig.environment y
// queda fijado en DteOutgoingDocument.environment. Sin feature flags,
// sin capability propia, sin dependencia de hostname ni de vertical.
//
// Disponible ≠ documento válido: las reglas FEX (país, receptor, unidad
// CAT-014, régimen, recinto, etc.) siguen validándose al crear/generar.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { PLATFORM_MODULE_CODES } from "@/modules/platform/constants/platform-modules.constants";
import {
  hasOrganizationModule,
  resolveCommercialEnforcementContext,
  type CommercialEnforcementContext,
} from "@/modules/platform/runtime/commercial-enforcement";
import type { Fex11Environment } from "../../../dte/utils/fex11-environment";
import { resolveFex11AvailabilityForLocation } from "./export-sale.service";

export const FEX_ACCESS_MODULE_CODE = PLATFORM_MODULE_CODES.FISCAL_DTE;

/** Mensaje de negocio uniforme cuando la organización no tiene fiscal.dte. */
export const FEX_NOT_AVAILABLE_ERROR =
  "Ventas de exportación no están disponibles: la organización no tiene habilitada la facturación electrónica (DTE).";

/** ¿La organización del contexto comercial tiene fiscal.dte (acceso a FEX)? */
export function hasFexAccess(ctx: CommercialEnforcementContext): boolean {
  return hasOrganizationModule(ctx, FEX_ACCESS_MODULE_CODE);
}

/**
 * UI (páginas): Ventas de exportación disponible para la sucursal solo si
 * la organización tiene fiscal.dte Y existe un emisor DTE activo único
 * válido. Fail-closed.
 */
export async function resolveSalesExportAvailability(
  tenant_id:   string,
  location_id: string,
  db?: PrismaClient,
): Promise<{ enabled: boolean; environment: Fex11Environment | null }> {
  const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
  if (!hasFexAccess(commercialCtx)) return { enabled: false, environment: null };
  return resolveFex11AvailabilityForLocation(tenant_id, location_id, db);
}
