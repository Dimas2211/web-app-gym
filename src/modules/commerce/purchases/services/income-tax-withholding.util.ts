// ─────────────────────────────────────────────────────────────────
// commerce/purchases — income-tax-withholding.util.ts
//
// Cálculo puro de la Retención de Renta sobre una compra, aplicable
// a FSE 14 (compra a sujeto excluido). Sin acceso a Prisma — se
// invoca desde purchase.service.ts, que persiste el resultado.
//
// Regla de negocio (NO se deriva de "es FSE" — depende de la
// naturaleza del pago declarada + la clasificación del proveedor):
//
//   GOODS               → nunca aplica (0/0/0)
//   SERVICES            → 10% sobre totalCompra SOLO si proveedor es
//                          persona natural. Persona jurídica → 0.
//                          UNKNOWN → bloqueado (requiere decisión explícita).
//   GOODS_AND_SERVICES  → 10% sobre una base manual (monto de servicios),
//                          0 <= base <= totalCompra. Igual regla de persona.
//   LUMP_SUM_CONTRACT   → 10% sobre totalCompra completo. Igual regla de persona.
//   OTHER               → nunca aplica (0/0/0)
//
// totalCompra = Purchase.subtotal (= suma de line_subtotal, SIN impuesto).
// Es el equivalente exacto de resumen.totalCompra en el JSON FSE — no
// Purchase.total_amount, que incluye tax_amount y no es lo que consume FSE.
//
// Redondeo monetario: 2 decimales, half-up sobre centavos (evita 299.999999).
// ─────────────────────────────────────────────────────────────────

export type PaymentNature =
  | "GOODS"
  | "SERVICES"
  | "GOODS_AND_SERVICES"
  | "LUMP_SUM_CONTRACT"
  | "OTHER";

export type SupplierPersonType = "NATURAL_PERSON" | "LEGAL_ENTITY" | "UNKNOWN";

const AUTOMATIC_RATE = 10; // 10.00%

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface WithholdingResult {
  applies: boolean;
  rate:    number | null;
  base:    number;
  amount:  number;
}

export type ComputeWithholdingResult =
  | { ok: true; result: WithholdingResult }
  | { ok: false; error: string; field?: "manual_base" };

const ZERO: WithholdingResult = { applies: false, rate: null, base: 0, amount: 0 };

/**
 * Calcula la Retención de Renta para una compra dada su naturaleza de pago,
 * el totalCompra (Purchase.subtotal, sin impuesto) y la clasificación del
 * proveedor. `manualBase` solo se usa (y se exige) para GOODS_AND_SERVICES.
 *
 * No decide nada por el solo hecho de ser FSE — la naturaleza es siempre
 * una decisión explícita del usuario, capturada en Purchase.payment_nature.
 */
export function computeIncomeTaxWithholding(params: {
  paymentNature:      PaymentNature | null;
  supplierPersonType: SupplierPersonType;
  totalCompra:        number;
  manualBase?:         number | null;
}): ComputeWithholdingResult {
  const { paymentNature, supplierPersonType, totalCompra, manualBase } = params;

  if (totalCompra < 0) {
    return { ok: false, error: "El total de la compra no puede ser negativo." };
  }

  if (paymentNature == null || paymentNature === "GOODS" || paymentNature === "OTHER") {
    return { ok: true, result: ZERO };
  }

  const isNatural = supplierPersonType === "NATURAL_PERSON";
  const isLegal   = supplierPersonType === "LEGAL_ENTITY";

  if (paymentNature === "SERVICES" || paymentNature === "LUMP_SUM_CONTRACT") {
    if (!isNatural) {
      // Persona jurídica → no se aplica automáticamente solo por la naturaleza.
      // UNKNOWN → bloquear automatización silenciosa, exigir clasificación.
      if (isLegal) return { ok: true, result: ZERO };
      return {
        ok:    false,
        error: "El proveedor no tiene clasificación persona natural/jurídica definida (UNKNOWN). " +
               "Defina la clasificación del proveedor antes de aplicar Retención de Renta automática, " +
               "o registre la compra con Naturaleza del pago = Otro si no corresponde.",
      };
    }
    const base   = r2(totalCompra);
    const amount = r2(base * (AUTOMATIC_RATE / 100));
    return { ok: true, result: { applies: true, rate: AUTOMATIC_RATE, base, amount } };
  }

  // GOODS_AND_SERVICES — base manual obligatoria (monto correspondiente a servicios)
  const base = manualBase ?? null;
  if (base == null) {
    return { ok: false, error: "Debe indicar el monto correspondiente a servicios.", field: "manual_base" };
  }
  if (base < 0) {
    return { ok: false, error: "La base sujeta a Renta no puede ser negativa.", field: "manual_base" };
  }
  if (base > totalCompra + 0.01) {
    return { ok: false, error: "La base sujeta a Renta no puede superar el total de la compra.", field: "manual_base" };
  }
  const clampedBase = r2(Math.min(base, totalCompra));

  if (!isNatural) {
    if (isLegal) return { ok: true, result: { applies: false, rate: null, base: 0, amount: 0 } };
    return {
      ok:    false,
      error: "El proveedor no tiene clasificación persona natural/jurídica definida (UNKNOWN). " +
             "Defina la clasificación del proveedor antes de aplicar Retención de Renta automática.",
    };
  }

  if (clampedBase === 0) {
    return { ok: true, result: { applies: false, rate: null, base: 0, amount: 0 } };
  }

  const amount = r2(clampedBase * (AUTOMATIC_RATE / 100));
  return { ok: true, result: { applies: true, rate: AUTOMATIC_RATE, base: clampedBase, amount } };
}
