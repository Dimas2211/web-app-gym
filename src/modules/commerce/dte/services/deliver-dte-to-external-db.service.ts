// commerce/dte — deliver-dte-to-external-db.service.ts
//
// Entrega un DteOutgoingDocument ACCEPTED a la base MariaDB externa.
//
// Flujo:
//   1. Cargar documento con scope tenant/location (incluye campos sensibles solo aquí).
//   2. Validar elegibilidad (ACCEPTED, tipo soportado, campos requeridos).
//   3. Construir payload externo.
//   4. Insertar en MariaDB externa vía adapter.
//   5. Registrar resultado en DteTransmissionLog (operation_type = EXTERNAL_DELIVERY).
//
// Seguridad:
//   - signed_jws y json_document no se loguean completos.
//   - FASE VI-E7: el destino MariaDB se resuelve por ORGANIZACIÓN
//     (Control Plane, PlatformExternalIntegration tipo DTE_MARIADB) vía
//     resolveExternalDteMariaDbDestination — ya no por variables de
//     entorno global. El legado por env SOLO se usa como fallback
//     opcional para PLATFORM_NATIVE sin PlatformOrganization resoluble
//     (ver resolve-external-dte-destination.ts). Credenciales siempre
//     cifradas en reposo (AES-256-GCM) o leídas desde env — nunca texto
//     plano.
//   - El log en Prisma solo guarda metadatos del resultado, nunca el payload completo.

import { prisma }                      from "@/lib/db/prisma";
import type { PrismaClient }           from "@prisma/client";
import { ExternalDteMariaDbAdapter }   from "../adapters/external-dte-mariadb.adapter";
import { resolveExternalDteMariaDbDestination } from "../config/resolve-external-dte-destination";
import {
  buildExternalDtePayload,
  type DteDocumentForExternalPayload,
} from "./build-external-dte-payload.service";
import type { DeliverDteToExternalDbResult } from "../types/external-dte-delivery.types";

// ── Parámetros ────────────────────────────────────────────────────

export interface DeliverDteToExternalDbParams {
  dteDocumentId: string;
  userId:        string;
  tenantId:      string;
  locationId:    string;
  /**
   * PrismaClient contra el que se lee/escribe el documento DTE.
   * Por defecto el singleton global — cuando hay sesión runtime
   * "Operar como cliente" activa, el caller pasa el PrismaClient
   * temporal resuelto por el Runtime Database Router en vez del
   * singleton global. El delivery externo (MariaDB) es siempre el
   * mismo, configurado por variables de entorno — nunca depende de
   * este client.
   */
  client?: PrismaClient;
  /**
   * Organización efectiva resuelta server-side (ver
   * require-runtime-dte-write-access.ts). null = sin PlatformOrganization
   * mapeada — solo relevante si allowLegacyEnvFallback es true.
   */
  organizationId: string | null;
  /**
   * true SOLO en modo normal sin PlatformOrganization resoluble. SIEMPRE
   * false en modo runtime ("Operar como cliente") — ver
   * resolve-external-dte-destination.ts.
   */
  allowLegacyEnvFallback: boolean;
}

// ── Error de negocio interno ──────────────────────────────────────

class DeliverDteBusinessError extends Error {
  errorCode?: string;
  constructor(message: string, errorCode?: string) {
    super(message);
    this.name = "DeliverDteBusinessError";
    this.errorCode = errorCode;
  }
}

// ── Función principal ─────────────────────────────────────────────

export async function deliverDteToExternalDb(
  params: DeliverDteToExternalDbParams,
): Promise<DeliverDteToExternalDbResult> {
  const { dteDocumentId, userId, tenantId, locationId, client = prisma, organizationId, allowLegacyEnvFallback } = params;

  // Destino resuelto por ORGANIZACIÓN (Control Plane) antes del try, para
  // que esté disponible en todos los paths de retorno. RUNTIME_CLIENT
  // nunca cae al legado por variables de entorno (allowLegacyEnvFallback
  // siempre false en ese modo) — ver resolve-external-dte-destination.ts.
  const destination = await resolveExternalDteMariaDbDestination({ organizationId, allowLegacyEnvFallback });

  if (destination.status === "NOT_CONFIGURED") {
    return {
      ok:          false,
      error:       "Esta organización no tiene configurada la entrega externa a MariaDB.",
      targetTable: null,
      errorCode:   "NOT_CONFIGURED",
    };
  }
  if (destination.status === "DISABLED") {
    return {
      ok:          false,
      error:       "La entrega externa a MariaDB está deshabilitada para esta organización.",
      targetTable: null,
      errorCode:   "DISABLED",
    };
  }

  const config = destination.config;

  try {
    // 1. Cargar documento con scope tenant/location
    //    Seleccionamos campos sensibles solo aquí — no se exponen al frontend.
    const dteDoc = await client.dteOutgoingDocument.findFirst({
      where:  { id: dteDocumentId, tenant_id: tenantId, location_id: locationId },
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
        retry_count:      true,
      },
    });

    if (!dteDoc) {
      throw new DeliverDteBusinessError(
        "El documento DTE no existe o no pertenece a la location activa.",
      );
    }

    // 2. Construir payload externo (valida elegibilidad internamente)
    const doc: DteDocumentForExternalPayload = {
      id:               dteDoc.id,
      tenant_id:        dteDoc.tenant_id,
      location_id:      dteDoc.location_id,
      sale_id:          dteDoc.sale_id,
      purchase_id:      dteDoc.purchase_id,
      dte_type_code:    dteDoc.dte_type_code,
      control_number:   dteDoc.control_number,
      generation_code:  dteDoc.generation_code,
      environment:      dteDoc.environment,
      dte_status:       dteDoc.dte_status,
      accepted_at:      dteDoc.accepted_at,
      json_document:    dteDoc.json_document,
      signed_jws:       dteDoc.signed_jws,
      reception_stamp:  dteDoc.reception_stamp,
      mh_response:      dteDoc.mh_response,
    };

    const buildResult = buildExternalDtePayload(doc);
    if (!buildResult.ok) {
      throw new DeliverDteBusinessError(buildResult.error);
    }

    // 3. Insertar en MariaDB externa
    const adapter = new ExternalDteMariaDbAdapter();
    const deliveryResult = await adapter.insert(config, buildResult.payload);

    const attemptNumber = dteDoc.retry_count + 1;

    // 4. Registrar resultado en DteTransmissionLog
    //    response_body contiene solo metadatos — sin payload completo ni signed_jws.
    if (deliveryResult.ok) {
      await client.dteTransmissionLog.create({
        data: {
          dte_document_id: dteDocumentId,
          attempt_number:  attemptNumber,
          operation_type:  "EXTERNAL_DELIVERY",
          request_url:     `mariadb://${config.host}:${config.port}/${deliveryResult.targetDatabase}/${deliveryResult.targetTable}`,
          http_status:     null,
          error_message:   null,
          response_body:   {
            ok:             true,
            insertId:       deliveryResult.insertId?.toString() ?? null,
            affectedRows:   deliveryResult.affectedRows,
            targetTable:    deliveryResult.targetTable,
            targetDatabase: deliveryResult.targetDatabase,
            tipoDte:        dteDoc.dte_type_code,
            numeroControl:  dteDoc.control_number,
            codigoGeneracion: dteDoc.generation_code,
            deliveredBy:    userId,
          },
        },
      });

      return {
        ok:           true,
        insertId:     deliveryResult.insertId,
        affectedRows: deliveryResult.affectedRows,
        targetTable:  deliveryResult.targetTable,
      };
    }

    // Delivery fallido — registrar error sanitizado.
    await client.dteTransmissionLog.create({
      data: {
        dte_document_id: dteDocumentId,
        attempt_number:  attemptNumber,
        operation_type:  "EXTERNAL_DELIVERY",
        request_url:     `mariadb://${config.host}:${config.port}/${config.database}/${config.table}`,
        http_status:     null,
        error_message:   deliveryResult.error,
        response_body:   {
          ok:             false,
          errorCode:      deliveryResult.errorCode ?? null,
          targetTable:    config.table || null,
          targetDatabase: config.database || null,
          tipoDte:        dteDoc.dte_type_code,
          numeroControl:  dteDoc.control_number,
          codigoGeneracion: dteDoc.generation_code,
        },
      },
    });

    return {
      ok:          false,
      error:       deliveryResult.error,
      targetTable: config.table || null,
      errorCode:   deliveryResult.errorCode,
    };

  } catch (error) {
    if (error instanceof DeliverDteBusinessError) {
      return {
        ok:          false,
        error:       error.message,
        targetTable: config.table || null,
        errorCode:   error.errorCode,
      };
    }
    throw error;
  }
}
