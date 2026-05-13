// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-control-number.ts
//
// Construye el numeroControl fiscal según formato oficial MH El Salvador:
//   DTE-{tipoDte(2)}-{codigoEstablecimiento(4)}{codigoPuntoVenta(4)}-{secuencia(15)}
//
// Longitud fija: 31 caracteres.
// Fuente de referencia interna: DTEs importados vía purchases muestran
//   el formato real: "DTE-01-S001P002-000000000057584"
//   (bloque de 8 alfanuméricos + secuencia de 15 dígitos, sin año).
//
// Nota: el año se usa en DteCorrelative para particionar la secuencia
// internamente, pero NO forma parte del numeroControl fiscal.
// ─────────────────────────────────────────────────────────────────

export interface ControlNumberParams {
  dte_type_code:      string;
  establishment_code: string | null;
  point_of_sale_code: string | null;
  sequence:           number;
}

export function buildControlNumber(p: ControlNumberParams): string {
  const type  = p.dte_type_code.trim().toUpperCase().padStart(2, "0").slice(0, 2);
  const estab = (p.establishment_code ?? "0000").trim().toUpperCase().padStart(4, "0").slice(0, 4);
  const pos   = (p.point_of_sale_code  ?? "0000").trim().toUpperCase().padStart(4, "0").slice(0, 4);
  const block = `${estab}${pos}`;

  if (!p.dte_type_code?.trim()) {
    throw new Error("buildControlNumber: dte_type_code es requerido.");
  }
  if (block.length !== 8) {
    throw new Error(`buildControlNumber: bloque central debe tener 8 caracteres. Obtenido: "${block}".`);
  }
  if (!Number.isInteger(p.sequence) || p.sequence < 1) {
    throw new Error(`buildControlNumber: sequence debe ser un entero positivo. Recibido: ${p.sequence}.`);
  }

  const seq    = p.sequence.toString().padStart(15, "0");
  const result = `DTE-${type}-${block}-${seq}`;

  // Longitud fija esperada: 4 + 2 + 1 + 8 + 1 + 15 = 31
  if (result.length !== 31) {
    throw new Error(`buildControlNumber: resultado inválido. Longitud esperada 31, obtenida ${result.length}. Valor: "${result}".`);
  }

  return result;
}
