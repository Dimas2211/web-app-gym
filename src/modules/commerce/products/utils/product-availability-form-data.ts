// Los checkboxes desmarcados no se incluyen en FormData.
// Conservar booleanos explícitos para las validaciones Zod existentes del servidor.
export function normalizeProductAvailabilityFormData(formData: FormData): void {
  for (const field of ["allow_sale", "allow_purchase"] as const) {
    formData.set(field, String(formData.get(field) === "true"));
  }
}
