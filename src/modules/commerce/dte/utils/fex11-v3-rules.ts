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

/**
 * MH20 (Fase 5.1F → 6.1) — FEX de bienes con perfil MH_2_0.
 *
 * Fase 6.1 (consultas-mh-verificadas.md): CAT-INC-004 RESUELTO_DOCUMENTALMENTE
 * (§15: el código es "TA-1", sin espacio; Longitud 4 en Anexo II campo 36) y
 * CAT-028 no requiere MH (§14: los documentos nuevos seleccionan directamente
 * CAT-033 + CAT-028 2.0; no se migran configuraciones guardadas). La emisión de
 * bienes sigue bloqueada por una causa INTERNA: el flujo comercial no captura
 * todavía Tipo de Régimen (CAT-033) + Régimen (CAT-028 2.0) por venta.
 */
export const FEX_GOODS_MH20_BLOCKED_ERROR =
  "La Factura de Exportación de bienes (tipo de exportación 1 o 3) no está disponible con el perfil MH 2.0: " +
  "la venta aún no permite seleccionar el Tipo de Régimen (CAT-033) y el Régimen (CAT-028 2.0) de la exportación. " +
  "Por ahora solo se puede emitir exportación de servicios (tipo 2).";

/** CAT-033 "Tipo de Régimen" 2.0 (CAT-PDF p.60; Fase 6.1: "TA-1" sin espacio, consultas §15). */
export const CAT033_TIPO_REGIMEN_CODES = ["EX-1", "EX-2", "EX-3", "TA-1"] as const;

/** Anexo II campo 36 / Anexo III campo 29: Longitud 4. */
export function isValidCat033TipoRegimen(code: unknown): boolean {
  return typeof code === "string" && (CAT033_TIPO_REGIMEN_CODES as readonly string[]).includes(code);
}

/**
 * CAT-030 "Transporte" (consultas §16.a, RESUELTO_DOCUMENTALMENTE): solo
 * códigos 1–6 (TERRESTRE … CORREO). El schema admite 7 y el Anexo II campo 65
 * imprime "Longitud: 11" (máximo heredado de 1.2); ninguno restringe más que
 * el catálogo, que es la fuente aplicable (Anexo IV campo 65 núm. 3).
 */
export const CAT030_TRANSPORT_MODE_CODES = [1, 2, 3, 4, 5, 6] as const;

export function isValidCat030ModoTransp(value: unknown): boolean {
  return value === null || value === undefined ||
    (typeof value === "number" && (CAT030_TRANSPORT_MODE_CODES as readonly number[]).includes(value));
}

/**
 * Regla semántica FEX v3 sobre otrosDocumentos[].modoTransp. Hoy el builder
 * emite otrosDocumentos = null; la guardia protege cualquier ruta futura
 * (y los JSON de onboarding) antes de firmar.
 */
export function checkFexV3TransportModes(json: { otrosDocumentos?: unknown }): string[] {
  const docs = Array.isArray(json.otrosDocumentos) ? json.otrosDocumentos : [];
  const errors: string[] = [];
  docs.forEach((d, i) => {
    const v = d && typeof d === "object" ? (d as Record<string, unknown>).modoTransp : undefined;
    if (!isValidCat030ModoTransp(v)) {
      errors.push(`otrosDocumentos[${i}].modoTransp = ${JSON.stringify(v)} no pertenece a CAT-030 (1–6).`);
    }
  });
  return errors;
}
