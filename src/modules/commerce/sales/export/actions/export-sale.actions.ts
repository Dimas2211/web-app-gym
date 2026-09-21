"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale.actions.ts
//
// F3-C21 — Server actions del módulo comercial FEX 11
// (/dashboard/sales/export).
//
// Reglas:
//   - requireAdmin en toda action.
//   - tenant_id y location_id siempre desde el contexto operacional.
//   - FEX 11 solo opera si DTE_FEX11_ENABLED o DTE_FEX11_TEST_ENABLED
//     está activo, y solo en ambiente TEST (isFex11Enabled()).
//   - No se firma, transmite ni entrega a MariaDB aquí — eso ocurre
//     en las actions ya existentes (generateFexJsonForSaleAction,
//     signDteDocumentAction, transmitDteDocumentAction,
//     deliverDteToExternalDbAction), reutilizadas sin cambios.
//
// FASE VI-E4A: contexto operacional runtime — reemplaza tenant/location
// de sesión + gate comercial manual + Prisma global. RUNTIME_CLIENT opera
// FEX 11 enteramente en su propia DB.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
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
  requireOperationalContext,
  OperationalContextError,
  type OperationalContext,
} from "@/modules/platform/runtime/require-operational-context";

// Bloque B — guard central único: cubre las 6 actions exportadas de este
// archivo (todas llaman requireExportSession antes de operar).
async function requireExportSession(write: boolean):
  Promise<{ context: OperationalContext; dispose: () => Promise<void> } | { error: string }> {
  if (!isFex11Enabled()) {
    return { error: "FEX 11 no está habilitada. Active DTE_FEX11_ENABLED o DTE_FEX11_TEST_ENABLED en ambiente TEST." };
  }

  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.sales", write });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }

  if (!handle.context.locationId) {
    await handle.dispose();
    return { error: "La sesión no tiene una location activa." };
  }

  return handle;
}

function isSession(
  v: { context: OperationalContext; dispose: () => Promise<void> } | { error: string },
): v is { context: OperationalContext; dispose: () => Promise<void> } {
  return "context" in v;
}

// ── Buscar clientes extranjeros ───────────────────────────────────

export async function searchForeignCustomersAction(
  search: string,
): Promise<{ ok: true; items: ForeignCustomerLookup[] } | { ok: false; error: string }> {
  const session = await requireExportSession(false);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    const items = await searchForeignCustomers(context.tenantId, search, 20, context.client);
    return { ok: true, items };
  } finally {
    await dispose();
  }
}

// ── Buscar productos exportables ──────────────────────────────────

export async function searchExportProductsAction(
  search: string,
): Promise<{ ok: true; items: ExportProductLookup[] } | { ok: false; error: string }> {
  const session = await requireExportSession(false);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    const items = await searchExportProducts(context.tenantId, context.locationId!, search, 20, context.client);
    return { ok: true, items };
  } finally {
    await dispose();
  }
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
  const session = await requireExportSession(false);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    const unitContext = await getUnitMhContext(context.tenantId, unit_id, context.client);
    if (!unitContext) return { ok: false, error: "La unidad de medida no existe." };
    return { ok: true, context: unitContext };
  } finally {
    await dispose();
  }
}

export async function configureExportUnitMhCodeAction(
  unit_id: string,
  mh_code: string,
): Promise<ConfigureUnitMhCodeResult> {
  const session = await requireExportSession(true);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    const result = await configureUnitMhCode(unit_id, mh_code, context.client);
    if (result.ok) revalidatePath("/dashboard/sales/export");
    return result;
  } finally {
    await dispose();
  }
}

// ── Crear cliente extranjero (alta rápida) ────────────────────────

export async function createForeignCustomerAction(
  input: CreateForeignCustomerInput,
): Promise<CreateForeignCustomerResult> {
  const session = await requireExportSession(true);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    const parsed = createForeignCustomerSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos de cliente no válidos." };
    }

    const result = await createForeignCustomer(context.tenantId, context.effectiveUser.id, parsed.data, context.client);

    if (result.ok) {
      revalidatePath("/dashboard/sales/export");
    }

    return result;
  } finally {
    await dispose();
  }
}

// ── Crear venta de exportación completa ───────────────────────────

export async function createExportSaleAction(
  input: CreateExportSaleInput,
): Promise<CreateExportSaleResult> {
  const session = await requireExportSession(true);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    const parsed = createExportSaleSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok:    false,
        error: "Datos de venta de exportación no válidos.",
        errors: parsed.error.issues.map((i) => i.message),
      };
    }

    const result = await createExportSale(
      context.tenantId,
      context.locationId!,
      context.effectiveUser.id,
      parsed.data,
      context.client,
    );

    if (result.ok) {
      revalidatePath("/dashboard/sales/export");
      revalidatePath("/dashboard/sales");
      revalidatePath("/dashboard/dte/outgoing");
    }

    return result;
  } finally {
    await dispose();
  }
}
