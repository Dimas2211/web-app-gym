// dte/utils/fiscal-id.utils.ts
//
// Normaliza identificadores fiscales para el JSON DTE oficial MH El Salvador.
// Los valores en BD pueden incluir guiones; el schema exige solo dígitos.
//
// NIT: ^([0-9]{14}|[0-9]{9})$   "0614-000000-000-0" → "06140000000000"
// NRC: ^[0-9]{1,8}$             "123456-0"          → "1234560"
//
// NO modifica cómo se guardan los valores en Customer ni DteIssuerConfig.
// Solo se usa en el momento de construir el json_document DTE.

export function removeNonDigits(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.replace(/\D/g, "");
}

export function normalizeNitForDte(value: string | null | undefined): string | null {
  return removeNonDigits(value);
}

export function normalizeNrcForDte(value: string | null | undefined): string | null {
  return removeNonDigits(value);
}
