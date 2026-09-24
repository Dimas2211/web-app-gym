// ─────────────────────────────────────────────────────────────────
// commerce/shared — cat-022-identification-types.ts
//
// CAT-022 — Tipo de documento de identificación del Receptor
// (Catálogo - Sistema de Transmisión v1.2, MH El Salvador).
//
// Fuente única de códigos válidos para customers y suppliers.
// "Consumidor final" NO es un tipo de documento CAT-022: es una
// clasificación tributaria (taxpayer_type) y se representa con
// id_type_code = null, nunca con un código propio.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

/** Códigos oficiales CAT-022 — exactamente estos cinco. */
export const CAT022_ID_TYPE_CODES = ["02", "03", "13", "36", "37"] as const;

export type Cat022IdTypeCode = (typeof CAT022_ID_TYPE_CODES)[number];

export const cat022IdTypeCodeEnum = z.enum(CAT022_ID_TYPE_CODES, {
  errorMap: () => ({ message: "Tipo de identificación inválido." }),
});

export function isCat022IdTypeCode(value: string): value is Cat022IdTypeCode {
  return (CAT022_ID_TYPE_CODES as readonly string[]).includes(value);
}

/** Orden visual recomendado para selectores y fallbacks de UI. */
export const CAT022_ID_TYPE_OPTIONS: ReadonlyArray<{ code: Cat022IdTypeCode; name: string }> = [
  { code: "36", name: "NIT"                 },
  { code: "13", name: "DUI"                 },
  { code: "02", name: "Carnet de residente" },
  { code: "03", name: "Pasaporte"           },
  { code: "37", name: "Otro"                },
];
