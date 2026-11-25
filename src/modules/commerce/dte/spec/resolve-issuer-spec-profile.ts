// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/resolve-issuer-spec-profile.ts
//
// MH20 (IMP20-004/005) — perfil activo del emisor para GENERAR un DTE.
//
// Lee DteIssuerConfig.mh_spec_profile SOLO con el interruptor encendido
// (mh20ProfileSelect); apagado → MH_1_2 sin consultar la columna M1.
// Aplica la regla de seguridad de pendingConfirmation / blocked.
// Compartido por los generadores FE / CCF / NC / FSE / FEX.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { mh20ProfileSelect } from "../config/dte-mh20.flags";
import type { DteSpecProfile } from "./dte-spec-profile";
import type { DteSpecKind } from "./dte-spec-registry";
import { assertDteSpecGenerationAllowed, resolveActiveDteSpecProfile } from "./resolve-active-dte-spec-profile";
import { applyMhTestRunSpecProfileOverride, type MhTestRunSpecProfileOverride } from "./mh-test-run-profile-override";

export type ResolveIssuerSpecProfileResult =
  | { ok: true; profile: DteSpecProfile; warning: string | null }
  | { ok: false; error: string };

export async function resolveIssuerSpecProfileForGeneration(
  db:             PrismaClient,
  issuerConfigId: string,
  tenantId:       string,
  locationId:     string,
  environment:    string,
  kind:           DteSpecKind,
  // MH20 (Fase 9.0): perfil persistido de una corrida MH TEST. Solo TEST y
  // solo el emisor de la corrida; no consulta el interruptor global.
  override?:      MhTestRunSpecProfileOverride | null,
): Promise<ResolveIssuerSpecProfileResult> {
  if (override) {
    const applied = applyMhTestRunSpecProfileOverride(override, { issuerConfigId, environment });
    if (!applied.ok) return { ok: false, error: applied.error };
    const allowedOverride = assertDteSpecGenerationAllowed(applied.profile, kind, environment);
    if (!allowedOverride.ok) return { ok: false, error: allowedOverride.error };
    return { ok: true, profile: applied.profile, warning: allowedOverride.warning };
  }
  let mhSpecProfile: string | null = null;
  if (mh20ProfileSelect().mh_spec_profile) {
    const row = await db.dteIssuerConfig.findFirst({
      where:  { id: issuerConfigId, tenant_id: tenantId, location_id: locationId },
      select: { mh_spec_profile: true },
    });
    if (!row) {
      return { ok: false, error: "La configuración DTE del emisor no existe o no pertenece a esta location." };
    }
    mhSpecProfile = row.mh_spec_profile ?? null;
  }
  const active = resolveActiveDteSpecProfile({ mh_spec_profile: mhSpecProfile });
  if (!active.ok) return { ok: false, error: active.error };
  const allowed = assertDteSpecGenerationAllowed(active.profile, kind, environment);
  if (!allowed.ok) return { ok: false, error: allowed.error };
  return { ok: true, profile: active.profile, warning: allowed.warning };
}
