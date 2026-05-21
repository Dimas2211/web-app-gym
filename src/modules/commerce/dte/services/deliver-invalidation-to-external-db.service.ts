// commerce/dte — deliver-invalidation-to-external-db.service.ts
//
// Entrega un DteInvalidationEvent ACCEPTED a la base MariaDB externa.
//
// Flujo:
//   1. Cargar evento con scope tenant/location.
//   2. Cargar DteOutgoingDocument original para resolver codigoEmpresa (NRC).
//   3. Construir payload externo de invalidación.
//   4. Insertar en MariaDB externa vía adapter — tabla EXTERNAL_DTE_MARIADB_INVALIDATION_TABLE.
//   5. Registrar resultado en DteTransmissionLog (operation_type = EXTERNAL_INVALIDATION_DELIVERY).
//
// Seguridad:
//   - signed_jws y event_json no se loguean completos.
//   - Credenciales MariaDB leídas solo desde env.
//   - El log en Prisma solo guarda metadatos del resultado, nunca el payload completo.

import { prisma }                      from "@/lib/db/prisma";
import { getExternalDteMariaDbConfig } from "../config/external-dte-mariadb.config";
import { ExternalDteMariaDbAdapter }   from "../adapters/external-dte-mariadb.adapter";
import {
  buildExternalInvalidationPayload,
  type DteInvalidationEventForExternalPayload,
} from "./build-external-invalidation-payload.service";
import type { DeliverInvalidationToExternalDbResult } from "../types/external-dte-delivery.types";

// ── Parámetros ────────────────────────────────────────────────────

export interface DeliverInvalidationToExternalDbParams {
  invalidationEventId: string;
  userId:              string;
  tenantId:            string;
  locationId:          string;
}

// ── Error de negocio interno ──────────────────────────────────────

class DeliverInvalidationBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliverInvalidationBusinessError";
  }
}

// ── Función principal ─────────────────────────────────────────────

export async function deliverInvalidationToExternalDb(
  params: DeliverInvalidationToExternalDbParams,
): Promise<DeliverInvalidationToExternalDbResult> {
  const { invalidationEventId, userId, tenantId, locationId } = params;

  try {
    // 1. Cargar evento con scope tenant/location
    //    Campos sensibles (signed_jws, event_json) seleccionados solo aquí.
    const event = await prisma.dteInvalidationEvent.findFirst({
      where: {
        id:          invalidationEventId,
        tenant_id:   tenantId,
        location_id: locationId,
      },
      select: {
        id:                  true,
        tenant_id:           true,
        location_id:         true,
        dte_document_id:     true,
        status:              true,
        event_json:          true,
        signed_jws:          true,
        mh_estado:           true,
        mh_sello_recibido:   true,
        mh_codigo_msg:       true,
        mh_descripcion_msg:  true,
        mh_observaciones:    true,
      },
    });

    if (!event) {
      throw new DeliverInvalidationBusinessError(
        "El evento de invalidación no existe o no pertenece a la location activa.",
      );
    }

    // 2a. Cargar DTE original para resolver codigoEmpresa (NRC).
    //     El event_json de anulación MH no incluye nrc en emisor — viene del DTE base.
    const dteDoc = await prisma.dteOutgoingDocument.findFirst({
      where:  { id: event.dte_document_id },
      select: { json_document: true },
    });

    const dteJsonDoc    = dteDoc?.json_document as Record<string, unknown> | null | undefined;
    const dteEmisor     = dteJsonDoc?.["emisor"] as Record<string, unknown> | undefined;
    const codigoEmpresa = (dteEmisor?.["nrc"] as string | undefined) ?? null;

    // 2b. Construir payload externo (valida elegibilidad internamente)
    const eventForPayload: DteInvalidationEventForExternalPayload = {
      id:                  event.id,
      tenant_id:           event.tenant_id,
      location_id:         event.location_id,
      dte_document_id:     event.dte_document_id,
      status:              event.status,
      event_json:          event.event_json,
      signed_jws:          event.signed_jws,
      mh_estado:           event.mh_estado,
      mh_sello_recibido:   event.mh_sello_recibido,
      mh_codigo_msg:       event.mh_codigo_msg,
      mh_descripcion_msg:  event.mh_descripcion_msg,
      mh_observaciones:    event.mh_observaciones,
      codigoEmpresa,
    };

    const buildResult = buildExternalInvalidationPayload(eventForPayload);
    if (!buildResult.ok) {
      throw new DeliverInvalidationBusinessError(buildResult.error);
    }

    // 3. Insertar en MariaDB externa — tabla de invalidaciones
    const config  = getExternalDteMariaDbConfig();
    const adapter = new ExternalDteMariaDbAdapter();

    // Pasar tableName explícito — FE/CCF/NC usan config.table; invalidaciones usan config.invalidationTable.
    const deliveryResult = await adapter.insert(
      config,
      buildResult.payload,
      config.invalidationTable,
    );

    // 4. Calcular attempt_number contando logs previos de este mismo tipo para el documento
    const existingLogs = await prisma.dteTransmissionLog.count({
      where: {
        dte_document_id: event.dte_document_id,
        operation_type:  "EXTERNAL_INVALIDATION_DELIVERY",
      },
    });
    const attemptNumber = existingLogs + 1;

    // 5. Registrar resultado en DteTransmissionLog
    //    response_body contiene solo metadatos — sin payload completo ni signed_jws.
    if (deliveryResult.ok) {
      await prisma.dteTransmissionLog.create({
        data: {
          dte_document_id: event.dte_document_id,
          attempt_number:  attemptNumber,
          operation_type:  "EXTERNAL_INVALIDATION_DELIVERY",
          request_url:     `mariadb://${config.host}:${config.port}/${config.database}/${config.invalidationTable}`,
          http_status:     null,
          error_message:   null,
          response_body:   {
            ok:                  true,
            insertId:            deliveryResult.insertId?.toString() ?? null,
            affectedRows:        deliveryResult.affectedRows,
            invalidationEventId: event.id,
            dteDocumentId:       event.dte_document_id,
            deliveredBy:         userId,
          },
        },
      });

      return {
        ok:                  true,
        insertId:            deliveryResult.insertId,
        affectedRows:        deliveryResult.affectedRows,
        invalidationEventId: event.id,
        dteDocumentId:       event.dte_document_id,
      };
    }

    // Delivery fallido — registrar error sanitizado
    await prisma.dteTransmissionLog.create({
      data: {
        dte_document_id: event.dte_document_id,
        attempt_number:  attemptNumber,
        operation_type:  "EXTERNAL_INVALIDATION_DELIVERY",
        request_url:     `mariadb://${config.host}:${config.port}/${config.database}/${config.invalidationTable}`,
        http_status:     null,
        error_message:   deliveryResult.error,
        response_body:   {
          ok:                  false,
          errorCode:           deliveryResult.errorCode ?? null,
          invalidationEventId: event.id,
          dteDocumentId:       event.dte_document_id,
        },
      },
    });

    return { ok: false, error: deliveryResult.error };

  } catch (error) {
    if (error instanceof DeliverInvalidationBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
