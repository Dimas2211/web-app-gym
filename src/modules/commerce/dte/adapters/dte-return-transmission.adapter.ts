// ─────────────────────────────────────────────────────────────────
// commerce/dte — adapters/dte-return-transmission.adapter.ts
//
// MH20 (Fase 6, IMP20-022) — CONTRATO del adaptador de transmisión del
// Evento de Retorno (tipo 18) y de Operaciones Especiales (tipo 17).
//
// MT-GAP-001: el Manual Técnico v2 NO documenta el endpoint de recepción
// de estos eventos. Por eso:
//   - NO existe URL, ni por defecto ni por variable de entorno.
//   - NO se reutiliza /fesv/recepciondte, /fesv/anulardte ni /fesv/contingencia.
//   - La única implementación productiva es BlockedMhEventTransmissionAdapter,
//     que devuelve un error tipado SIN tocar la red.
//   - El contrato (entrada/salida) reproduce el de los eventos documentados
//     (body { ambiente, idEnvio, version, documento } y respuesta
//     { estado, selloRecibido, … }) SOLO como forma prevista para los mocks;
//     se revisará cuando MH publique el servicio.
// ─────────────────────────────────────────────────────────────────

import type { DteMhEnvironment } from "../types/dte-mh-auth.types";

export interface MhEventTransmissionInput {
  environment:     DteMhEnvironment;
  issuerConfigId?: string;
  /** "17" | "18" */
  eventType:       "17" | "18";
  signedJws:       string;
  /** identificacion.version del propio evento (D3). */
  version:         number;
  /** Código de generación del evento (para conciliación). */
  codigoGeneracion: string;
}

export type MhEventTransmissionResult =
  | {
      ok:             true;
      mhEstado:       string;
      selloRecibido:  string | null;
      codigoMsg:      string | null;
      descripcionMsg: string | null;
      observaciones:  unknown[] | null;
      httpStatus:     number;
    }
  | {
      ok:         false;
      errorCode:  "MH_EVENT_ENDPOINT_UNDOCUMENTED" | "MH_EVENT_TIMEOUT" | "MH_EVENT_UNAVAILABLE" | "MH_EVENT_HTTP_ERROR" | string;
      message:    string;
      /** true = MH pudo haber recibido el evento (timeout / conexión perdida tras enviar). */
      uncertain:  boolean;
      httpStatus?: number;
    };

export interface MhEventTransmissionAdapter {
  transmit(input: MhEventTransmissionInput): Promise<MhEventTransmissionResult>;
}

export const MH_EVENT_ENDPOINT_UNDOCUMENTED = "MH_EVENT_ENDPOINT_UNDOCUMENTED";

/** Implementación productiva: bloqueo explícito, sin red (MT-GAP-001). */
export class BlockedMhEventTransmissionAdapter implements MhEventTransmissionAdapter {
  async transmit(input: MhEventTransmissionInput): Promise<MhEventTransmissionResult> {
    return {
      ok:        false,
      errorCode: MH_EVENT_ENDPOINT_UNDOCUMENTED,
      message:
        `Transmisión del evento tipo ${input.eventType} bloqueada: el Manual Técnico v2 no documenta ` +
        "el endpoint de recepción (MT-GAP-001). No se envió nada a MH.",
      uncertain: false,
    };
  }
}
