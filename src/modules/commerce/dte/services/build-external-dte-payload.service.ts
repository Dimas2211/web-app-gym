// commerce/dte — build-external-dte-payload.service.ts
//
// Construye el payload JSON que se insertará en la base MariaDB externa.
//
// Formato requerido por el proveedor:
//   campos DTE originales en la raíz + codigoEmpresa + responseMH + token.
//
// Reglas:
//   - Solo construye si el documento fue fiscalmente recibido por MH
//     (ACCEPTED u OBSERVED, ambos con reception_stamp) — ver
//     isFiscallyReceivedByMh en dte-fiscal-receipt.utils.ts, fuente
//     única de esta regla. OBSERVED se entrega tal cual, sin forzarlo
//     a ACCEPTED.
//   - Requiere json_document, signed_jws, reception_stamp y mh_response.
//   - codigoEmpresa se obtiene de jsonDocument.emisor.nrc.
//   - token = signed_jws exactamente.
//   - No incluye wrapper documento/firma/hacienda/metadata.

import type {
  ExternalDtePayload,
  ExternalDteResponseMH,
} from "../types/external-dte-delivery.types";
import { canUseFex11InServerFlow } from "../utils/fex11-feature-guard";
import { isFiscallyReceivedByMh } from "../utils/dte-fiscal-receipt.utils";

// ── Forma esperada del documento cargado ─────────────────────────

export interface DteDocumentForExternalPayload {
  id:               string;
  tenant_id:        string;
  location_id:      string;
  sale_id:          string | null;
  purchase_id:      string | null;
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
//
// FEX 11 se evalúa aparte vía fex11-feature-guard — habilitada solo para
// TEST mediante DTE_FEX11_TEST_ENABLED hasta que exista UI y validaciones
// completas de catálogos.

const SUPPORTED_TYPES = new Set(["01", "03", "05", "14"]);

// ── Función principal ─────────────────────────────────────────────

export function buildExternalDtePayload(
  doc: DteDocumentForExternalPayload,
): BuildExternalDtePayloadResult {
  if (!isFiscallyReceivedByMh(doc.dte_status, doc.reception_stamp)) {
    return {
      ok:    false,
      error: `El documento no ha sido recibido fiscalmente por MH (requiere ACCEPTED u OBSERVED con sello de recepción). Estado actual: ${doc.dte_status}.`,
    };
  }

  if (doc.dte_type_code === "11") {
    if (!canUseFex11InServerFlow({ dte_type_code: doc.dte_type_code, environment: doc.environment })) {
      return {
        ok:    false,
        error: "FEX 11 solo está habilitada para pruebas controladas en ambiente TEST.",
      };
    }
  } else if (!SUPPORTED_TYPES.has(doc.dte_type_code)) {
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

  if (doc.dte_type_code === "11" && identificacion?.["tipoDte"] !== "11") {
    return { ok: false, error: "El json_document no corresponde a un tipoDte 11 (FEX)." };
  }
  if (doc.dte_type_code === "14" && identificacion?.["tipoDte"] !== "14") {
    return { ok: false, error: "El json_document no corresponde a un tipoDte 14 (FSE)." };
  }

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
