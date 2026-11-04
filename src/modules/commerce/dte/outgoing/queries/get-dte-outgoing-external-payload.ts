// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — get-dte-outgoing-external-payload.ts
//
// Lectura READ-ONLY del payload completo de entrega externa (MariaDB):
// campos DTE originales + codigoEmpresa + responseMH + token (JWS).
//
// Reutiliza buildExternalDtePayload() — el MISMO builder que usa
// deliver-dte-to-external-db.service.ts antes del INSERT — con el mismo
// select de documento. No existe snapshot persistido del payload
// enviado: si hubo entrega exitosa el resultado es una RECONSTRUCCIÓN a
// partir de los datos fiscales almacenados; si no, una VISTA PREVIA.
//
// Scoping obligatorio: WHERE id AND tenant_id AND location_id.
// No escribe nada, no conecta a MariaDB, no transmite a MH.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import {
  buildExternalDtePayload,
  type DteDocumentForExternalPayload,
} from "../../services/build-external-dte-payload.service";
import type { ExternalDtePayload } from "../../types/external-dte-delivery.types";
import { isSuccessfulDeliveryLog } from "../utils/dte-delivery-summary.utils";

/** RECONSTRUCTED = hubo entrega externa exitosa; PREVIEW = aún no enviado. */
export type DteExternalPayloadMode = "RECONSTRUCTED" | "PREVIEW";

export interface DteExternalDeliveryRecord {
  delivered_at:    Date;
  target_database: string | null;
  target_table:    string | null;
  insert_id:       string | null;
}

export type GetDteOutgoingExternalPayloadResult =
  | { status: "NOT_FOUND" }
  | { status: "NOT_BUILDABLE"; error: string }
  | {
      status:          "OK";
      id:              string;
      sale_id:         string | null;
      purchase_id:     string | null;
      dte_type_code:   string;
      generation_code: string | null;
      control_number:  string | null;
      environment:     string;
      dte_status:      string;
      mode:            DteExternalPayloadMode;
      /** Última entrega exitosa registrada (solo metadatos, sin host ni credenciales). */
      delivery:        DteExternalDeliveryRecord | null;
      payload:         ExternalDtePayload;
    };

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

export async function getDteOutgoingExternalPayload(params: {
  dteId:      string;
  tenantId:   string;
  locationId: string;
  client?:    PrismaClient;
}): Promise<GetDteOutgoingExternalPayloadResult> {
  const { dteId, tenantId, locationId, client = prisma } = params;

  // Mismo select que deliver-dte-to-external-db.service.ts (sin retry_count)
  // + logs de entrega externa para distinguir reconstrucción / vista previa.
  const row = await client.dteOutgoingDocument.findFirst({
    where:  { id: dteId, tenant_id: tenantId, location_id: locationId },
    select: {
      id:               true,
      tenant_id:        true,
      location_id:      true,
      sale_id:          true,
      purchase_id:      true,
      dte_type_code:    true,
      control_number:   true,
      generation_code:  true,
      environment:      true,
      dte_status:       true,
      accepted_at:      true,
      json_document:    true,
      signed_jws:       true,
      reception_stamp:  true,
      mh_response:      true,
      transmission_logs: {
        where:   { operation_type: "EXTERNAL_DELIVERY" },
        orderBy: { created_at: "desc" },
        select: {
          response_body: true,
          error_message: true,
          http_status:   true,
          created_at:    true,
        },
      },
    },
  });

  if (!row) return { status: "NOT_FOUND" };

  const doc: DteDocumentForExternalPayload = {
    id:              row.id,
    tenant_id:       row.tenant_id,
    location_id:     row.location_id,
    sale_id:         row.sale_id,
    purchase_id:     row.purchase_id,
    dte_type_code:   row.dte_type_code,
    control_number:  row.control_number,
    generation_code: row.generation_code,
    environment:     String(row.environment),
    dte_status:      String(row.dte_status),
    accepted_at:     row.accepted_at,
    json_document:   row.json_document,
    signed_jws:      row.signed_jws,
    reception_stamp: row.reception_stamp,
    mh_response:     row.mh_response,
  };

  const built = buildExternalDtePayload(doc);
  if (!built.ok) return { status: "NOT_BUILDABLE", error: built.error };

  const lastOk = row.transmission_logs.find(isSuccessfulDeliveryLog) ?? null;
  const body   = (lastOk?.response_body ?? null) as Record<string, unknown> | null;

  return {
    status:          "OK",
    id:              row.id,
    sale_id:         row.sale_id,
    purchase_id:     row.purchase_id,
    dte_type_code:   row.dte_type_code,
    generation_code: row.generation_code,
    control_number:  row.control_number,
    environment:     String(row.environment),
    dte_status:      String(row.dte_status),
    mode:            lastOk ? "RECONSTRUCTED" : "PREVIEW",
    delivery: lastOk
      ? {
          delivered_at:    lastOk.created_at,
          target_database: str(body?.["targetDatabase"]),
          target_table:    str(body?.["targetTable"]),
          insert_id:       str(body?.["insertId"]),
        }
      : null,
    payload: built.payload,
  };
}
