// ─────────────────────────────────────────────────────────────────
// platform — import-policy.ts
//
// E1B.1: Helper de política de importación para el Data Onboarding Center.
// Define las reglas que determinan qué pasa con cada fila según si el
// registro ya existe en la base destino y la política activa.
//
// Reglas de seguridad:
// - Solo lógica pura — sin Prisma, sin queries, sin efectos secundarios.
// - No importa ni ejecuta nada externo.
// ─────────────────────────────────────────────────────────────────

import type {
  DataOnboardingImportPolicy,
  DataOnboardingRowResolution,
  DataOnboardingRowError,
  DataOnboardingRowWarning,
} from "../../types/platform.types";

// ── Resultado de aplicar la política a una fila ───────────────────

export interface PolicyApplicationResult {
  resolution: DataOnboardingRowResolution;
  errors:     DataOnboardingRowError[];
  warnings:   DataOnboardingRowWarning[];
}

/**
 * Aplica la política de importación a una fila dada su existencia en DB.
 *
 * CREATE_ONLY:
 *   - existsInDb=false → CREATE
 *   - existsInDb=true  → ERROR ("ya existe, política CREATE_ONLY no permite actualizar")
 *
 * UPDATE_EXISTING (futuro, deshabilitado en UI):
 *   - existsInDb=true  → UPDATE
 *   - existsInDb=false → SKIP (no crea registros nuevos)
 *
 * UPSERT (futuro, deshabilitado en UI):
 *   - existsInDb=false → CREATE
 *   - existsInDb=true  → UPDATE
 */
export function applyImportPolicy(
  policy:      DataOnboardingImportPolicy,
  existsInDb:  boolean,
  naturalKey:  string,
): PolicyApplicationResult {
  switch (policy) {
    case "CREATE_ONLY":
      if (!existsInDb) {
        return { resolution: "CREATE", errors: [], warnings: [] };
      }
      return {
        resolution: "ERROR",
        errors: [{
          code:    "DUPLICATE_IN_DATABASE",
          message: `Ya existe en la base destino (política CREATE_ONLY). Clave: "${naturalKey}".`,
        }],
        warnings: [],
      };

    case "UPDATE_EXISTING":
      if (existsInDb) {
        return { resolution: "UPDATE", errors: [], warnings: [] };
      }
      return {
        resolution: "SKIP",
        errors: [],
        warnings: [{
          code:    "NOT_IN_DATABASE",
          message: `No existe en base destino (política UPDATE_EXISTING omite creaciones). Clave: "${naturalKey}".`,
        }],
      };

    case "UPSERT":
      return {
        resolution: existsInDb ? "UPDATE" : "CREATE",
        errors:     [],
        warnings:   [],
      };
  }
}

/**
 * Devuelve la etiqueta legible de una política.
 */
export function importPolicyLabel(policy: DataOnboardingImportPolicy): string {
  switch (policy) {
    case "CREATE_ONLY":      return "Solo crear nuevos";
    case "UPDATE_EXISTING":  return "Solo actualizar existentes";
    case "UPSERT":           return "Crear o actualizar";
  }
}

/**
 * Políticas habilitadas en UI para E1B.1.
 * UPDATE_EXISTING y UPSERT están deshabilitadas hasta E1C.
 */
export const ENABLED_IMPORT_POLICIES: DataOnboardingImportPolicy[] = ["CREATE_ONLY"];

export const DEFAULT_IMPORT_POLICY: DataOnboardingImportPolicy = "CREATE_ONLY";
