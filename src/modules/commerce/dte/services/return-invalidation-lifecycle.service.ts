// ─────────────────────────────────────────────────────────────────
// commerce/dte — return-invalidation-lifecycle.service.ts
//
// MH20 (Fase 6.1, IMP20-024) — firma y transmisión preparada de la
// Invalidación de un Evento de Retorno (dte_return_invalidation_events, M2).
//
// Firma:
//   - Solo DRAFT con event_json y sin JWS; revalida AJV (invalidación v3).
//   - Perfil MH_2_0 vigente para el emisor/ambiente del Retorno.
//   - Reutiliza el firmador existente (resolveDteSignerConfigForIssuer +
//     MhHttpDteSignerAdapter); el JWS nunca se registra.
//
// Transmisión (preparada, NO cableada a la red):
//   - La invalidación se transmite por /fesv/anulardte (servicio documentado,
//     MT v2 p.31), pero un Retorno solo llega a ACCEPTED cuando exista el
//     endpoint del Retorno (MT-GAP-001). Por eso el servicio EXIGE un
//     adaptador inyectado: sin él devuelve NO_ADAPTER y no toca la red.
//     El cableado real con MhInvalidationTransmissionAdapter queda para la
//     activación (06-pending-activation-blockers.md).
//   - PRODUCTION fail-closed (plazos INC-004 UNSET).
//   - Idempotente: ACCEPTED → devuelve el resultado previo sin reenviar;
//     SENT / last_error REQUIRES_RECONCILIATION → exige conciliación.
//   - Nunca regenera el código de generación ni modifica el Retorno ni el
//     DTE original; la invalidación de un Retorno NO revierte efectos
//     comerciales por sí misma (ver dte-return-commercial-effects).
// ─────────────────────────────────────────────────────────────────

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { DteSignerConfigError } from "../config/dte-signer.config";
import { resolveDteSignerConfigForIssuer } from "./dte-credential.service";
import { MhHttpDteSignerAdapter } from "../adapters/dte-signer.adapter";
import { validateMhEventJson } from "../spec/validate-mh-event-json";
import { resolveIssuerSpecProfileForGeneration } from "../spec/resolve-issuer-spec-profile";
import type { DteMhEnvironment } from "../types/dte-mh-auth.types";

const SELLO_RE = /^[A-Z0-9]{40}$/;
export const RETURN_INV_REQUIRES_RECONCILIATION = "REQUIRES_RECONCILIATION";

interface Scope { returnInvalidationEventId: string; userId: string | null; tenantId: string; locationId: string }

type SignerLike = Pick<MhHttpDteSignerAdapter, "sign">;

export type SignReturnInvalidationResult =
  | { ok: true; status: "SIGNED" }
  | { ok: false; error: string };

class LifecycleError extends Error {}

async function loadWithReturn(db: PrismaClient, p: Scope) {
  return db.dteReturnInvalidationEvent.findFirst({
    where:  { id: p.returnInvalidationEventId, tenant_id: p.tenantId, location_id: p.locationId },
    select: {
      id: true, status: true, event_json: true, signed_jws: true, mh_sello_recibido: true, last_error: true,
      return_event: { select: { id: true, status: true, issuer_config_id: true, environment: true, tenant_id: true, location_id: true } },
    },
  });
}

export async function signReturnInvalidationEvent(
  params: Scope,
  db: PrismaClient = prisma,
  deps: { signer?: SignerLike; resolveSigner?: typeof resolveDteSignerConfigForIssuer } = {},
): Promise<SignReturnInvalidationResult> {
  try {
    const ev = await loadWithReturn(db, params);
    if (!ev) throw new LifecycleError("La invalidación del Retorno no existe o no pertenece a la location activa.");
    if (ev.status !== "DRAFT") throw new LifecycleError(`Solo se firman invalidaciones en DRAFT. Estado actual: "${ev.status}".`);
    if (!ev.event_json) throw new LifecycleError("La invalidación del Retorno no tiene event_json.");
    if (ev.signed_jws !== null) throw new LifecycleError("La invalidación del Retorno ya tiene JWS.");
    const ret = ev.return_event;
    if (ret.tenant_id !== params.tenantId || ret.location_id !== params.locationId) {
      throw new LifecycleError("El Retorno asociado no pertenece al tenant/location activo.");
    }
    if (ret.status !== "ACCEPTED") throw new LifecycleError(`El Retorno debe seguir ACCEPTED para firmar su invalidación (estado: "${ret.status}").`);

    const check = validateMhEventJson("INV", ev.event_json);
    if (!check.ok) throw new LifecycleError(`${check.error} ${check.validation_errors.map((e) => `${e.path}: ${e.message}`).join(" | ")}`);
    const doc = (ev.event_json as { documento?: { tipoDte?: string } }).documento;
    if (doc?.tipoDte !== "18") throw new LifecycleError("El JSON persistido no corresponde a la invalidación de un Retorno (tipoDte 18).");

    const profile = await resolveIssuerSpecProfileForGeneration(db, ret.issuer_config_id, params.tenantId, params.locationId, ret.environment, "INV");
    if (!profile.ok) throw new LifecycleError(profile.error);
    if (profile.profile !== "MH_2_0") throw new LifecycleError("El emisor ya no tiene el perfil MH_2_0 activo: firma bloqueada.");

    const resolution = await (deps.resolveSigner ?? resolveDteSignerConfigForIssuer)({
      issuerConfigId: ret.issuer_config_id,
      environment:    ret.environment as DteMhEnvironment,
      client:         db,
    });
    if (!resolution.ok) throw new LifecycleError(resolution.error);
    const signer = deps.signer ?? new MhHttpDteSignerAdapter();
    const res = await signer.sign({ nit: resolution.nit, passwordPri: resolution.passwordPri, dteJson: ev.event_json }, resolution.config);
    if (!res.ok) {
      await db.dteReturnInvalidationEvent.update({ where: { id: ev.id }, data: { last_error: res.message } });
      return { ok: false, error: res.message };
    }
    // Transición condicionada al estado previo: dos firmas concurrentes no
    // pueden dejar dos JWS (la segunda no encuentra DRAFT).
    const upd = await db.dteReturnInvalidationEvent.updateMany({
      where: { id: ev.id, status: "DRAFT", signed_jws: null },
      data:  { status: "SIGNED", signed_jws: res.signedJws, last_error: null },
    });
    if (upd.count !== 1) throw new LifecycleError("La invalidación cambió de estado durante la firma; no se aplicó.");
    return { ok: true, status: "SIGNED" };
  } catch (err) {
    if (err instanceof LifecycleError || err instanceof DteSignerConfigError) return { ok: false, error: err.message };
    console.error("[signReturnInvalidationEvent] Error inesperado:", err instanceof Error ? err.name : "error");
    return { ok: false, error: "Error interno al firmar la invalidación del Retorno." };
  }
}

// ── Transmisión preparada ─────────────────────────────────────────

export interface ReturnInvalidationTransmissionInput {
  environment: DteMhEnvironment;
  signedJws:   string;
  version:     3;
  codigoGeneracion: string;
}

export type ReturnInvalidationTransmissionResult =
  | { ok: true; mhEstado: string; selloRecibido: string | null; codigoMsg: string | null; descripcionMsg: string | null; observaciones: unknown[] | null }
  | { ok: false; message: string; uncertain: boolean };

export interface ReturnInvalidationTransmissionAdapter {
  transmit(input: ReturnInvalidationTransmissionInput): Promise<ReturnInvalidationTransmissionResult>;
}

export type TransmitReturnInvalidationResult =
  | { ok: true; status: "ACCEPTED" | "REJECTED"; idempotent?: boolean }
  | { ok: false; code: "NOT_FOUND" | "NOT_SIGNED" | "RETURN_NOT_ACCEPTED" | "PRODUCTION_BLOCKED" | "NO_ADAPTER" | "REQUIRES_RECONCILIATION" | "TECHNICAL"; error: string };

export async function transmitReturnInvalidationEvent(
  params: Scope,
  db: PrismaClient = prisma,
  deps: { adapter?: ReturnInvalidationTransmissionAdapter; now?: Date } = {},
): Promise<TransmitReturnInvalidationResult> {
  const ev = await loadWithReturn(db, params);
  if (!ev) return { ok: false, code: "NOT_FOUND", error: "La invalidación del Retorno no existe o no pertenece a la location activa." };
  if (ev.status === "ACCEPTED") return { ok: true, status: "ACCEPTED", idempotent: true };
  if (ev.status === "SENT" || (ev.last_error ?? "").startsWith(RETURN_INV_REQUIRES_RECONCILIATION)) {
    return { ok: false, code: "REQUIRES_RECONCILIATION", error: "Respuesta previa incierta: consulte el estado en MH antes de reenviar." };
  }
  if (ev.status !== "SIGNED" || !ev.signed_jws) return { ok: false, code: "NOT_SIGNED", error: `Solo se transmiten invalidaciones firmadas (estado: "${ev.status}").` };
  if (ev.return_event.status !== "ACCEPTED") return { ok: false, code: "RETURN_NOT_ACCEPTED", error: "El Retorno asociado no está ACCEPTED." };
  if (ev.return_event.environment === "PRODUCTION") {
    return { ok: false, code: "PRODUCTION_BLOCKED", error: "Invalidación 2.0 bloqueada en PRODUCTION: plazos sin confirmar (INC-004)." };
  }
  if (!deps.adapter) {
    return { ok: false, code: "NO_ADAPTER", error: "Transmisión no cableada: requiere un Retorno aceptado (MT-GAP-001). No se envió nada a MH." };
  }
  const codigo = ((ev.event_json as { identificacion?: { codigoGeneracion?: string } } | null)?.identificacion?.codigoGeneracion) ?? "";
  // Reserva SIGNED → SENT antes de la red: impide doble envío concurrente.
  const reserved = await db.dteReturnInvalidationEvent.updateMany({
    where: { id: ev.id, status: "SIGNED" },
    data:  { status: "SENT", sent_at: deps.now ?? new Date() },
  });
  if (reserved.count !== 1) return { ok: false, code: "REQUIRES_RECONCILIATION", error: "La invalidación ya se está transmitiendo." };

  const result = await deps.adapter.transmit({
    environment: ev.return_event.environment as DteMhEnvironment, signedJws: ev.signed_jws, version: 3, codigoGeneracion: codigo,
  });
  return applyReturnInvalidationTransmissionResult(db, { id: ev.id, result, now: deps.now });
}

export async function applyReturnInvalidationTransmissionResult(
  db: Pick<PrismaClient, "dteReturnInvalidationEvent">,
  params: { id: string; result: ReturnInvalidationTransmissionResult; now?: Date },
): Promise<TransmitReturnInvalidationResult> {
  const { id, result } = params;
  const now = params.now ?? new Date();
  if (!result.ok) {
    if (result.uncertain) {
      await db.dteReturnInvalidationEvent.update({ where: { id }, data: { status: "SENT", last_error: `${RETURN_INV_REQUIRES_RECONCILIATION}: ${result.message}` } });
      return { ok: false, code: "REQUIRES_RECONCILIATION", error: "Respuesta incierta: consultar MH antes de reenviar." };
    }
    await db.dteReturnInvalidationEvent.update({ where: { id }, data: { status: "SIGNED", last_error: result.message } });
    return { ok: false, code: "TECHNICAL", error: result.message };
  }
  const obs = result.observaciones != null ? (result.observaciones as Prisma.InputJsonValue) : Prisma.JsonNull;
  if (result.mhEstado === "PROCESADO" && result.selloRecibido && SELLO_RE.test(result.selloRecibido)) {
    await db.dteReturnInvalidationEvent.update({
      where: { id },
      data:  {
        status: "ACCEPTED", mh_estado: result.mhEstado, mh_sello_recibido: result.selloRecibido, mh_codigo_msg: result.codigoMsg,
        mh_descripcion_msg: result.descripcionMsg, mh_observaciones: obs, accepted_at: now, last_error: null,
      },
    });
    return { ok: true, status: "ACCEPTED" };
  }
  if (result.mhEstado === "RECHAZADO") {
    await db.dteReturnInvalidationEvent.update({
      where: { id },
      data:  {
        status: "REJECTED", mh_estado: result.mhEstado, mh_codigo_msg: result.codigoMsg, mh_descripcion_msg: result.descripcionMsg,
        mh_observaciones: obs, rejected_at: now, last_error: result.descripcionMsg ?? "MH rechazó la invalidación.",
      },
    });
    return { ok: true, status: "REJECTED" };
  }
  await db.dteReturnInvalidationEvent.update({
    where: { id },
    data:  { status: "SENT", last_error: `${RETURN_INV_REQUIRES_RECONCILIATION}: respuesta no concluyente (${result.mhEstado})` },
  });
  return { ok: false, code: "REQUIRES_RECONCILIATION", error: "Respuesta MH no concluyente: conciliar antes de reenviar." };
}
