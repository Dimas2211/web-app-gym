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
//   - Acceso: módulo fiscal.dte de la organización (FEX 11 es un tipo
//     DTE normal). El ambiente fiscal efectivo (TEST/PRODUCTION) sale del
//     DteIssuerConfig activo y se valida en createExportSale.
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
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { hasFexAccess, FEX_NOT_AVAILABLE_ERROR }           from "../services/sales-export-availability";
import { searchForeignCustomers, type ForeignCustomerLookup } from "../queries/search-foreign-customers";
import { searchExportProducts, type ExportProductLookup }     from "../queries/search-export-products";
import { getUnitMhContext, type UnitMhContext }                from "../queries/get-unit-mh-context";
import {
  createForeignCustomer,
  createExportSale,
  configureUnitMhCode,
  updateForeignCustomerCountry,
  type CreateForeignCustomerResult,
  type UpdateForeignCustomerCountryResult,
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

// Alcance de location por action:
//   - "required"       → location del contexto operacional (write paths, sin cambios).
//   - "runtime-active" → lookups de lectura location-scoped: una identidad
//                        RUNTIME_CLIENT tenant-wide (location_id null en JWT)
//                        usa la location activa del selector validada contra
//                        la DB runtime — mismo criterio que
//                        getSaleApiContext({ resolveRuntimeActiveLocation }).
//   - "none"           → lookups tenant-level (clientes, unidades), igual que
//                        GET /api/customers/search: no exigen location.
type ExportLocationScope = "required" | "runtime-active" | "none";

// Bloque B — guard central único: cubre todas las actions exportadas de este
// archivo (todas llaman requireExportSession antes de operar).
async function requireExportSession(write: boolean, locationScope: ExportLocationScope = "required"):
  Promise<{ context: OperationalContext; dispose: () => Promise<void> } | { error: string }> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.sales", write });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }

  if (locationScope === "runtime-active" && !handle.context.locationId &&
      handle.context.runtimeMode === "RUNTIME_CLIENT") {
    const locationId = await getEffectiveLocationId(sessionUser, handle.context.client, handle.context.tenantId);
    handle = { ...handle, context: { ...handle.context, locationId } };
  }

  if (locationScope !== "none" && !handle.context.locationId) {
    await handle.dispose();
    return { error: "La sesión no tiene una location activa." };
  }

  // FEX 11 pertenece a fiscal.dte — mismo criterio que la página
  // (resolveSalesExportAvailability). commercialContext siempre viene
  // resuelto porque se pidió `module`.
  if (!handle.context.commercialContext || !hasFexAccess(handle.context.commercialContext)) {
    await handle.dispose();
    return { error: FEX_NOT_AVAILABLE_ERROR };
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
  const session = await requireExportSession(false, "none");
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
  const session = await requireExportSession(false, "runtime-active");
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
  const session = await requireExportSession(false, "none");
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

// ── Corregir país de un cliente extranjero (CAT-020) ──────────────
//
// FEX-PROD-0B — salida explícita para clientes con código de país legado
// de la versión anterior de FEX: el usuario elige el país CAT-020 vigente.

export async function updateForeignCustomerCountryAction(
  customer_id:  string,
  country_code: string,
): Promise<UpdateForeignCustomerCountryResult> {
  const session = await requireExportSession(true);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    if (typeof customer_id !== "string" || typeof country_code !== "string" || !customer_id || !country_code) {
      return { ok: false, error: "Cliente y país son requeridos." };
    }
    const result = await updateForeignCustomerCountry(
      context.tenantId,
      context.effectiveUser.id,
      customer_id,
      country_code.trim(),
      context.client,
    );
    if (result.ok) revalidatePath("/dashboard/sales/export");
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
