// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-v3-formulas.ts
//
// FEX-PROD-0B — fórmulas puras del resumen FEX 11 v3.
//
// Fuente: Manual Funcional del Sistema de Transmisión V2.0 (05/2026):
//   §XII   noGravado (cargos/abonos) se suma/resta hasta "Total a Pagar";
//          su consolidado va en totalNoGravado.
//   §XIV   C3 (IVA exportaciones 0%) se detalla en resumen.tributos
//          "aunque su valor sea $0.0".
//   §XVIII descuento por ítem en montoDescu (restado de precio×cantidad);
//          descuento global en descuGravada — "$0.00" cuando no se aplica;
//          totalDescu = Σ descuentos por ítem + descuentos globales.
//   Representación gráfica FEX V3: Total gravadas → Descuento global →
//          Seguro / Flete → Tributos → Monto Total de la Operación →
//          Total Otros Montos No Afectos → Total a Pagar.
//
// Alcance soportado por Zolvi (el builder bloquea lo demás):
//   - sin descuento global (descuGravada = 0);
//   - sin cargos/abonos no gravados (noGravado = 0 por línea);
//   - sin transferencias no onerosas (totalNoOnerosas = 0; toda línea con
//     ventaGravada > 0);
//   - sin saldo a favor aplicado (saldoFavor = 0).
// ─────────────────────────────────────────────────────────────────

export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface FexV3LineAmounts {
  ventaGravada: number;
  montoDescu:   number;
  noGravado:    number;
}

export interface FexV3ResumenInput {
  lines:        FexV3LineAmounts[];
  seguro:       number;
  flete:        number;
  descuGravada: number;   // descuento global a ventas gravadas
  tributosValor: number;  // Σ resumen.tributos[].valor (C3 = 0)
  saldoFavor:   number;
}

export interface FexV3ResumenTotals {
  totalGravada:        number;
  descuGravada:        number;
  totalDescu:          number;
  totalNoGravado:      number;
  montoTotalOperacion: number;
  totalPagar:          number;
}

export function computeFexV3ResumenTotals(input: FexV3ResumenInput): FexV3ResumenTotals {
  const totalGravada   = r2(input.lines.reduce((s, l) => s + l.ventaGravada, 0));
  const itemDiscounts  = r2(input.lines.reduce((s, l) => s + l.montoDescu, 0));
  const totalNoGravado = r2(input.lines.reduce((s, l) => s + l.noGravado, 0));
  const descuGravada   = r2(input.descuGravada);

  const montoTotalOperacion = r2(
    totalGravada - descuGravada + r2(input.seguro) + r2(input.flete) + r2(input.tributosValor),
  );
  // saldoFavor sigue la convención de los schemas hermanos (FE v2/CCFE v4:
  // maximum 0 — un saldo a favor es negativo y disminuye el total).
  const totalPagar = r2(montoTotalOperacion + totalNoGravado + r2(input.saldoFavor));

  return {
    totalGravada,
    descuGravada,
    totalDescu: r2(itemDiscounts + descuGravada),
    totalNoGravado,
    montoTotalOperacion,
    totalPagar,
  };
}
