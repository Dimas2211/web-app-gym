// ─────────────────────────────────────────────────────────────────
// commerce/dte — mh-issuer-codes.ts
//
// MH20 (Fase 7, IMP20-011) — estructura AT de los códigos de
// establecimiento y punto de venta (Normativa 2.0 Anexo I regla 1.3 y
// Anexo IV campo 5; MH20-003/006/077): M|S|B|P + 3 dígitos / P + 3 dígitos.
//
// Pura y apta para cliente. Con MH_1_2 solo ADVIERTE (un emisor histórico
// con códigos no conformes sigue emitiendo); con MH_2_0 el preflight y los
// builders ya bloquean. Nunca recalcula números de control existentes.
// ─────────────────────────────────────────────────────────────────

export const MH_AT_COD_ESTABLE_RE     = /^[MSBP][0-9]{3}$/;
export const MH_AT_COD_PUNTO_VENTA_RE = /^P[0-9]{3}$/;

export function mhIssuerCodesWarnings(codes: {
  cod_estable_mh: string | null | undefined;
  cod_punto_venta_mh: string | null | undefined;
}): string[] {
  const out: string[] = [];
  const e = codes.cod_estable_mh?.trim() ?? "";
  const p = codes.cod_punto_venta_mh?.trim() ?? "";
  if (!e) out.push("Falta el código de establecimiento asignado por la AT (requerido con MH 2.0).");
  else if (!MH_AT_COD_ESTABLE_RE.test(e)) out.push(`El código de establecimiento "${e}" no sigue la estructura AT (M|S|B|P + 3 dígitos, ej. M001); MH 2.0 lo rechazará.`);
  if (!p) out.push("Falta el código de punto de venta asignado por la AT (requerido con MH 2.0).");
  else if (!MH_AT_COD_PUNTO_VENTA_RE.test(p)) out.push(`El código de punto de venta "${p}" no sigue la estructura AT (P + 3 dígitos, ej. P001); MH 2.0 lo rechazará.`);
  return out;
}
