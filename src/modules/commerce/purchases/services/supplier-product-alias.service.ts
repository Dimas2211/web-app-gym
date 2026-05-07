// ─────────────────────────────────────────────────────────────────
// commerce/purchases — supplier-product-alias.service.ts
//
// Manejo de alias proveedor-producto para matching DTE.
//
// Responsabilidades:
//   - Normalizar código y nombre del proveedor para comparación.
//   - Buscar aliases existentes (por código o por nombre).
//   - Crear alias solo cuando el usuario lo pide explícitamente.
//   - Detectar conflictos sin sobrescribir silenciosamente.
//
// No crea aliases automáticamente.
// No toca inventario, ventas ni caja.
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { MatchTypeProduct } from "../types/purchase-dte-import.types";

// ── Normalización ─────────────────────────────────────────────────

// Código: trim + uppercase (sin quitar caracteres internos — el código debe ser exacto)
export function normalizeSupplierProductCode(value: string): string {
  return value.trim().toUpperCase();
}

// Nombre: trim + uppercase + colapsar espacios múltiples
export function normalizeSupplierProductName(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

// ── Estructura del alias en memoria para matching ─────────────────

interface AliasRow {
  product_id:                      string;
  normalized_supplier_product_code: string | null;
  normalized_supplier_product_name: string | null;
}

// ── Carga batch de aliases para un supplier ───────────────────────
// Se llama una vez por request de matching para evitar N+1.

export async function loadAliasesForSupplier(
  tenant_id:   string,
  supplier_id: string,
): Promise<AliasRow[]> {
  return prisma.supplierProductAlias.findMany({
    where:  { tenant_id, supplier_id, is_active: true },
    select: {
      product_id:                      true,
      normalized_supplier_product_code: true,
      normalized_supplier_product_name: true,
    },
  });
}

// ── Lookup en memoria contra una lista de aliases pre-cargados ────
// Prioridad: código exacto normalizado > nombre exacto normalizado.

export function findAliasInMemory(
  aliases:      AliasRow[],
  supplier_code: string | null,
  supplier_name: string | null,
): { product_id: string; match_type: Extract<MatchTypeProduct, "SUPPLIER_ALIAS_CODE" | "SUPPLIER_ALIAS_NAME"> } | null {
  // 1. Por código normalizado
  if (supplier_code) {
    const normCode = normalizeSupplierProductCode(supplier_code);
    const hit = aliases.find(
      (a) => a.normalized_supplier_product_code !== null &&
             a.normalized_supplier_product_code === normCode,
    );
    if (hit) return { product_id: hit.product_id, match_type: "SUPPLIER_ALIAS_CODE" };
  }

  // 2. Por nombre normalizado
  if (supplier_name) {
    const normName = normalizeSupplierProductName(supplier_name);
    const hit = aliases.find(
      (a) => a.normalized_supplier_product_name !== null &&
             a.normalized_supplier_product_name === normName,
    );
    if (hit) return { product_id: hit.product_id, match_type: "SUPPLIER_ALIAS_NAME" };
  }

  return null;
}

// ── Resultado de guardar un alias ─────────────────────────────────

export type SaveAliasResult =
  | { saved: true }
  | { saved: false; skipped: true }      // ya existe y apunta al mismo producto
  | { saved: false; warning: string };   // conflicto con otro producto — no se sobrescribe

// ── Crear alias de forma segura ───────────────────────────────────
// Solo se llama cuando el usuario marcó "Recordar vinculación".
// No sobrescribe un alias existente que apunte a otro producto.

export async function saveSupplierProductAlias(params: {
  tenant_id:             string;
  supplier_id:           string;
  product_id:            string;
  supplier_product_code: string | null;
  supplier_product_name: string | null;
  source:                string;
  created_by:            string;
  updated_by:            string;
}): Promise<SaveAliasResult> {
  const {
    tenant_id,
    supplier_id,
    product_id,
    supplier_product_code,
    supplier_product_name,
    source,
    created_by,
    updated_by,
  } = params;

  const normCode = supplier_product_code
    ? normalizeSupplierProductCode(supplier_product_code)
    : null;
  const normName = supplier_product_name
    ? normalizeSupplierProductName(supplier_product_name)
    : null;

  // Verificar si ya existe alias por código normalizado
  if (normCode) {
    const existing = await prisma.supplierProductAlias.findFirst({
      where: {
        tenant_id,
        supplier_id,
        normalized_supplier_product_code: normCode,
      },
      select: { id: true, product_id: true },
    });

    if (existing) {
      if (existing.product_id === product_id) {
        return { saved: false, skipped: true };
      }
      return {
        saved:   false,
        warning: `El código "${supplier_product_code}" ya tiene un alias para otro producto. No se sobrescribió.`,
      };
    }
  }

  // Verificar si ya existe alias por nombre (solo cuando no hay código)
  if (!normCode && normName) {
    const existing = await prisma.supplierProductAlias.findFirst({
      where: {
        tenant_id,
        supplier_id,
        normalized_supplier_product_code: null,
        normalized_supplier_product_name: normName,
      },
      select: { id: true, product_id: true },
    });

    if (existing) {
      if (existing.product_id === product_id) {
        return { saved: false, skipped: true };
      }
      return {
        saved:   false,
        warning: `El nombre "${supplier_product_name}" ya tiene un alias para otro producto. No se sobrescribió.`,
      };
    }
  }

  // Crear el alias
  try {
    await prisma.supplierProductAlias.create({
      data: {
        tenant_id,
        supplier_id,
        product_id,
        supplier_product_code,
        supplier_product_name,
        normalized_supplier_product_code: normCode,
        normalized_supplier_product_name: normName,
        source,
        is_active:  true,
        created_by,
        updated_by,
      },
    });
    return { saved: true };
  } catch (e) {
    // Race condition: otra operación concurrente creó el mismo alias
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { saved: false, skipped: true };
    }
    throw e;
  }
}
