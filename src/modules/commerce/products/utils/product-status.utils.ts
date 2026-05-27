// ─────────────────────────────────────────────────────────────────
// commerce/products — product-status.utils.ts
//
// Lógica pura de máquina de estados para ProductStatus.
// Importado tanto desde update-product-status.action.ts (servidor)
// como desde product-status-dialog.tsx (cliente).
// Sin dependencias de Prisma ni Next.js: safe para ambos entornos.
// ─────────────────────────────────────────────────────────────────

import type { ProductStatus } from "../types/product.types";

export const VALID_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  ACTIVE:           ["INACTIVE", "DISCONTINUED", "BLOCKED_PURCHASE", "BLOCKED_SALE"],
  INACTIVE:         ["ACTIVE", "DISCONTINUED", "BLOCKED_PURCHASE", "BLOCKED_SALE"],
  DISCONTINUED:     ["ACTIVE"],
  BLOCKED_PURCHASE: ["ACTIVE", "INACTIVE", "BLOCKED_SALE"],
  BLOCKED_SALE:     ["ACTIVE", "INACTIVE", "BLOCKED_PURCHASE"],
};

export function isValidTransition(
  current: ProductStatus,
  next: ProductStatus
): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE:           "Activo",
  INACTIVE:         "Inactivo",
  DISCONTINUED:     "Descontinuado",
  BLOCKED_PURCHASE: "Bloqueado para compra",
  BLOCKED_SALE:     "Bloqueado para venta",
};

export const PRODUCT_STATUS_COLORS: Record<ProductStatus, string> = {
  ACTIVE:           "bg-emerald-100 text-emerald-800",
  INACTIVE:         "bg-zinc-100 text-zinc-600",
  DISCONTINUED:     "bg-red-100 text-red-700",
  BLOCKED_PURCHASE: "bg-amber-100 text-amber-800",
  BLOCKED_SALE:     "bg-orange-100 text-orange-800",
};

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  PRODUCT: "Producto",
  SERVICE: "Servicio",
};
