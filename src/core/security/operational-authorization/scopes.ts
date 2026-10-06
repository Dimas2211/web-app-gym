// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — scopes.ts
//
// Catálogo explícito de operaciones protegidas por la Autorización
// Operativa (Clave de Supervisor tenant-level). Módulo client-safe:
// solo constantes y tipos, sin código de servidor.
//
// Dos familias de scopes:
//
//   - PIN (requieren Clave de Supervisor):
//       PRODUCT_EDIT, CUSTOMER_EDIT, PURCHASE_EDIT, SALE_EDIT
//         → generan un grant temporal ligado a tenant + user + entidad.
//       PURCHASE_DELETE_DRAFT, PURCHASE_CANCEL_CONFIRMED, SALE_DELETE_DRAFT,
//       SALE_CANCEL_CONFIRMED
//         → de un solo uso: la clave se verifica en la MISMA request que
//           ejecuta la operación (no se emite grant reutilizable).
//
//   - DRAFT_OWNER (emitidos por el servidor al CREAR un borrador):
//       PURCHASE_DRAFT_OWNER, SALE_DRAFT_OWNER
//         → permiten al usuario que crea el borrador seguir capturándolo
//           sin clave. Un borrador existente que se reabre desde la
//           consulta exige SALE_EDIT / PURCHASE_EDIT (clave).
// ─────────────────────────────────────────────────────────────────

export const OPERATIONAL_SCOPES = {
  PRODUCT_EDIT: "PRODUCT_EDIT",
  CUSTOMER_EDIT: "CUSTOMER_EDIT",
  PURCHASE_EDIT: "PURCHASE_EDIT",
  PURCHASE_DELETE_DRAFT: "PURCHASE_DELETE_DRAFT",
  PURCHASE_CANCEL_CONFIRMED: "PURCHASE_CANCEL_CONFIRMED",
  SALE_EDIT: "SALE_EDIT",
  SALE_DELETE_DRAFT: "SALE_DELETE_DRAFT",
  SALE_CANCEL_CONFIRMED: "SALE_CANCEL_CONFIRMED",
  PURCHASE_DRAFT_OWNER: "PURCHASE_DRAFT_OWNER",
  SALE_DRAFT_OWNER: "SALE_DRAFT_OWNER",
} as const;

export type OperationalScope = (typeof OPERATIONAL_SCOPES)[keyof typeof OPERATIONAL_SCOPES];

/** Scopes que se obtienen introduciendo la Clave de Supervisor y emiten grant temporal. */
export const PIN_GRANT_SCOPES = [
  OPERATIONAL_SCOPES.PRODUCT_EDIT,
  OPERATIONAL_SCOPES.CUSTOMER_EDIT,
  OPERATIONAL_SCOPES.PURCHASE_EDIT,
  OPERATIONAL_SCOPES.SALE_EDIT,
] as const;

export type PinGrantScope = (typeof PIN_GRANT_SCOPES)[number];

/** Scopes de un solo uso: la clave viaja con la operación misma. */
export const PIN_ONE_SHOT_SCOPES = [
  OPERATIONAL_SCOPES.PURCHASE_DELETE_DRAFT,
  OPERATIONAL_SCOPES.PURCHASE_CANCEL_CONFIRMED,
  OPERATIONAL_SCOPES.SALE_DELETE_DRAFT,
  OPERATIONAL_SCOPES.SALE_CANCEL_CONFIRMED,
] as const;

export type PinOneShotScope = (typeof PIN_ONE_SHOT_SCOPES)[number];

/** Scopes emitidos automáticamente al crear un borrador (sin clave). */
export const DRAFT_OWNER_SCOPES = [
  OPERATIONAL_SCOPES.PURCHASE_DRAFT_OWNER,
  OPERATIONAL_SCOPES.SALE_DRAFT_OWNER,
] as const;

export type DraftOwnerScope = (typeof DRAFT_OWNER_SCOPES)[number];

export type GrantScope = PinGrantScope | DraftOwnerScope;

/** Scopes aceptados para escribir sobre un borrador de compra (cabecera/líneas). */
export const PURCHASE_DRAFT_WRITE_SCOPES: readonly GrantScope[] = [
  OPERATIONAL_SCOPES.PURCHASE_EDIT,
  OPERATIONAL_SCOPES.PURCHASE_DRAFT_OWNER,
];

/** Scopes aceptados para escribir sobre un borrador de venta (cabecera/líneas). */
export const SALE_DRAFT_WRITE_SCOPES: readonly GrantScope[] = [
  OPERATIONAL_SCOPES.SALE_EDIT,
  OPERATIONAL_SCOPES.SALE_DRAFT_OWNER,
];

export function isPinGrantScope(value: unknown): value is PinGrantScope {
  return (PIN_GRANT_SCOPES as readonly unknown[]).includes(value);
}

export function isGrantScope(value: unknown): value is GrantScope {
  return isPinGrantScope(value) || (DRAFT_OWNER_SCOPES as readonly unknown[]).includes(value);
}
