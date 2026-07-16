// ─────────────────────────────────────────────────────────────────
// platform/lib/support-session/dte — support-dte.constants.ts
//
// F2-B1: Constantes compartidas para crear DTE pendiente y generar
// JSON DTE desde Support Session. Archivo neutral sin "use server" —
// puede importarse desde UI y actions.
// ─────────────────────────────────────────────────────────────────

export const CREATE_SUPPORT_DTE_CONFIRMATION_TEXT = "CREATE SUPPORT DTE";
export const GENERATE_SUPPORT_DTE_JSON_CONFIRMATION_TEXT = "GENERATE SUPPORT DTE JSON";
export const SIGN_SUPPORT_DTE_CONFIRMATION_TEXT = "SIGN SUPPORT DTE";

// CAT-002: tipos de DTE permitidos en F2-B1 (mismo set que F1-B1 de ventas)
export const SUPPORT_DTE_ACTIVE_TYPE_CODES = ["01", "03"] as const;
