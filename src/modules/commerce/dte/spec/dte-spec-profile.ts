// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/dte-spec-profile.ts
//
// MH20 (IMP20-001) — perfiles normativos del motor fiscal DTE.
//
//   MH_1_2 → normativa vigente (Normativa 1.2 + schemas históricos).
//   MH_2_0 → Normativa de Cumplimiento DTE versión 2.0 (25/05/2026).
//
// Un solo motor fiscal (D1): los builders reciben el perfil como
// parámetro. El perfil por defecto es SIEMPRE MH_1_2; MH_2_0 solo se
// usa cuando el interruptor de despliegue está encendido Y el emisor
// lo tiene configurado (ver resolve-active-dte-spec-profile.ts).
// ─────────────────────────────────────────────────────────────────

export const DTE_SPEC_PROFILES = ["MH_1_2", "MH_2_0"] as const;

export type DteSpecProfile = (typeof DTE_SPEC_PROFILES)[number];

/** Perfil aplicado cuando no hay configuración explícita (null = MH_1_2). */
export const DEFAULT_DTE_SPEC_PROFILE: DteSpecProfile = "MH_1_2";

export function isDteSpecProfile(value: unknown): value is DteSpecProfile {
  return typeof value === "string" && (DTE_SPEC_PROFILES as readonly string[]).includes(value);
}

/**
 * Normaliza el valor persistido (columna TEXT nullable). null/undefined
 * → MH_1_2. Un valor desconocido NO se interpreta: devuelve null para
 * que el llamador falle de forma cerrada.
 */
export function parseDteSpecProfile(value: unknown): DteSpecProfile | null {
  if (value === null || value === undefined) return DEFAULT_DTE_SPEC_PROFILE;
  return isDteSpecProfile(value) ? value : null;
}

/** Etiqueta legible para UI / reportes. */
export function dteSpecProfileLabel(profile: DteSpecProfile | "AMBIGUOUS"): string {
  switch (profile) {
    case "MH_1_2":    return "MH 1.2";
    case "MH_2_0":    return "MH 2.0";
    case "AMBIGUOUS": return "MH 1.2/2.0 (versión común)";
  }
}
