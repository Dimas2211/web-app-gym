"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale.actions.ts
//
// F3-C21 — Server actions del módulo comercial FEX 11
// (/dashboard/sales/export).
//
// Reglas:
//   - requireAdmin en toda action.
//   - tenant_id y location_id siempre desde sesión.
//   - FEX 11 solo opera si DTE_FEX11_ENABLED o DTE_FEX11_TEST_ENABLED
//     está activo, y solo en ambiente TEST (isFex11Enabled()).
//   - No se firma, transmite ni entrega a MariaDB aquí — eso ocurre
//     en las actions ya existentes (generateFexJsonForSaleAction,
//     signDteDocumentAction, transmitDteDocumentAction,
//     deliverDteToExternalDbAction), reutilizadas sin cambios.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { isFex11Enabled }         from "../../../dte/utils/fex11-feature-guard";
import { searchForeignCustomers, type ForeignCustomerLookup } from "../queries/search-foreign-customers";
import { searchExportProducts, type ExportProductLookup }     from "../queries/search-export-products";
import { getUnitMhContext, type UnitMhContext }                from "../queries/get-unit-mh-context";
import {
  createForeignCustomer,
  createExportSale,
  configureUnitMhCode,
  type CreateForeignCustomerResult,
  type CreateExportSaleResult,
  type ConfigureUnitMhCodeResult,
} from "../services/export-sale.service";
import { createForeignCustomerSchema, createExportSaleSchema } from "../schemas/export-sale.schemas";
import type { CreateForeignCustomerInput, CreateExportSaleInput } from "../schemas/export-sale.schemas";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// Bloque B — guard central único: cubre las 6 actions exportadas de este
// archivo (todas llaman requireExportSession antes de operar).
async function requireExportSession() {
  if (!isFex11Enabled()) {
    return { error: "FEX 11 no está habilitada. Active DTE_FEX11_ENABLED o DTE_FEX11_TEST_ENABLED en ambiente TEST." };
  }

  const sessionUser = await requireAdmin();
  const tenant_id    = sessionUser.tenant_id;
  const location_id  = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "La sesión no tiene una location activa." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.sales");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  return { tenant_id, location_id, user_id: sessionUser.id };
}

function isSession(v: { error: string } | { tenant_id: string; location_id: string; user_id: string }):
  v is { tenant_id: string; location_id: string; user_id: string } {
  return "tenant_id" in v;
}

// ── Buscar clientes extranjeros ───────────────────────────────────

export async function searchForeignCustomersAction(
  search: string,
): Promise<{ ok: true; items: ForeignCustomerLookup[] } | { ok: false; error: string }> {
  const session = await requireExportSession();
  if (!isSession(session)) return { ok: false, error: session.error };

  const items = await searchForeignCustomers(session.tenant_id, search);
  return { ok: true, items };
}

// ── Buscar productos exportables ──────────────────────────────────

export async function searchExportProductsAction(
  search: string,
): Promise<{ ok: true; items: ExportProductLookup[] } | { ok: false; error: string }> {
  const session = await requireExportSession();
  if (!isSession(session)) return { ok: false, error: session.error };

  const items = await searchExportProducts(session.tenant_id, session.location_id, search);
  return { ok: true, items };
}

// ── Configurar unidad MH (CAT-014) para un producto/servicio ──────
//
// F3-C23E — Salida operativa desde el propio flujo de venta cuando
// un producto/servicio no tiene UnitOfMeasure.mh_unit_code: el
// usuario elige un código válido de CAT-014 y queda asignado sin
// salir de /dashboard/sales/export.

export async function getUnitMhContextAction(
  unit_id: string,
): Promise<{ ok: true; context: UnitMhContext } | { ok: false; error: string }> {
  const session = await requireExportSession();
  if (!isSession(session)) return { ok: false, error: session.error };

  const context = await getUnitMhContext(session.tenant_id, unit_id);
  if (!context) return { ok: false, error: "La unidad de medida no existe." };
  return { ok: true, context };
}

export async function configureExportUnitMhCodeAction(
  unit_id: string,
  mh_code: string,
): Promise<ConfigureUnitMhCodeResult> {
  const session = await requireExportSession();
  if (!isSession(session)) return { ok: false, error: session.error };

  const result = await configureUnitMhCode(unit_id, mh_code);
  if (result.ok) revalidatePath("/dashboard/sales/export");
  return result;
}

// ── Crear cliente extranjero (alta rápida) ────────────────────────

export async function createForeignCustomerAction(
  input: CreateForeignCustomerInput,
): Promise<CreateForeignCustomerResult> {
  const session = await requireExportSession();
  if (!isSession(session)) return { ok: false, error: session.error };

  const parsed = createForeignCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos de cliente no válidos." };
  }

  const result = await createForeignCustomer(session.tenant_id, session.user_id, parsed.data);

  if (result.ok) {
    revalidatePath("/dashboard/sales/export");
  }

  return result;
}

// ── Crear venta de exportación completa ───────────────────────────

export async function createExportSaleAction(
  input: CreateExportSaleInput,
): Promise<CreateExportSaleResult> {
  const session = await requireExportSession();
  if (!isSession(session)) return { ok: false, error: session.error };

  const parsed = createExportSaleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok:    false,
      error: "Datos de venta de exportación no válidos.",
      errors: parsed.error.issues.map((i) => i.message),
    };
  }

  const result = await createExportSale(session.tenant_id, session.location_id, session.user_id, parsed.data);

  if (result.ok) {
    revalidatePath("/dashboard/sales/export");
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/dte/outgoing");
  }

  return result;
}
