// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — supplier.service.ts
//
// Lógica de negocio del maestro de proveedores.
// Sin "use server" — importable desde actions y route handlers.
//
// Operaciones:
//   createSupplier        — alta completa desde el formulario maestro
//   updateSupplier        — edición de la ficha (supplier_code inmutable)
//   toggleSupplierStatus  — activar / inactivar sin borrado físico
//   quickCreateSupplier   — alta mínima desde el flujo de compras
//
// Validaciones DB aplicadas en este service:
//   - supplier_code único por tenant (pre-check + catch P2002)
//   - proveedor existente en tenant antes de update/toggle
//   - activity_code existente en EconomicActivity si viene informado
//   - country_code existente en Country si viene informado
//   - municipality_code NO se valida aquí (solo dirección postal, no DTE-crítico)
//
// tenant_id y user_id siempre vienen de la sesión del servidor.
// Nunca del body del cliente.
//
// No se usan transacciones: todas las operaciones son escrituras
// simples sobre una sola tabla. Sin efectos derivados.
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CreateSupplierInput } from "../schemas/create-supplier.schema";
import type { UpdateSupplierInput } from "../schemas/update-supplier.schema";
import type { QuickCreateSupplierInput } from "../schemas/quick-create-supplier.schema";
import type { ToggleSupplierStatusInput } from "../schemas/toggle-supplier-status.schema";

// ── Tipos de resultado ────────────────────────────────────────────

/**
 * Discriminador de error para que las routes puedan mapear HTTP status
 * sin inferir el tipo de error leyendo texto ni haciendo supuestos sobre `field`.
 *
 * Las actions (S8) ignoran este campo — usan solo `error` y `field`.
 * Las routes (S9) usan `code` para determinar 404 / 409 / 422.
 */
export type SupplierErrorCode =
  | "NOT_FOUND"       // proveedor no existe en el tenant → 404
  | "DUPLICATE_CODE"  // supplier_code ya existe en el tenant → 409
  | "INVALID_CATALOG" // activity_code o country_code inválido → 422
  | "INVALID_STATE"   // toggle idempotente (ya está en ese estado) → 422
  | "UNKNOWN";        // error inesperado capturado → 422

export type SupplierResult =
  | { ok: true }
  | { ok: false; code: SupplierErrorCode; error: string; field?: string };

export type CreateSupplierResult =
  | { ok: true; id: string; supplier_code: string }
  | { ok: false; code: SupplierErrorCode; error: string; field?: string };

// ── Helpers internos ──────────────────────────────────────────────

/**
 * Genera un código provisional para alta rápida.
 * Formato: PROV-{slug 15 chars}-{4 alphanum aleatorio}
 * Ejemplo: PROV-PAPELERIA-GOMEZ-K3X9
 *
 * El prefijo PROV- señala visualmente que el código es provisional.
 * El sufijo aleatorio garantiza unicidad en la mayoría de los casos.
 * La colisión residual queda cubierta por el catch P2002.
 */
function generateProvisionalCode(name: string): string {
  const slug = name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/[^A-Z0-9]+/g, "-")     // reemplazar no-alfanumérico por guion
    .replace(/^-|-$/g, "")           // quitar guiones extremos
    .slice(0, 15);

  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PROV-${slug}-${rand}`;
}

/**
 * Verifica unicidad de supplier_code dentro del tenant.
 * Devuelve true si ya existe otro proveedor con ese código.
 */
async function supplierCodeExists(
  tenantId: string,
  supplierCode: string,
): Promise<boolean> {
  const existing = await prisma.supplier.findFirst({
    where: { tenant_id: tenantId, supplier_code: supplierCode },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Valida que activity_code exista y esté activo en el catálogo.
 * Solo se llama si activity_code viene informado.
 */
async function validateActivityCode(code: string): Promise<boolean> {
  const found = await prisma.economicActivity.findFirst({
    where: { code, status: "active" },
    select: { code: true },
  });
  return found !== null;
}

/**
 * Valida que country_code exista y esté activo en el catálogo.
 * Solo se llama si country_code viene informado.
 */
async function validateCountryCode(code: string): Promise<boolean> {
  const found = await prisma.country.findFirst({
    where: { code, status: "active" },
    select: { code: true },
  });
  return found !== null;
}

/**
 * Ejecuta las validaciones de catálogos DTE-críticos.
 * Devuelve un error estructurado si alguno falla, o null si todo es válido.
 */
async function validateCatalogFields(data: {
  activity_code?: string | null;
  country_code?:  string | null;
}): Promise<{ ok: false; code: "INVALID_CATALOG"; error: string; field: string } | null> {
  if (data.activity_code) {
    const valid = await validateActivityCode(data.activity_code);
    if (!valid) {
      return {
        ok:    false,
        code:  "INVALID_CATALOG",
        field: "activity_code",
        error: `El código de actividad económica "${data.activity_code}" no existe o no está activo en el catálogo.`,
      };
    }
  }

  if (data.country_code) {
    const valid = await validateCountryCode(data.country_code);
    if (!valid) {
      return {
        ok:    false,
        code:  "INVALID_CATALOG",
        field: "country_code",
        error: `El código de país "${data.country_code}" no existe o no está activo en el catálogo.`,
      };
    }
  }

  return null;
}

// ── Crear proveedor completo ───────────────────────────────────────

/**
 * Crea un proveedor desde el formulario maestro.
 * El input debe haber sido validado previamente con createSupplierSchema.
 *
 * @param tenantId - Extraído de session.tenantId.
 * @param userId   - Extraído de session.userId.
 * @param input    - Datos validados con createSupplierSchema.
 */
export async function createSupplier(
  tenantId: string,
  userId:   string,
  input:    CreateSupplierInput,
): Promise<CreateSupplierResult> {
  // 1. Unicidad de supplier_code dentro del tenant
  if (await supplierCodeExists(tenantId, input.supplier_code)) {
    return {
      ok:    false,
      code:  "DUPLICATE_CODE",
      field: "supplier_code",
      error: `Ya existe un proveedor con el código "${input.supplier_code}" en este tenant.`,
    };
  }

  // 2. Validación de catálogos DTE-críticos
  const catalogError = await validateCatalogFields({
    activity_code: input.activity_code,
    country_code:  input.country_code,
  });
  if (catalogError) return catalogError;

  // 3. Persistencia
  try {
    const supplier = await prisma.supplier.create({
      data: {
        tenant_id:     tenantId,
        supplier_code: input.supplier_code,
        name:          input.name,
        taxpayer_type: input.taxpayer_type,

        // Identidad opcional
        account_code:   input.account_code   ?? null,
        legal_name:     input.legal_name     ?? null,

        // Documentación
        id_type_code:   input.id_type_code   ?? null,
        dui:            input.dui            ?? null,
        nit:            input.nit            ?? null,
        nrc:            input.nrc            ?? null,
        other_document: input.other_document ?? null,

        // Giro
        activity_code:  input.activity_code  ?? null,
        activity_name:  input.activity_name  ?? null,

        // Dirección
        dept_code:          input.dept_code          ?? null,
        dept_name:          input.dept_name          ?? null,
        municipality_code:  input.municipality_code  ?? null,
        municipality_name:  input.municipality_name  ?? null,
        country_code:       input.country_code       ?? null,
        country_name:       input.country_name       ?? null,
        address_complement: input.address_complement ?? null,

        // Contacto
        contact_name: input.contact_name ?? null,
        contact_role: input.contact_role ?? null,
        phone:        input.phone        ?? null,
        phone_alt:    input.phone_alt    ?? null,
        email:        input.email        ?? null,
        whatsapp:     input.whatsapp     ?? null,

        // Auditoría
        created_by: userId,
        updated_by: userId,
      },
      select: { id: true, supplier_code: true },
    });

    return { ok: true, id: supplier.id, supplier_code: supplier.supplier_code };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok:    false,
        code:  "DUPLICATE_CODE",
        field: "supplier_code",
        error: `Ya existe un proveedor con el código "${input.supplier_code}" en este tenant.`,
      };
    }
    throw e;
  }
}

// ── Actualizar proveedor ───────────────────────────────────────────

/**
 * Actualiza la ficha de un proveedor existente.
 * supplier_code es inmutable — excluido del schema de update.
 * El input debe haber sido validado previamente con updateSupplierSchema.
 *
 * @param tenantId - Extraído de session.tenantId.
 * @param userId   - Extraído de session.userId.
 * @param input    - Datos validados con updateSupplierSchema (incluye id).
 */
export async function updateSupplier(
  tenantId: string,
  userId:   string,
  input:    UpdateSupplierInput,
): Promise<SupplierResult> {
  // 1. Verificar existencia dentro del tenant (previene fuga entre tenants)
  const existing = await prisma.supplier.findFirst({
    where:  { id: input.id, tenant_id: tenantId },
    select: { id: true },
  });
  if (!existing) {
    return {
      ok:    false,
      code:  "NOT_FOUND",
      error: "El proveedor no existe o no pertenece al tenant actual.",
    };
  }

  // 2. Validación de catálogos DTE-críticos
  const catalogError = await validateCatalogFields({
    activity_code: input.activity_code,
    country_code:  input.country_code,
  });
  if (catalogError) return catalogError;

  // 3. Persistencia — solo campos que vienen en el input
  //    Los campos opcionales usan spread condicional para no sobreescribir
  //    valores existentes con undefined (Prisma ignora undefined en update).
  await prisma.supplier.update({
    where: { id: input.id },
    data: {
      name:          input.name,
      taxpayer_type: input.taxpayer_type,

      ...(input.account_code   !== undefined && { account_code:   input.account_code }),
      ...(input.legal_name     !== undefined && { legal_name:     input.legal_name }),

      ...(input.id_type_code   !== undefined && { id_type_code:   input.id_type_code }),
      ...(input.dui            !== undefined && { dui:            input.dui }),
      ...(input.nit            !== undefined && { nit:            input.nit }),
      ...(input.nrc            !== undefined && { nrc:            input.nrc }),
      ...(input.other_document !== undefined && { other_document: input.other_document }),

      ...(input.activity_code  !== undefined && { activity_code:  input.activity_code }),
      ...(input.activity_name  !== undefined && { activity_name:  input.activity_name }),

      ...(input.dept_code          !== undefined && { dept_code:          input.dept_code }),
      ...(input.dept_name          !== undefined && { dept_name:          input.dept_name }),
      ...(input.municipality_code  !== undefined && { municipality_code:  input.municipality_code }),
      ...(input.municipality_name  !== undefined && { municipality_name:  input.municipality_name }),
      ...(input.country_code       !== undefined && { country_code:       input.country_code }),
      ...(input.country_name       !== undefined && { country_name:       input.country_name }),
      ...(input.address_complement !== undefined && { address_complement: input.address_complement }),

      ...(input.contact_name !== undefined && { contact_name: input.contact_name }),
      ...(input.contact_role !== undefined && { contact_role: input.contact_role }),
      ...(input.phone        !== undefined && { phone:        input.phone }),
      ...(input.phone_alt    !== undefined && { phone_alt:    input.phone_alt }),
      ...(input.email        !== undefined && { email:        input.email }),
      ...(input.whatsapp     !== undefined && { whatsapp:     input.whatsapp }),

      updated_by: userId,
    },
  });

  return { ok: true };
}

// ── Actualizar solo giro económico ───────────────────────────────

/**
 * Actualiza únicamente los campos de actividad económica del proveedor.
 * Usado desde la pestaña Giro de la ficha del maestro (S10F).
 *
 * Si activity_code es null → limpia el giro (activity_code y activity_name a null).
 * Si activity_code es no-null → valida existencia en el catálogo CAT-019.
 * Coherencia: si hay activity_code debe haber activity_name.
 *
 * @param tenantId     - Extraído de la sesión del servidor.
 * @param userId       - Extraído de la sesión del servidor.
 * @param input.id     - UUID del proveedor a actualizar.
 * @param input.activity_code - Código CAT-019 o null para limpiar.
 * @param input.activity_name - Nombre del giro o null para limpiar.
 */
export async function updateSupplierActivity(
  tenantId: string,
  userId:   string,
  input: {
    id:            string;
    activity_code: string | null;
    activity_name: string | null;
  },
): Promise<SupplierResult> {
  // 1. Verificar existencia dentro del tenant
  const existing = await prisma.supplier.findFirst({
    where:  { id: input.id, tenant_id: tenantId },
    select: { id: true },
  });
  if (!existing) {
    return {
      ok:    false,
      code:  "NOT_FOUND",
      error: "El proveedor no existe o no pertenece al tenant actual.",
    };
  }

  // 2. Validar catálogo si viene código no-null
  if (input.activity_code) {
    const valid = await validateActivityCode(input.activity_code);
    if (!valid) {
      return {
        ok:    false,
        code:  "INVALID_CATALOG",
        field: "activity_code",
        error: `El código de actividad "${input.activity_code}" no existe o no está activo en el catálogo.`,
      };
    }
  }

  // 3. Persistencia — solo los dos campos de giro + auditoría
  await prisma.supplier.update({
    where: { id: input.id },
    data: {
      activity_code: input.activity_code,
      activity_name: input.activity_name,
      updated_by:    userId,
    },
  });

  return { ok: true };
}

// ── Actualizar solo dirección ─────────────────────────────────────

/**
 * Actualiza únicamente los campos de dirección del proveedor.
 * Usado desde la pestaña Dirección de la ficha del maestro (S10G).
 *
 * Si country_code es no-null → valida existencia en el catálogo de países.
 * municipality_code no se valida (dirección postal, no DTE-crítico).
 * Enviar todos los campos como null → limpia la dirección completa.
 *
 * @param tenantId - Extraído de la sesión del servidor.
 * @param userId   - Extraído de la sesión del servidor.
 * @param input    - Campos de dirección + id del proveedor.
 */
export async function updateSupplierAddress(
  tenantId: string,
  userId:   string,
  input: {
    id:                 string;
    dept_code:          string | null;
    dept_name:          string | null;
    municipality_code:  string | null;
    municipality_name:  string | null;
    country_code:       string | null;
    country_name:       string | null;
    address_complement: string | null;
  },
): Promise<SupplierResult> {
  // 1. Verificar existencia dentro del tenant
  const existing = await prisma.supplier.findFirst({
    where:  { id: input.id, tenant_id: tenantId },
    select: { id: true },
  });
  if (!existing) {
    return {
      ok:    false,
      code:  "NOT_FOUND",
      error: "El proveedor no existe o no pertenece al tenant actual.",
    };
  }

  // 2. Validar país si viene no-null
  if (input.country_code) {
    const valid = await validateCountryCode(input.country_code);
    if (!valid) {
      return {
        ok:    false,
        code:  "INVALID_CATALOG",
        field: "country_code",
        error: `El código de país "${input.country_code}" no existe o no está activo en el catálogo.`,
      };
    }
  }

  // 3. Persistencia — solo los campos de dirección + auditoría
  await prisma.supplier.update({
    where: { id: input.id },
    data: {
      dept_code:          input.dept_code,
      dept_name:          input.dept_name,
      municipality_code:  input.municipality_code,
      municipality_name:  input.municipality_name,
      country_code:       input.country_code,
      country_name:       input.country_name,
      address_complement: input.address_complement,
      updated_by:         userId,
    },
  });

  return { ok: true };
}

// ── Activar / inactivar proveedor ─────────────────────────────────

/**
 * Cambia el estado operativo del proveedor entre active e inactive.
 * No realiza borrado físico. El historial de compras permanece intacto.
 *
 * Regla de negocio prospectiva:
 *   Un proveedor inactivo no puede seleccionarse en nuevas compras.
 *   Esa restricción la aplica getSuppliersForLookup(activeOnly=true)
 *   en el flujo de purchases — no aquí.
 *
 * @param tenantId - Extraído de session.tenantId.
 * @param userId   - Extraído de session.userId.
 * @param input    - { id, status } validado con toggleSupplierStatusSchema.
 */
export async function toggleSupplierStatus(
  tenantId: string,
  userId:   string,
  input:    ToggleSupplierStatusInput,
): Promise<SupplierResult> {
  // Verificar existencia dentro del tenant
  const existing = await prisma.supplier.findFirst({
    where:  { id: input.id, tenant_id: tenantId },
    select: { id: true, status: true },
  });
  if (!existing) {
    return {
      ok:    false,
      code:  "NOT_FOUND",
      error: "El proveedor no existe o no pertenece al tenant actual.",
    };
  }

  // Idempotencia: si ya está en el estado solicitado, no es un error
  // pero se informa para que la UI pueda dar feedback útil.
  if (existing.status === input.status) {
    const label = input.status === "active" ? "activo" : "inactivo";
    return {
      ok:    false,
      code:  "INVALID_STATE",
      error: `El proveedor ya está ${label}.`,
    };
  }

  await prisma.supplier.update({
    where: { id: input.id },
    data: {
      status:     input.status,
      updated_by: userId,
    },
  });

  return { ok: true };
}

// ── Alta rápida desde purchases ───────────────────────────────────

/**
 * Crea un proveedor mínimo sin interrumpir el flujo de compra.
 * supplier_code se genera automáticamente con el patrón PROV-{slug}-{rand4}.
 * El proveedor queda activo y puede completarse luego desde el maestro.
 *
 * En caso de colisión de código (raro por el sufijo aleatorio), reintenta
 * una vez antes de devolver error. Si falla dos veces, el catch P2002 lo captura.
 *
 * @param tenantId - Extraído de session.tenantId.
 * @param userId   - Extraído de session.userId.
 * @param input    - { name, taxpayer_type } validado con quickCreateSupplierSchema.
 */
export async function quickCreateSupplier(
  tenantId: string,
  userId:   string,
  input:    QuickCreateSupplierInput,
): Promise<CreateSupplierResult> {
  // Generar código provisional — con un reintento en caso de colisión
  let supplierCode = generateProvisionalCode(input.name);
  if (await supplierCodeExists(tenantId, supplierCode)) {
    supplierCode = generateProvisionalCode(input.name); // segundo intento con distinto rand
  }

  try {
    const supplier = await prisma.supplier.create({
      data: {
        tenant_id:     tenantId,
        supplier_code: supplierCode,
        name:          input.name,
        taxpayer_type: input.taxpayer_type,
        // Resto de campos: null explícito — se completan luego en el maestro
        account_code:       null,
        legal_name:         null,
        id_type_code:       null,
        dui:                null,
        nit:                null,
        nrc:                null,
        other_document:     null,
        activity_code:      null,
        activity_name:      null,
        dept_code:          null,
        dept_name:          null,
        municipality_code:  null,
        municipality_name:  null,
        country_code:       null,
        country_name:       null,
        address_complement: null,
        contact_name:       null,
        contact_role:       null,
        phone:              null,
        phone_alt:          null,
        email:              null,
        whatsapp:           null,
        created_by:         userId,
        updated_by:         userId,
      },
      select: { id: true, supplier_code: true },
    });

    return { ok: true, id: supplier.id, supplier_code: supplier.supplier_code };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok:    false,
        code:  "DUPLICATE_CODE",
        field: "supplier_code",
        error: "No fue posible generar un código único para el proveedor. Inténtalo nuevamente.",
      };
    }
    throw e;
  }
}
