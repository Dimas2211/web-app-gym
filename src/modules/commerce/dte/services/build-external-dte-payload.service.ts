// commerce/dte — build-external-dte-payload.service.ts
//
// Construye el payload JSON que se insertará en la base MariaDB externa.
//
// Formato requerido por el proveedor:
//   campos DTE originales en la raíz + codigoEmpresa + responseMH + token.
//
// Reglas:
//   - Solo construye si dte_status === "ACCEPTED".
//   - Requiere json_document, signed_jws, reception_stamp y mh_response.
//   - codigoEmpresa se obtiene de jsonDocument.emisor.nrc.
//   - token = signed_jws exactamente.
//   - No incluye wrapper documento/firma/hacienda/metadata.

import type {
  ExternalDtePayload,
  ExternalDteResponseMH,
} from "../types/external-dte-delivery.types";

// ── Forma esperada del documento cargado ─────────────────────────

export interface DteDocumentForExternalPayload {
  id:               string;
  tenant_id:        string;
  location_id:      string;
  sale_id:          string;
  dte_type_code:    string;
  control_number:   string | null;
  generation_code:  string | null;
  environment:      string;
  dte_status:       string;
  accepted_at:      Date | null;
  json_document:    unknown;
  signed_jws:       string | null;
  reception_stamp:  string | null;
  mh_response:      unknown;
}

// ── Tipos de error ────────────────────────────────────────────────

export type BuildExternalDtePayloadResult =
  | { ok: true;  payload: ExternalDtePayload }
  | { ok: false; error: string };

// ── Tipos DTE integrados en esta fase ─────────────────────────────

const SUPPORTED_TYPES = new Set(["01", "03", "05"]);

// ── Función principal ─────────────────────────────────────────────

export function buildExternalDtePayload(
  doc: DteDocumentForExternalPayload,
): BuildExternalDtePayloadResult {
  if (doc.dte_status !== "ACCEPTED") {
    return {
      ok:    false,
      error: `Solo se pueden entregar documentos ACCEPTED. Estado actual: ${doc.dte_status}.`,
    };
  }

  if (!SUPPORTED_TYPES.has(doc.dte_type_code)) {
    return {
      ok:    false,
      error: `Tipo DTE no integrado en entrega externa: ${doc.dte_type_code}.`,
    };
  }

  if (!doc.json_document) {
    return { ok: false, error: "El documento no tiene json_document generado." };
  }

  if (!doc.signed_jws) {
    return { ok: false, error: "El documento no tiene signed_jws (firma)." };
  }

  if (!doc.reception_stamp) {
    return { ok: false, error: "El documento no tiene sello de recepción MH." };
  }

  if (!doc.mh_response) {
    return { ok: false, error: "El documento no tiene respuesta MH registrada." };
  }

  if (!doc.control_number) {
    return { ok: false, error: "El documento no tiene número de control." };
  }

  if (!doc.generation_code) {
    return { ok: false, error: "El documento no tiene código de generación." };
  }

  const jsonDoc        = doc.json_document as Record<string, unknown>;
  const mhRaw          = doc.mh_response   as Record<string, unknown>;
  const emisor         = jsonDoc["emisor"]  as Record<string, unknown> | undefined;
  const identificacion = jsonDoc["identificacion"] as Record<string, unknown> | undefined;

  // Obtener NRC del emisor — nunca hardcodeado
  const codigoEmpresa = (emisor?.["nrc"] as string | undefined) ?? null;
  if (!codigoEmpresa) {
    return { ok: false, error: "No se pudo resolver codigoEmpresa/NRC del emisor." };
  }

  // Construir responseMH desde mh_response + campos del DTE
  const responseMH: ExternalDteResponseMH = {
    version:          (mhRaw["version"]        as number  | undefined) ?? 2,
    ambiente:         (identificacion?.["ambiente"] as string | undefined) ?? doc.environment,
    versionApp:       (mhRaw["versionApp"]     as number  | undefined)
                      ?? (mhRaw["version"]     as number  | undefined)
                      ?? 2,
    estado:           (mhRaw["estado"]         as string  | undefined)
                      ?? (mhRaw["mhEstado"]    as string  | undefined)
                      ?? "PROCESADO",
    codigoGeneracion: doc.generation_code,
    selloRecibido:    doc.reception_stamp,
    fhProcesamiento:  (mhRaw["fhProcesamiento"] as string | null | undefined) ?? null,
    clasificaMsg:     (mhRaw["clasificaMsg"]    as string | null | undefined) ?? null,
    codigoMsg:        (mhRaw["codigoMsg"]       as string | null | undefined)
                      ?? (mhRaw["codigo"]       as string | null | undefined)
                      ?? null,
    descripcionMsg:   (mhRaw["descripcionMsg"]  as string | null | undefined)
                      ?? (mhRaw["descripcion"]  as string | null | undefined)
                      ?? null,
    observaciones:    Array.isArray(mhRaw["observaciones"]) ? mhRaw["observaciones"] : [],
  };

  // Payload final: campos DTE en raíz + codigoEmpresa + responseMH + token
  const payload: ExternalDtePayload = {
    ...jsonDoc,
    codigoEmpresa,
    responseMH,
    token: doc.signed_jws,
  };

  return { ok: true, payload };
}
