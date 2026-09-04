"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/products — create-product.action.ts
//
// Crea un nuevo producto en el catálogo maestro del tenant.
// Valida schema, unicidad de código, existencia y coherencia
// relacional de todas las entidades vinculadas.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// Razón: products es catálogo tenant-level; reception y trainer
// no deben poder modificar el catálogo maestro.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/permissions/guards";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { createProductSchema } from "../schemas/create-product.schema";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  withCapacityCheckedTransaction,
  isProductCountedForCapacity,
  capacityDelta,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// ── Estado de retorno ─────────────────────────────────────────────

export type ProductActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// ── Helpers de parsing ────────────────────────────────────────────

function str(value: FormDataEntryValue | null): string | undefined {
  // undefined → Zod dispara required_error en campos obligatorios
  const s = value as string | null;
  if (s === null || s === undefined) return undefined;
  const trimmed = s.trim();
  return trimmed === "" ? undefined : trimmed;
}

function strNullable(value: FormDataEntryValue | null): string | null {
  // null → válido para campos opcionales nullable en el schema
  const s = value as string | null;
  if (!s || s.trim() === "") return null;
  return s.trim();
}

function parseBool(value: FormDataEntryValue | null): boolean | undefined {
  if (value === null) return undefined;
  const s = (value as string).trim();
  if (s === "true") return true;
  if (s === "false") return false;
  return undefined; // Zod lo rechazará con el mensaje del schema
}

function parseDecimal(value: FormDataEntryValue | null): number | null {
  const s = (value as string | null)?.trim();
  if (!s) return null;
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

// ── Action ────────────────────────────────────────────────────────

export async function createProductAction(
  _prev: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  // 1. Sesión y permisos
  const sessionUser = await requireAdmin();
  const tenantId = sessionUser.tenant_id;

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return { error: RUNTIME_READONLY_MESSAGE };
  }

  // Bloque B: módulo commerce.products debe estar habilitado
  let commercialCtx;
  try {
    commercialCtx = await resolveCommercialEnforcementContext(tenantId);
    assertOrganizationModule(commercialCtx, "commerce.products");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  // 2. Parseo y validación Zod
  const raw = {
    product_code:  str(formData.get("product_code")),
    name:          str(formData.get("name")),
    description:   strNullable(formData.get("description")),
    product_type:  str(formData.get("product_type")),
    category_id:   str(formData.get("category_id")),
    line_id:       strNullable(formData.get("line_id")),
    subline_id:    strNullable(formData.get("subline_id")),
    brand:         strNullable(formData.get("brand")),
    unit_id:       str(formData.get("unit_id")),
    package_unit:  strNullable(formData.get("package_unit")),
    supplier_id:   strNullable(formData.get("supplier_id")),
    sku:           strNullable(formData.get("sku")),
    is_stockable:  parseBool(formData.get("is_stockable")),
    allow_purchase: parseBool(formData.get("allow_purchase")),
    allow_sale:    parseBool(formData.get("allow_sale")),
    cost_price:    parseDecimal(formData.get("cost_price")),
    sale_price:    parseDecimal(formData.get("sale_price")),
    tax_rate_id:   strNullable(formData.get("tax_rate_id")),
  };

  const parsed = createProductSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  // 3. Unicidad de product_code dentro del tenant
  const duplicate = await prisma.product.findUnique({
    where: {
      tenant_id_product_code: {
        tenant_id: tenantId,
        product_code: data.product_code,
      },
    },
    select: { id: true },
  });
  if (duplicate) {
    return {
      errors: {
        product_code: [
          "Ya existe un producto con este código en el catálogo.",
        ],
      },
    };
  }

  // 4. Verificación de entidades relacionadas

  // category (obligatoria, debe existir y estar activa en el tenant)
  const category = await prisma.productCategory.findFirst({
    where: { id: data.category_id, tenant_id: tenantId, status: "active" },
    select: { id: true },
  });
  if (!category) {
    return {
      errors: {
        category_id: [
          "La categoría seleccionada no existe o está inactiva.",
        ],
      },
    };
  }

  // line (opcional; si viene, debe estar activa y pertenecer a la category)
  if (data.line_id) {
    const line = await prisma.productLine.findFirst({
      where: {
        id: data.line_id,
        tenant_id: tenantId,
        category_id: data.category_id,
        status: "active",
      },
      select: { id: true },
    });
    if (!line) {
      return {
        errors: {
          line_id: [
            "La línea seleccionada no existe, está inactiva o no pertenece a la categoría seleccionada.",
          ],
        },
      };
    }
  }

  // subline (opcional; si viene, debe estar activa y pertenecer a la line)
  // La coherencia subline→line ya pasa por superRefine del schema,
  // pero aquí se valida también contra la DB para prevenir manipulación directa.
  if (data.subline_id) {
    const subline = await prisma.productSubline.findFirst({
      where: {
        id: data.subline_id,
        tenant_id: tenantId,
        line_id: data.line_id!,
        status: "active",
      },
      select: { id: true },
    });
    if (!subline) {
      return {
        errors: {
          subline_id: [
            "La sublínea seleccionada no existe, está inactiva o no pertenece a la línea seleccionada.",
          ],
        },
      };
    }
  }

  // unit (obligatoria; es referencia global, sin filtro tenant)
  const unit = await prisma.unitOfMeasure.findFirst({
    where: { id: data.unit_id, status: "active" },
    select: { id: true },
  });
  if (!unit) {
    return {
      errors: {
        unit_id: [
          "La unidad de medida seleccionada no existe o está inactiva.",
        ],
      },
    };
  }

  // tax_rate (opcional)
  if (data.tax_rate_id) {
    const taxRate = await prisma.taxRate.findFirst({
      where: { id: data.tax_rate_id, tenant_id: tenantId, status: "active" },
      select: { id: true },
    });
    if (!taxRate) {
      return {
        errors: {
          tax_rate_id: [
            "La tasa de impuesto seleccionada no existe o está inactiva.",
          ],
        },
      };
    }
  }

  // supplier (opcional)
  if (data.supplier_id) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: data.supplier_id, tenant_id: tenantId, status: "active" },
      select: { id: true },
    });
    if (!supplier) {
      return {
        errors: {
          supplier_id: [
            "El proveedor seleccionado no existe o está inactivo.",
          ],
        },
      };
    }
  }

  // 5. Crear producto
  // Auditoría: created_by / updated_by desde sessionUser.id.
  // No existe todavía una tabla de audit_log separada; si se implementa
  // en el futuro, este es el punto donde se registraría la entrada.
  //
  // El try/catch captura P2002 por si dos requests concurrentes pasan el
  // findUnique al mismo tiempo. La constraint @@unique de PostgreSQL rechaza
  // el segundo insert — aquí lo convertimos en un error de usuario en lugar
  // de dejar que suba como error 500.
  const delta = capacityDelta(false, isProductCountedForCapacity("ACTIVE"));

  try {
    await withCapacityCheckedTransaction(
      prisma,
      "commerce.products.max",
      delta,
      commercialCtx,
      (tx) =>
        tx.product.create({
          data: {
            tenant_id:     tenantId,
            product_code:  data.product_code,
            name:          data.name,
            description:   data.description ?? null,
            product_type:  data.product_type,
            status:        "ACTIVE",
            is_stockable:  data.is_stockable,
            allow_purchase: data.allow_purchase,
            allow_sale:    data.allow_sale,
            category_id:   data.category_id,
            line_id:       data.line_id ?? null,
            subline_id:    data.subline_id ?? null,
            brand:         data.brand ?? null,
            unit_id:       data.unit_id,
            package_unit:  data.package_unit ?? null,
            supplier_id:   data.supplier_id ?? null,
            sku:           data.sku ?? null,
            cost_price:    data.cost_price ?? null,
            sale_price:    data.sale_price ?? null,
            tax_rate_id:   data.tax_rate_id ?? null,
            created_by:    sessionUser.id,
            updated_by:    sessionUser.id,
          },
        }),
    );
  } catch (e) {
    if (e instanceof CommercialEnforcementError) {
      return { error: e.userMessage };
    }
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        errors: {
          product_code: [
            "Ya existe un producto con este código en el catálogo.",
          ],
        },
      };
    }
    throw e; // cualquier otro error es de sistema, no se silencia
  }

  // Sin redirect: el componente dialog maneja el cierre al recibir state === undefined.
  // Si se usa desde una página de formulario dedicada en el futuro, agregar redirect aquí.
  revalidatePath("/dashboard/products");
}
