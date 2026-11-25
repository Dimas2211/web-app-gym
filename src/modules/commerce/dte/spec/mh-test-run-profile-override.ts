// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/mh-test-run-profile-override.ts
//
// MH20 (Fase 9.0) — perfil normativo EXPLÍCITO de una corrida MH TEST del
// onboarding (Control Plane). Permite que la generación, la NC, la
// invalidación y la firma de los documentos de certificación usen el perfil
// PERSISTIDO de la corrida (fila M4) sin encender el interruptor global
// DTE_MH20_PROFILE_ENABLED ni cambiar el perfil del emisor.
//
// Reglas (fail-closed):
//   - Solo lo construye el puerto runtime del onboarding (source fija).
//   - Solo se acepta en ambiente TEST y para el emisor de la corrida.
//   - Nunca se aplica a PRODUCTION: devuelve error, no cae al perfil del
//     emisor.
//   - Sin override, los servicios se comportan exactamente como antes.
// ─────────────────────────────────────────────────────────────────

import type { DteSpecProfile } from "./dte-spec-profile";
import { isDteSpecProfile } from "./dte-spec-profile";

export interface MhTestRunSpecProfileOverride {
  readonly source:         "MH_TEST_RUN";
  readonly runId:          string;
  readonly issuerConfigId: string;
  readonly profile:        DteSpecProfile;
}

export function createMhTestRunSpecProfileOverride(input: {
  runId:          string;
  issuerConfigId: string;
  profile:        unknown;
}): MhTestRunSpecProfileOverride {
  if (!input.runId || !input.issuerConfigId) throw new Error("MH_TEST_RUN_OVERRIDE_INVALID: runId e issuerConfigId requeridos.");
  if (!isDteSpecProfile(input.profile)) throw new Error(`MH_TEST_RUN_OVERRIDE_INVALID: perfil desconocido "${String(input.profile)}".`);
  return Object.freeze({ source: "MH_TEST_RUN", runId: input.runId, issuerConfigId: input.issuerConfigId, profile: input.profile });
}

export type ApplyMhTestRunOverrideResult =
  | { ok: true; profile: DteSpecProfile }
  | { ok: false; error: string };

/**
 * Valida el override contra el documento/evento que se procesa. Cualquier
 * discrepancia es un error (no se ignora el override en silencio).
 */
export function applyMhTestRunSpecProfileOverride(
  override: MhTestRunSpecProfileOverride,
  target: { issuerConfigId: string | null | undefined; environment: string },
): ApplyMhTestRunOverrideResult {
  if (override.source !== "MH_TEST_RUN") return { ok: false, error: "Override de perfil con origen no admitido." };
  if (target.environment !== "TEST") {
    return { ok: false, error: "El perfil de una corrida MH TEST solo se aplica en ambiente TEST (PRODUCTION bloqueado)." };
  }
  if (!target.issuerConfigId || target.issuerConfigId !== override.issuerConfigId) {
    return { ok: false, error: "El documento no pertenece al emisor de la corrida MH TEST." };
  }
  return { ok: true, profile: override.profile };
}
