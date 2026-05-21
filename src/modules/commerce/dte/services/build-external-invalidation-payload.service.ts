// commerce/dte — build-external-invalidation-payload.service.ts
//
// Construye el payload JSON que se insertará en la tabla MariaDB externa
// para eventos de invalidación ACCEPTED.
//
// Formato requerido por el proveedor:
//   campos event_json en la raíz + codigoEmpresa + responseMH + token.
//
// Reglas:
//   - Solo construye si status === "ACCEPTED".
//   - Requiere event_json, signed_jws, mh_sello_recibido y dte_document_id.
//   - codigoEmpresa viene del DteOutgoingDocument original (json_document.emisor.nrc).
//     El event_json de invalidación MH NO incluye nrc en emisor — se omite en el schema de anulación.
//   - token = signed_jws (campo del proveedor).
//   - No incluye wrapper documento/firma/hacienda/metadata.
//   - No imprime signed_jws completo ni event_json completo.

import type {
  ExternalInvalidationPayload,
  ExternalInvalidationResponseMH,
} from "../types/external-dte-delivery.types";

// ── Forma esperada del evento cargado ─────────────────────────────

export interface DteInvalidationEventForExternalPayload {
  id:                  string;
  tenant_id:           string;
  location_id:         string;
  dte_document_id:     string;
  status:              string;
  event_json:          unknown;
  signed_jws:          string | null;
  mh_estado:           string | null;
  mh_sello_recibido:   string | null;
  mh_codigo_msg:       string | null;
  mh_descripcion_msg:  string | null;
  mh_observaciones:    unknown;
  // Resuelto por el service desde DteOutgoingDocument.json_document.emisor.nrc
  codigoEmpresa:       string | null;
}

// ── Tipos de resultado ────────────────────────────────────────────

export type BuildExternalInvalidationPayloadResult =
  | { ok: true;  payload: ExternalInvalidationPayload }
  | { ok: false; error: string };

// ── Función principal ─────────────────────────────────────────────

export function buildExternalInvalidationPayload(
  event: DteInvalidationEventForExternalPayload,
): BuildExternalInvalidationPayloadResult {
  if (event.status !== "ACCEPTED") {
    return {
      ok:    false,
      error: `Solo se pueden entregar invalidaciones ACCEPTED. Estado actual: ${event.status}.`,
    };
  }

  if (!event.event_json) {
    return { ok: false, error: "El evento de invalidación no tiene event_json generado." };
  }

  if (!event.signed_jws) {
    return { ok: false, error: "El evento de invalidación no tiene signed_jws (firma)." };
  }

  if (!event.mh_sello_recibido) {
    return { ok: false, error: "El evento de invalidación no tiene sello de recepción MH." };
  }

  if (!event.mh_estado) {
    return { ok: false, error: "El evento de invalidación no tiene estado MH registrado." };
  }

  if (!event.dte_document_id) {
    return { ok: false, error: "El evento de invalidación no tiene dte_document_id." };
  }

  // codigoEmpresa viene del DTE original — el service lo resuelve antes de llamar aquí.
  // El event_json de anulación NO incluye nrc en emisor (schema MH lo omite).
  if (!event.codigoEmpresa) {
    return {
      ok:    false,
      error: "No se pudo resolver codigoEmpresa/NRC del emisor para la invalidación.",
    };
  }

  const codigoEmpresa = event.codigoEmpresa;
  const eventJson     = event.event_json as Record<string, unknown>;

  // fhProcesamiento desde identificacion del event_json si existe, de lo contrario null
  const identificacion = eventJson["identificacion"] as Record<string, unknown> | undefined;
  const fhProcesamiento = (identificacion?.["fhProcesamiento"] as string | null | undefined) ?? null;

  const responseMH: ExternalInvalidationResponseMH = {
    estado:          event.mh_estado,
    selloRecibido:   event.mh_sello_recibido,
    codigoMsg:       event.mh_codigo_msg       ?? null,
    descripcionMsg:  event.mh_descripcion_msg  ?? null,
    observaciones:   Array.isArray(event.mh_observaciones) ? event.mh_observaciones : [],
    fhProcesamiento,
  };

  // Payload final: campos event_json en raíz + codigoEmpresa + responseMH + token
  const payload: ExternalInvalidationPayload = {
    ...eventJson,
    codigoEmpresa,
    responseMH,
    token: event.signed_jws,
  };

  return { ok: true, payload };
}
