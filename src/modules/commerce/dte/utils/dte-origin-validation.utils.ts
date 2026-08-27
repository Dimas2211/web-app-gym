// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-origin-validation.utils.ts
//
// Regla XOR reusable para el origen de un DteOutgoingDocument.
//
// Desde F3 (FSE 14) el documento admite dos orígenes posibles:
//   - sale_id      → FE 01, CCFE 03, NC 05, FEX 11.
//   - purchase_id  → FSE 14.
//
// Exactamente uno debe estar presente. Nunca ambos, nunca ninguno.
// No es una abstracción polimórfica general — solo valida la
// combinación de dos columnas nullable. Debe invocarse desde
// cualquier service que cree o lea un DteOutgoingDocument confiando
// en su origen, nunca solo desde la UI.
// ─────────────────────────────────────────────────────────────────

export type DteOrigin =
  | { kind: "sale";     sale_id: string }
  | { kind: "purchase"; purchase_id: string };

export type AssertDteOriginResult =
  | { ok: true; origin: DteOrigin }
  | { ok: false; error: string };

export function assertExactlyOneDteOrigin(
  sale_id:     string | null | undefined,
  purchase_id: string | null | undefined,
): AssertDteOriginResult {
  const hasSale     = !!sale_id;
  const hasPurchase = !!purchase_id;

  if (hasSale && hasPurchase) {
    return {
      ok:    false,
      error: "El documento DTE no puede tener sale_id y purchase_id simultáneamente.",
    };
  }
  if (!hasSale && !hasPurchase) {
    return {
      ok:    false,
      error: "El documento DTE debe tener exactamente un origen: sale_id o purchase_id.",
    };
  }

  return hasSale
    ? { ok: true, origin: { kind: "sale", sale_id: sale_id as string } }
    : { ok: true, origin: { kind: "purchase", purchase_id: purchase_id as string } };
}
