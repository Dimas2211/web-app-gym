// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-v3-rules.ts
//
// FEX-PROD-0B — constantes de negocio FEX 11 v3 sin dependencias de
// servidor (reutilizables por builder, validaciones de venta y UI).
// ─────────────────────────────────────────────────────────────────

// Límites del schema v3 que el builder valida antes de AJV para dar un
// error de negocio claro (nunca se trunca un valor fiscal).
export const FEX_V3_LIMITS = {
  itemCodeMax:          25,
  itemDescriptionMax:   1500,
  receptorComplementMax: 200,
  receptorActivityMin:  5,
  receptorActivityMax:  150,
  receptorDocumentMax:  20,
  phoneMin:             8,
  phoneMax:             30,
  emailMin:             6,
  emailMax:             100,
  emisorComplementMax:  200,
  paymentReferenceMax:  50,
  observacionesMax:     3000,
  descIncotermsMax:     150,
} as const;

// emisor.tipoRegimen es requerido por el schema v3 pero ningún catálogo
// oficial vigente (Catálogos v1.2 10/2025, Manual Funcional V2.0 05/2026)
// define sus valores: la exportación de bienes queda bloqueada hasta
// confirmar la fuente con MH (ver fex11-production-readiness.md §16).
export const FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR =
  "La Factura de Exportación de bienes (tipo de exportación 1 o 3) requiere el \"Tipo de Régimen\" del emisor, " +
  "cuyo catálogo oficial aún no está publicado por el Ministerio de Hacienda. Por ahora solo se puede emitir " +
  "exportación de servicios (tipo 2).";
