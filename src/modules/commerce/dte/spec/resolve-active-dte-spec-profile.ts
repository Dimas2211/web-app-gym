// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/resolve-active-dte-spec-profile.ts
//
// MH20 (IMP20-004) — perfil normativo ACTIVO de un emisor.
//
//   1. Interruptor de despliegue OFF → MH_1_2 siempre.
//   2. ON → DteIssuerConfig.mh_spec_profile ?? MH_1_2.
//   3. Valor persistido desconocido → error (fail-closed, sin inferir).
//
// DteIssuerConfig es único por tenant + location + environment, así que
// el perfil de TEST y el de PRODUCTION del mismo emisor son
// independientes por construcción.
//
// assertDteSpecGenerationAllowed aplica la regla de seguridad de §2.2:
// MH_2_0 + entrada pendingConfirmation → bloqueo en PRODUCTION; en TEST
// se permite con advertencia. Una entrada `blocked` (funcionalidad no
// implementada en esta fase) bloquea en cualquier ambiente.
// ─────────────────────────────────────────────────────────────────

import { isDteMh20ProfileEnabled } from "../config/dte-mh20.flags";
import { DEFAULT_DTE_SPEC_PROFILE, parseDteSpecProfile, type DteSpecProfile } from "./dte-spec-profile";
import { getDteSpec, type DteSpecEntry, type DteSpecKind } from "./dte-spec-registry";

export type DteEnvironmentName = "TEST" | "PRODUCTION";

export type ResolveActiveDteSpecProfileResult =
  | { ok: true; profile: DteSpecProfile }
  | { ok: false; error: string };

export function resolveActiveDteSpecProfile(
  issuer: { mh_spec_profile?: string | null } | null | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): ResolveActiveDteSpecProfileResult {
  if (!isDteMh20ProfileEnabled(env)) return { ok: true, profile: DEFAULT_DTE_SPEC_PROFILE };
  const parsed = parseDteSpecProfile(issuer?.mh_spec_profile ?? null);
  if (!parsed) {
    return {
      ok:    false,
      error: `El emisor DTE tiene un perfil normativo desconocido ("${issuer?.mh_spec_profile}"). Valores admitidos: MH_1_2, MH_2_0.`,
    };
  }
  return { ok: true, profile: parsed };
}

export type AssertDteSpecGenerationResult =
  | { ok: true; spec: DteSpecEntry; warning: string | null }
  | { ok: false; error: string };

export function assertDteSpecGenerationAllowed(
  profile: DteSpecProfile,
  kind: DteSpecKind,
  environment: string,
): AssertDteSpecGenerationResult {
  const spec = getDteSpec(profile, kind);
  if (!spec) {
    return { ok: false, error: `El tipo "${kind}" no existe en el perfil normativo ${profile}.` };
  }
  if (spec.blocked) {
    return {
      ok:    false,
      error: `La emisión de "${kind}" con el perfil ${profile} está bloqueada: ${spec.blocked}.`,
    };
  }
  if (spec.pendingConfirmation) {
    if (environment === "PRODUCTION") {
      return {
        ok:    false,
        error:
          `La versión ${spec.version} de "${kind}" en el perfil ${profile} está pendiente de confirmación oficial ` +
          `(${spec.pendingConfirmation}). No se permite su uso en PRODUCTION.`,
      };
    }
    return {
      ok:      true,
      spec,
      warning: `Versión pendiente de confirmación oficial (${spec.pendingConfirmation}); uso permitido solo en TEST.`,
    };
  }
  return { ok: true, spec, warning: null };
}
