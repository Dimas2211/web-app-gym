"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/products — update-product.action.ts
//
// Actualiza un producto existente del catálogo maestro.
// Solo modifica atributos descriptivos y operativos.
//
// No editable aquí:
//   - product_code  → clave de negocio, readonly en el formulario
//   - status        → se gestiona en update-product-status.action
//   - tenant_id     → nunca cambia
//
// Permiso: requireAdmin (super_admin | branch_admin).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/permissions/guards";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { updateProductSchema } from "../schemas/update-product.schema";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type ProductUpdateActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// ── Helpers de parsing (idénticos a create-product.action) ────────

function str(value: FormDataEntryValue | null): string | undefined {
  const s = value as string | null;
  if (s === null || s === undefined) return undefined;
  const trimmed = s.trim();
  return trimmed === "" ? undefined : trimmed;
}

function strNullable(value: FormDataEntryValue | null): string | null {
  const s = value as string | null;
  if (!s || s.trim() === "") return null;
  return s.trim();
}

function parseBool(value: FormDataEntryValue | null): boolean | undefined {
  if (value === null) return undefined;
  const s = (value as string).trim();
  if (s === "true") return true;
  if (s === "false") return false;
  return undefined;
}

function parseDecimal(value: FormDataEntryValue | null): number | null {
  const s = (value as string | null)?.trim();
  if (!s) return null;
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

// ── Action ────────────────────────────────────────────────────────

export async function updateProductAction(
  _prev: ProductUpdateActionState,
  formData: FormData
): Promise<ProductUpdateActionState> {
  // 1. Sesión y permisos
  const sessionUser = await requireAdmin();
  const tenantId = sessionUser.tenant_id;

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return { error: RUNTIME_READONLY_MESSAGE };
  }

  // Bloque B: módulo commerce.products debe estar habilitado (edición no cambia cupo)
  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenantId);
    assertOrganizationModule(commercialCtx, "commerce.products");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  // 2. Parseo y validación Zod
  const raw = {
    id:             str(formData.get("id")),
    name:           str(formData.get("name")),
    description:    strNullable(formData.get("description")),
    product_type:   str(formData.get("product_type")),
    category_id:    str(formData.get("category_id")),
    line_id:        strNullable(formData.get("line_id")),
    subline_id:     strNullable(formData.get("subline_id")),
    brand:          strNullable(formData.get("brand")),
    unit_id:        str(formData.get("unit_id")),
    package_unit:   strNullable(formData.get("package_unit")),
    supplier_id:    strNullable(formData.get("supplier_id")),
    sku:            strNullable(formData.get("sku")),
    is_stockable:   parseBool(formData.get("is_stockable")),
    allow_purchase: parseBool(formData.get("allow_purchase")),
    allow_sale:     parseBool(formData.get("allow_sale")),
    cost_price:     parseDecimal(formData.get("cost_price")),
    sale_price:     parseDecimal(formData.get("sale_price")),
    tax_rate_id:    strNullable(formData.get("tax_rate_id")),
  };

  const parsed = updateProductSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  // 3. Verificar que el producto existe y pertenece al tenant
  const existing = await prisma.product.findFirst({
    where: { id: data.id, tenant_id: tenantId },
    select: { id: true },
  });
  if (!existing) {
    return { error: "El producto no existe o no pertenece a este tenant." };
  }

  // 4. Verificación de entidades relacionadas

  // category
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

  // line (opcional)
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

  // subline (opcional)
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

  // unit
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

  // 5. Actualizar producto
  await prisma.product.update({
    where: { id: data.id },
    data: {
      name:           data.name,
      description:    data.description ?? null,
      product_type:   data.product_type,
      is_stockable:   data.is_stockable,
      allow_purchase: data.allow_purchase,
      allow_sale:     data.allow_sale,
      category_id:    data.category_id,
      line_id:        data.line_id ?? null,
      subline_id:     data.subline_id ?? null,
      brand:          data.brand ?? null,
      unit_id:        data.unit_id,
      package_unit:   data.package_unit ?? null,
      supplier_id:    data.supplier_id ?? null,
      sku:            data.sku ?? null,
      cost_price:     data.cost_price ?? null,
      sale_price:     data.sale_price ?? null,
      tax_rate_id:    data.tax_rate_id ?? null,
      updated_by:     sessionUser.id,
    },
  });

  revalidatePath("/dashboard/products");
  // undefined = éxito — el dialog cierra al recibir este valor
}
