// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — data-onboarding-confirmation.ts
//
// SHARED-OPS-PARITY-1. Texto de confirmación esperado para EXECUTE.
// Sin "use server" ni dependencias server — importable desde el
// client component (solo para UX) y desde el pipeline server-side
// (fuente de verdad, con el organization.code leído del Control Plane).
//
// - No PRODUCTION: el texto histórico sin cambios ("IMPORT PRODUCTS").
// - PRODUCTION: el texto histórico + código de la organización destino
//   ("IMPORT PRODUCTS commerce-pilot-0001"), para que la confirmación
//   identifique explícitamente a quién se escribe.
// ─────────────────────────────────────────────────────────────────

export function buildDataOnboardingConfirmationText(
  baseConfirmationText: string,
  environment: string,
  organizationCode: string,
): string {
  return environment === "PRODUCTION"
    ? `${baseConfirmationText} ${organizationCode}`
    : baseConfirmationText;
}

/** Orden operativo recomendado para cargar un Commerce nuevo. */
export const DATA_ONBOARDING_RECOMMENDED_ORDER = [
  "Baseline Commerce (automático al provisionar / reparación desde Platform Admin)",
  "Categorías",
  "Líneas",
  "Sublíneas",
  "Proveedores",
  "Clientes",
  "Productos",
  "Inventario inicial",
] as const;
