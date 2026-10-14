// ─────────────────────────────────────────────────────────────────
// platform — effective-license-summary.ts
//
// Estado EFECTIVO de licencia para listados del Control Plane, derivado
// EXCLUSIVAMENTE de la política central (evaluateOrganizationAccess +
// describeEffectiveLicenseState) — mismas reglas, razones y etiquetas
// que PlatformLicensePanel en el detalle. Nunca se persiste: se
// recalcula en cada carga. Resultado plano y serializable (Server →
// Client Component).
// ─────────────────────────────────────────────────────────────────

import {
  evaluateOrganizationAccess,
  describeEffectiveLicenseState,
  type OrganizationAccessInput,
  type OrganizationAccessReason,
  type EffectiveLicenseTone,
} from "../runtime/organization-access-policy";

export interface PlatformEffectiveLicenseSummary {
  allowed: boolean;
  reason:  OrganizationAccessReason;
  label:   string;
  tone:    EffectiveLicenseTone;
}

/** Mismos colores que el badge "Estado efectivo" de PlatformLicensePanel. */
export const EFFECTIVE_LICENSE_TONE_COLORS: Record<EffectiveLicenseTone, string> = {
  ok:      "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  blocked: "bg-red-100 text-red-700",
};

export function summarizeEffectiveLicense(
  org: OrganizationAccessInput,
  now: Date,
): PlatformEffectiveLicenseSummary {
  const decision = evaluateOrganizationAccess(org, now);
  const { label, tone } = describeEffectiveLicenseState(org, decision);
  return { allowed: decision.allowed, reason: decision.reason, label, tone };
}
