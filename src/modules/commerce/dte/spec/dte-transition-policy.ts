// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/dte-transition-policy.ts
//
// MH20 (IMP20-006, §2.3 del diseño) — política de transición para
// documentos pendientes cuando cambia el perfil normativo del emisor.
//
//   PENDING_GENERATION            → se genera con el perfil activo.
//   GENERATED / SCHEMA_VALIDATED  → si su perfil ≠ activo: REGENERATE
//                                   (mismo numeroControl / codigoGeneracion).
//   SIGNED / contingencia         → TRANSMIT_AS_IS (D3) o
//                                   REGENERATE_REQUIRED según
//                                   DTE_MH20_PENDING_POLICY (MH20-094 abierto).
//   ACCEPTED / OBSERVED / otros   → IMMUTABLE.
//
// Función pura: decide, no ejecuta. Nunca reserva correlativos.
// ─────────────────────────────────────────────────────────────────

import type { DteMh20PendingPolicy } from "../config/dte-mh20.flags";
import type { DteSpecProfile } from "./dte-spec-profile";

export type DteTransitionDecision =
  | "GENERATE_WITH_ACTIVE"
  | "PROCEED"
  | "REGENERATE"
  | "TRANSMIT_AS_IS"
  | "REGENERATE_REQUIRED"
  | "IMMUTABLE";

const UNSIGNED = new Set(["GENERATED", "SCHEMA_VALIDATED"]);
const SIGNED_PENDING = new Set(["SIGNED", "CONTINGENCY_PENDING"]);

export function decideDteTransition(params: {
  dteStatus:     string;
  docProfile:    DteSpecProfile | "AMBIGUOUS" | null;
  activeProfile: DteSpecProfile;
  policy:        DteMh20PendingPolicy;
}): DteTransitionDecision {
  const { dteStatus, docProfile, activeProfile, policy } = params;
  if (dteStatus === "PENDING_GENERATION") return "GENERATE_WITH_ACTIVE";
  // AMBIGUOUS (FEX v3) es válido en ambos perfiles.
  const sameProfile = docProfile === activeProfile || docProfile === "AMBIGUOUS";
  if (UNSIGNED.has(dteStatus)) return sameProfile ? "PROCEED" : "REGENERATE";
  if (SIGNED_PENDING.has(dteStatus)) {
    if (sameProfile) return "PROCEED";
    return policy === "REGENERATE_REQUIRED" ? "REGENERATE_REQUIRED" : "TRANSMIT_AS_IS";
  }
  return "IMMUTABLE";
}
