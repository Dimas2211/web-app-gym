// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-control-number.ts
//
// Construye el numeroControl fiscal según formato oficial MH El Salvador:
//   DTE-{tipoDte(2)}-{codEstableMH(4)}{codPuntoVentaMH(4)}-{secuencia(15)}
//
// Longitud fija: 31 caracteres.
// Ejemplo real:  "DTE-01-M001P001-000000000000001"
//
// Los campos cod_estable_mh y cod_punto_venta_mh son los códigos reales
// asignados por MH al emisor — distintos de los códigos CAT-009 propios del sistema.
//
// Referencia de formato interno confirmada por DTEs reales importados:
//   "DTE-01-S001P002-000000000057584"
//   (bloque de 8 alfanuméricos + secuencia de 15 dígitos, sin año)
//
// Nota: el año se usa en DteCorrelative para particionar la secuencia
// internamente, pero NO forma parte del numeroControl fiscal.
// ─────────────────────────────────────────────────────────────────

export interface ControlNumberParams {
  dte_type_code:      string;
  cod_estable_mh:     string | null;
  cod_punto_venta_mh: string | null;
  sequence:           number;
}

export function buildControlNumber(p: ControlNumberParams): string {
  if (!p.dte_type_code?.trim()) {
    throw new Error("buildControlNumber: dte_type_code es requerido.");
  }

  if (!p.cod_estable_mh || !p.cod_punto_venta_mh) {
    throw new Error(
      "Faltan códigos MH de establecimiento y punto de venta para este emisor/ambiente. " +
      "Configure cod_estable_mh y cod_punto_venta_mh en la configuración del emisor DTE.",
    );
  }

  const estab = p.cod_estable_mh.trim().toUpperCase();
  const pos   = p.cod_punto_venta_mh.trim().toUpperCase();

  if (estab.length !== 4) {
    throw new Error(
      `buildControlNumber: cod_estable_mh debe tener exactamente 4 caracteres. ` +
      `Obtenido: "${estab}" (${estab.length} chars).`,
    );
  }
  if (pos.length !== 4) {
    throw new Error(
      `buildControlNumber: cod_punto_venta_mh debe tener exactamente 4 caracteres. ` +
      `Obtenido: "${pos}" (${pos.length} chars).`,
    );
  }

  const type  = p.dte_type_code.trim().toUpperCase().padStart(2, "0").slice(0, 2);
  const block = `${estab}${pos}`;

  if (!Number.isInteger(p.sequence) || p.sequence < 1) {
    throw new Error(`buildControlNumber: sequence debe ser un entero positivo. Recibido: ${p.sequence}.`);
  }

  const seq    = p.sequence.toString().padStart(15, "0");
  const result = `DTE-${type}-${block}-${seq}`;

  // Longitud fija esperada: 4 + 2 + 1 + 8 + 1 + 15 = 31
  if (result.length !== 31) {
    throw new Error(
      `buildControlNumber: resultado inválido. Longitud esperada 31, obtenida ${result.length}. Valor: "${result}".`,
    );
  }

  return result;
}
