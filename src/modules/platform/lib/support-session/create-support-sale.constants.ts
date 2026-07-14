// ─────────────────────────────────────────────────────────────────
// platform — create-support-sale.constants.ts
//
// F1-B1: Constantes compartidas para crear ventas de prueba desde
// Support Session. Archivo neutral sin "use server" — puede
// importarse desde UI y actions.
// ─────────────────────────────────────────────────────────────────

export const CREATE_SUPPORT_SALE_CONFIRMATION_TEXT = "CREATE SUPPORT SALE";

// CAT-002: tipos de DTE activos para venta en F1-B1 (mismo set que commerce/sales)
export const SUPPORT_SALE_ACTIVE_DTE_TYPES = ["01", "03"] as const;
