// ─────────────────────────────────────────────────────────────────
// lib/utils — form-data-parsers.ts
//
// Helpers de parseo de FormData para Server Actions.
// Centraliza la conversión FormDataEntryValue → tipos primitivos
// que necesita Zod para validar correctamente.
//
// Convención:
//   str()         → string | undefined  (undefined dispara required_error en Zod)
//   strNullable() → string | null       (null es válido para campos opcionales nullable)
//
// No importar desde Client Components — estos helpers son solo para
// server actions ("use server"). FormData solo existe en el servidor.
// ─────────────────────────────────────────────────────────────────

/**
 * Parsea un campo requerido de FormData.
 * Devuelve undefined si el campo no existe o es cadena vacía,
 * lo que hace que Zod dispare required_error en campos obligatorios.
 */
export function str(value: FormDataEntryValue | null): string | undefined {
  const s = value as string | null;
  if (s === null || s === undefined) return undefined;
  const trimmed = s.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Parsea un campo opcional nullable de FormData.
 * Devuelve null si el campo no existe o es cadena vacía,
 * lo que es válido para campos opcionales nullable en el schema Zod.
 */
export function strNullable(value: FormDataEntryValue | null): string | null {
  const s = value as string | null;
  if (!s || s.trim() === "") return null;
  return s.trim();
}
