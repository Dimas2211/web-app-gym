// ─────────────────────────────────────────────────────────────────
// commerce/dte — utils/nc-v4-formulas.ts
//
// MH20 (IMP20-015) — fórmulas de la Nota de Crédito v4 (fe-nc-v4.json),
// trazadas a la Normativa 2.0 (Anexo II y tabla de validaciones p. 119-120):
//
//   ítem  98 noGravado  = 0      (Zolvi no registra cargos/abonos no gravados)
//   ítem  99 ivaPerci   = 0      (sin percepción: no se habilitan retenciones nuevas)
//   ítem 100 totalIva   = 0      (solo aplica a CR; "De no existir IVA 13% en CR deberá ingresar $0.00")
//   ítem 101 ivaRete    = 0      (sin retención)
//   143 ivaPerci / 145 ivaRete / 146 totalIva / 151 totalNoGravado = Σ ítems
//   144 codigoRetencionMH = null (documento a ajustar 03-CCFE, 144.2)
//   150 montoTotalOperacion = "Suma de operaciones" (subTotalVentas) + "Valor de tributo" (150.3)
//   153 totalPagar = MTO + ivaPerci − ivaRete ± totalNoGravado (153.3), ≥ 0
//   Holgura ±0.01 (150.7 / 153.8).
//
// Puras: sin base de datos. El IVA del tributo "20" se calcula igual que
// en la NC v3 vigente (totalGravada × 0.13, redondeo a 2 decimales).
// ─────────────────────────────────────────────────────────────────

const r2 = (n: number): number => Math.round(n * 100) / 100;

export interface NcV4ItemAdjustments {
  noGravado: number;
  ivaPerci:  number;
  totalIva:  number;
  ivaRete:   number;
}

/** Ajustes por ítem cuando el documento relacionado es un CCFE (03). */
export function ncV4ItemAdjustmentsForCcf(): NcV4ItemAdjustments {
  return { noGravado: 0, ivaPerci: 0, totalIva: 0, ivaRete: 0 };
}

export interface NcV4Totals {
  totalNoSuj:          number;
  totalExenta:         number;
  totalGravada:        number;
  subTotalVentas:      number;
  totalDescu:          number;
  ivaTributo:          number;
  montoTotalOperacion: number;
  ivaPerci:            number;
  totalIva:            number;
  ivaRete:             number;
  totalNoGravado:      number;
  totalPagar:          number;
}

export function computeNcV4Totals(
  items: ReadonlyArray<{
    ventaNoSuj: number; ventaExenta: number; ventaGravada: number; montoDescu: number;
  } & NcV4ItemAdjustments>,
): NcV4Totals {
  const sum = (f: (i: (typeof items)[number]) => number) => r2(items.reduce((s, i) => s + f(i), 0));
  const totalNoSuj     = sum((i) => i.ventaNoSuj);
  const totalExenta    = sum((i) => i.ventaExenta);
  const totalGravada   = sum((i) => i.ventaGravada);
  const totalDescu     = sum((i) => i.montoDescu); // informativo (los ítems ya vienen netos)
  const subTotalVentas = r2(totalNoSuj + totalExenta + totalGravada);
  const ivaTributo     = r2(totalGravada * 0.13);
  const montoTotalOperacion = r2(subTotalVentas + ivaTributo);
  const ivaPerci       = sum((i) => i.ivaPerci);
  const totalIva       = sum((i) => i.totalIva);
  const ivaRete        = sum((i) => i.ivaRete);
  const totalNoGravado = sum((i) => i.noGravado);
  const totalPagar     = Math.max(0, r2(montoTotalOperacion + ivaPerci - ivaRete + totalNoGravado));
  return {
    totalNoSuj, totalExenta, totalGravada, subTotalVentas, totalDescu, ivaTributo,
    montoTotalOperacion, ivaPerci, totalIva, ivaRete, totalNoGravado, totalPagar,
  };
}
