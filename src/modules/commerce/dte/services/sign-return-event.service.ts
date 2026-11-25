// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-return-event.service.ts
//
// MH20 (Fase 6, IMP20-022) — firma un DteReturnEvent en DRAFT con el
// firmador EXISTENTE (resolveDteSignerConfigForIssuer + MhHttpDteSignerAdapter,
// mismo mecanismo que sign-invalidation-event.service.ts). No se duplica
// el servicio de firma ni se tocan credenciales.
//
// Reglas:
//   - Solo DRAFT con event_json y sin JWS.
//   - Revalida AJV (fe-eret-v1) del JSON persistido antes de firmar.
//   - Perfil MH_2_0 vigente para el emisor/ambiente (PRODUCTION fail-closed).
//   - Firma OK → SIGNED + signed_jws + signed_at. Falla → DRAFT + last_error.
//   - El JWS nunca se registra en logs.
//   - El adaptador de firma es inyectable SOLO para pruebas (mocks).
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { DteSignerConfigError } from "../config/dte-signer.config";
import { resolveDteSignerConfigForIssuer } from "./dte-credential.service";
import { MhHttpDteSignerAdapter } from "../adapters/dte-signer.adapter";
import { validateMhEventJson } from "../spec/validate-mh-event-json";
import { resolveIssuerSpecProfileForGeneration } from "../spec/resolve-issuer-spec-profile";
import type { DteMhEnvironment } from "../types/dte-mh-auth.types";

export interface SignReturnEventParams {
  returnEventId: string;
  userId:        string | null;
  tenantId:      string;
  locationId:    string;
}

export type SignReturnEventResult =
  | { ok: true; status: "SIGNED"; signedAt: string }
  | { ok: false; error: string };

type SignerLike = Pick<MhHttpDteSignerAdapter, "sign">;

export interface SignReturnEventDeps {
  signer?:          SignerLike;
  resolveSigner?:   typeof resolveDteSignerConfigForIssuer;
}

class SignReturnBusinessError extends Error {}

export async function signReturnEvent(
  params: SignReturnEventParams,
  db: PrismaClient = prisma,
  deps: SignReturnEventDeps = {},
): Promise<SignReturnEventResult> {
  const { returnEventId, userId, tenantId, locationId } = params;
  try {
    const ev = await db.dteReturnEvent.findFirst({
      where:  { id: returnEventId, tenant_id: tenantId, location_id: locationId },
      select: { id: true, status: true, event_json: true, signed_jws: true, issuer_config_id: true, environment: true },
    });
    if (!ev) throw new SignReturnBusinessError("El Evento de Retorno no existe o no pertenece a la location activa.");
    if (ev.status !== "DRAFT") throw new SignReturnBusinessError(`Solo se firman Retornos en DRAFT. Estado actual: "${ev.status}".`);
    if (!ev.event_json) throw new SignReturnBusinessError("El Evento de Retorno no tiene event_json.");
    if (ev.signed_jws !== null) throw new SignReturnBusinessError("El Evento de Retorno ya tiene JWS.");

    const check = validateMhEventJson("18", ev.event_json);
    if (!check.ok) throw new SignReturnBusinessError(`${check.error} ${check.validation_errors.map((e) => `${e.path}: ${e.message}`).join(" | ")}`);

    const profile = await resolveIssuerSpecProfileForGeneration(db, ev.issuer_config_id, tenantId, locationId, ev.environment, "18");
    if (!profile.ok) throw new SignReturnBusinessError(profile.error);
    if (profile.profile !== "MH_2_0") throw new SignReturnBusinessError("El emisor ya no tiene el perfil MH_2_0 activo: firma del Retorno bloqueada.");

    const resolution = await (deps.resolveSigner ?? resolveDteSignerConfigForIssuer)({
      issuerConfigId: ev.issuer_config_id,
      environment:    ev.environment as DteMhEnvironment,
      client:         db,
    });
    if (!resolution.ok) throw new SignReturnBusinessError(resolution.error);
    const { config, nit, passwordPri } = resolution;

    const signer = deps.signer ?? new MhHttpDteSignerAdapter();
    const res = await signer.sign({ nit, passwordPri, dteJson: ev.event_json }, config);
    const at = new Date();
    if (res.ok) {
      await db.dteReturnEvent.update({
        where: { id: returnEventId },
        data:  { status: "SIGNED", signed_jws: res.signedJws, signed_at: at, last_error: null, updated_by: userId },
      });
      return { ok: true, status: "SIGNED", signedAt: at.toISOString() };
    }
    await db.dteReturnEvent.update({ where: { id: returnEventId }, data: { last_error: res.message, updated_by: userId } });
    return { ok: false, error: res.message };
  } catch (err) {
    if (err instanceof SignReturnBusinessError || err instanceof DteSignerConfigError) return { ok: false, error: err.message };
    console.error("[signReturnEvent] Error inesperado:", err instanceof Error ? err.name : "error");
    return { ok: false, error: "Error interno al firmar el Evento de Retorno." };
  }
}
