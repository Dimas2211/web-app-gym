// commerce/dte — dte-reconciliation.service.ts
//
// FASE IV-B.1 — Núcleo de reconciliación MH para DTE inciertos
// (dte_status=SIGNED con resultado real desconocido). Ver
// docs/modules/platform-phase-4b-dte-query-reconciliation.md.
//
// Responsabilidad: consultar consultadte FUERA de cualquier
// transacción, y resolver DteOutgoingDocument + DteFiscalMeteringReservation
// + DteTransmissionLog(QUERY) en una única transacción atómica SOLO
// cuando la respuesta es QUERY_PROCESSED e inequívoca. Cualquier otro
// resultado deja el documento en SIGNED y el ledger en PENDING
// (fail-closed — ver auditoría IV-B).
//
// NUNCA usa el prisma singleton global — `runtimeDb` siempre explícito
// (multitenant/runtime-aware desde el diseño, aunque hoy no exista
// action manual todavía).

import type { PrismaClient, Prisma } from "@prisma/client";
import { MhDteQueryAdapter } from "../adapters/dte-query.adapter";
import { resolveDteMhUrls } from "../config/dte-mh.config";
import { normalizeNitForDte } from "../utils/fiscal-id.utils";
import { isMhProcessedObserved } from "../utils/dte-mh-observations.utils";
import { finalizePendingReservationByDocument } from "./dte-fiscal-metering.service";
import type { DteQueryResult } from "../types/dte-query.types";

// ── Resultado público ───────────────────────────────────────────────

export type ReconcileDteWithMhResult =
  | { status: "NO_OP"; reason: "ALREADY_RESOLVED" | "NOT_APPLICABLE"; dteStatus: string }
  | { status: "RESOLVED"; dteStatus: "ACCEPTED" | "OBSERVED" }
  | { status: "REPAIRED_LOCAL"; dteStatus: "ACCEPTED" | "OBSERVED" }
  | { status: "PENDING_UNCHANGED"; queryKind: DteQueryResult["kind"] }
  | { status: "INCONSISTENT_LOCAL_STATE"; detail: string }
  | { status: "ABORTED_CONCURRENT_CHANGE"; detail: string }
  | { status: "BUSINESS_ERROR"; error: string };

export interface ReconcileDteWithMhParams {
  dteDocumentId: string;
  tenantId: string;
  locationId: string;
  runtimeDb: PrismaClient;
  /** Actor técnico — quién disparó la reconciliación (manual/futuro batch). */
  userId?: string | null;
  /** Inyectable para tests. */
  now?: Date;
  /** Inyectable para tests — nunca instanciar MhDteQueryAdapter dentro de un loop de tests reales. */
  queryAdapter?: MhDteQueryAdapter;
}

// Error interno usado solo para abortar la transacción con una causa
// tipada — nunca se propaga fuera de reconcileDteWithMh sin traducirse
// a un ReconcileDteWithMhResult explícito.
class ReconciliationAbortedError extends Error {
  constructor(
    public readonly reasonCode: "CONCURRENT_CHANGE" | "LEDGER_DIVERGENCE",
    message: string,
  ) {
    super(message);
    this.name = "ReconciliationAbortedError";
  }
}

const TERMINAL_STATUSES_WITH_EXPECTED_LEDGER: Record<string, "CONSUMED" | "RELEASED"> = {
  ACCEPTED: "CONSUMED",
  OBSERVED: "CONSUMED",
  REJECTED: "RELEASED",
  INVALIDATED: "CONSUMED",
};

export async function reconcileDteWithMh(
  params: ReconcileDteWithMhParams,
): Promise<ReconcileDteWithMhResult> {
  const { dteDocumentId, tenantId, locationId, runtimeDb, userId = null, now = new Date() } = params;
  const adapter = params.queryAdapter ?? new MhDteQueryAdapter();

  // ── 1. Cargar documento con scope tenant/location (solo lectura) ──
  const dteDoc = await runtimeDb.dteOutgoingDocument.findFirst({
    where: { id: dteDocumentId, tenant_id: tenantId, location_id: locationId },
    select: {
      id: true,
      dte_status: true,
      environment: true,
      dte_type_code: true,
      generation_code: true,
      control_number: true,
      issuer_config_id: true,
      reception_stamp: true,
      mh_response: true,
      sent_at: true,
    },
  });
  if (!dteDoc) {
    return { status: "BUSINESS_ERROR", error: "El documento DTE no existe o no pertenece a la location activa." };
  }

  // ── 2. Idempotencia — estados terminales ya resueltos ──────────────
  if (dteDoc.dte_status in TERMINAL_STATUSES_WITH_EXPECTED_LEDGER) {
    const reservation = await runtimeDb.dteFiscalMeteringReservation.findUnique({
      where: { dte_document_id: dteDocumentId },
      select: { status: true },
    });
    const expectedLedger = TERMINAL_STATUSES_WITH_EXPECTED_LEDGER[dteDoc.dte_status];
    const ledgerOk =
      dteDoc.environment === "TEST" // TEST nunca tiene ledger — nada que verificar
        ? true
        : reservation?.status === expectedLedger;

    if (ledgerOk) {
      return { status: "NO_OP", reason: "ALREADY_RESOLVED", dteStatus: dteDoc.dte_status };
    }

    // ACCEPTED/OBSERVED + PENDING: repair local seguro SIN llamar MH,
    // solo si hay evidencia fiscal local suficiente (reception_stamp +
    // mh_response ya reflejando PROCESADO).
    if (
      (dteDoc.dte_status === "ACCEPTED" || dteDoc.dte_status === "OBSERVED") &&
      dteDoc.environment === "PRODUCTION" &&
      reservation?.status === "PENDING" &&
      !!dteDoc.reception_stamp?.trim() &&
      isMhResponseProcessed(dteDoc.mh_response)
    ) {
      try {
        await runtimeDb.$transaction(async (tx) => {
          const result = await finalizePendingReservationByDocument(tx, dteDocumentId, now);
          if (!result.ok) {
            throw new ReconciliationAbortedError(
              "LEDGER_DIVERGENCE",
              `finalizePendingReservationByDocument devolvió ${result.reason} durante repair local — abortando sin escribir.`,
            );
          }
        });
      } catch (err) {
        if (err instanceof ReconciliationAbortedError) {
          return { status: "INCONSISTENT_LOCAL_STATE", detail: err.message };
        }
        throw err;
      }
      return { status: "REPAIRED_LOCAL", dteStatus: dteDoc.dte_status };
    }

    // Cualquier otra combinación terminal+ledger-inconsistente: reportar,
    // nunca mutar. Nunca llamar MH para estados ya terminales.
    return {
      status: "INCONSISTENT_LOCAL_STATE",
      detail: `dte_status=${dteDoc.dte_status} pero ledger=${reservation?.status ?? "(sin fila)"} — se esperaba ${expectedLedger}. Requiere revisión manual.`,
    };
  }

  // ── 3. Solo SIGNED es conciliable contra MH ────────────────────────
  if (dteDoc.dte_status !== "SIGNED") {
    return { status: "NO_OP", reason: "NOT_APPLICABLE", dteStatus: dteDoc.dte_status };
  }

  const reservation = await runtimeDb.dteFiscalMeteringReservation.findUnique({
    where: { dte_document_id: dteDocumentId },
    select: { status: true },
  });

  const environment = dteDoc.environment as "TEST" | "PRODUCTION";

  if (environment === "PRODUCTION") {
    if (!reservation) {
      return {
        status: "INCONSISTENT_LOCAL_STATE",
        detail: "DTE PRODUCTION en SIGNED sin ninguna DteFiscalMeteringReservation — requiere investigación. No se llamó a MH.",
      };
    }
    if (reservation.status !== "PENDING") {
      return {
        status: "INCONSISTENT_LOCAL_STATE",
        detail: `DTE PRODUCTION en SIGNED pero ledger=${reservation.status} (se esperaba PENDING) — requiere investigación. No se llamó a MH.`,
      };
    }
  } else if (reservation) {
    // TEST nunca debería tener ledger — si lo tiene, es una divergencia
    // a investigar, no algo que la reconciliación deba silenciar.
    return {
      status: "INCONSISTENT_LOCAL_STATE",
      detail: `DTE TEST en SIGNED pero existe una DteFiscalMeteringReservation (status=${reservation.status}) — TEST nunca debería tener ledger. No se llamó a MH.`,
    };
  }

  if (!dteDoc.generation_code) {
    return { status: "BUSINESS_ERROR", error: "El documento no tiene código de generación — no se puede consultar." };
  }
  if (!dteDoc.issuer_config_id) {
    return { status: "BUSINESS_ERROR", error: "El documento no tiene issuer_config_id — no se puede resolver el NIT del emisor." };
  }

  const issuerConfig = await runtimeDb.dteIssuerConfig.findUnique({
    where: { id: dteDoc.issuer_config_id },
    select: { nit: true },
  });
  const nitEmisor = normalizeNitForDte(issuerConfig?.nit ?? null);
  if (!nitEmisor) {
    return { status: "BUSINESS_ERROR", error: "El emisor DTE asociado no tiene NIT configurado — no se puede consultar." };
  }

  // ── 4. Llamada HTTP — SIEMPRE fuera de cualquier transacción ───────
  const queryResult = await adapter.query({
    environment,
    issuerConfigId: dteDoc.issuer_config_id,
    nitEmisor,
    tdte: dteDoc.dte_type_code,
    codigoGeneracion: dteDoc.generation_code,
  });

  const { queryDteUrl } = resolveDteMhUrls(environment);
  const previousQueryAttempts = await runtimeDb.dteTransmissionLog.count({
    where: { dte_document_id: dteDocumentId, operation_type: "QUERY" },
  });
  const attemptNumber = previousQueryAttempts + 1;

  // ── 5. No conclusivo — solo log, nunca tocar DTE/ledger ────────────
  if (queryResult.kind !== "QUERY_PROCESSED") {
    await runtimeDb.dteTransmissionLog.create({
      data: {
        dte_document_id: dteDocumentId,
        attempt_number: attemptNumber,
        operation_type: "QUERY",
        request_url: queryDteUrl,
        http_status: "httpStatus" in queryResult ? queryResult.httpStatus ?? null : null,
        error_message: describeNonConclusiveQuery(queryResult),
        response_body: sanitizeQueryResultForLog(queryResult),
      },
    });
    return { status: "PENDING_UNCHANGED", queryKind: queryResult.kind };
  }

  // ── 6. QUERY_PROCESSED — resolver en transacción única ─────────────
  const finalStatus: "ACCEPTED" | "OBSERVED" = isMhProcessedObserved({
    codigoMsg: queryResult.codigoMsg,
    descripcionMsg: queryResult.descripcionMsg,
    observaciones: queryResult.observaciones,
  })
    ? "OBSERVED"
    : "ACCEPTED";

  const mhResponseSanitized = {
    mhEstado: queryResult.mhEstado,
    ambiente: queryResult.ambiente ?? null,
    codigoMsg: queryResult.codigoMsg,
    descripcionMsg: queryResult.descripcionMsg,
    fhProcesamiento: queryResult.fhProcesamiento, // conservado RAW — ver Corrección 4, nunca parseado a timestamp DB aquí
    httpStatus: queryResult.httpStatus,
    source: "RECONCILIATION_QUERY" as const,
  };

  try {
    await runtimeDb.$transaction(async (tx) => {
      // Re-leer DTE dentro de la transacción — nunca pisar un estado que
      // cambió concurrentemente mientras se hacía el HTTP (ej. otro
      // proceso ya transmitió/reconcilió el mismo documento).
      const freshDoc = await tx.dteOutgoingDocument.findUnique({
        where: { id: dteDocumentId },
        select: { dte_status: true, sent_at: true },
      });
      if (!freshDoc || freshDoc.dte_status !== "SIGNED") {
        throw new ReconciliationAbortedError(
          "CONCURRENT_CHANGE",
          `El documento ya no está en SIGNED (dte_status actual=${freshDoc?.dte_status ?? "(no existe)"}) — se detectó cambio concurrente durante la consulta HTTP. No se sobrescribió.`,
        );
      }

      // Corrección 3 — sent_at: preservar si existe; si no, usar el
      // primer log SEND; nunca inventar con la hora de la consulta.
      let sentAt = freshDoc.sent_at;
      if (!sentAt) {
        const earliestSendLog = await tx.dteTransmissionLog.findFirst({
          where: { dte_document_id: dteDocumentId, operation_type: "SEND" },
          orderBy: { created_at: "asc" },
          select: { created_at: true },
        });
        sentAt = earliestSendLog?.created_at ?? null;
      }

      const observationsJson =
        finalStatus === "OBSERVED" && queryResult.observaciones != null
          ? (queryResult.observaciones as Prisma.InputJsonValue)
          : undefined;

      await tx.dteOutgoingDocument.update({
        where: { id: dteDocumentId },
        data: {
          dte_status: finalStatus,
          reception_stamp: queryResult.selloRecibido,
          mh_response: mhResponseSanitized,
          ...(observationsJson !== undefined ? { observations: observationsJson } : {}),
          ...(finalStatus === "ACCEPTED" ? { accepted_at: now } : { observed_at: now }),
          sent_at: sentAt,
          updated_by: userId ?? undefined,
        },
      });

      await tx.dteTransmissionLog.create({
        data: {
          dte_document_id: dteDocumentId,
          attempt_number: attemptNumber,
          operation_type: "QUERY",
          request_url: queryDteUrl,
          http_status: queryResult.httpStatus,
          error_message: null,
          response_body: mhResponseSanitized,
        },
      });

      if (environment === "PRODUCTION") {
        const ledgerResult = await finalizePendingReservationByDocument(tx, dteDocumentId, now);
        if (!ledgerResult.ok) {
          throw new ReconciliationAbortedError(
            "LEDGER_DIVERGENCE",
            `finalizePendingReservationByDocument devolvió ${ledgerResult.reason} — el DTE NO se marca ${finalStatus} sin ledger resuelto. Rollback completo.`,
          );
        }
      }
      // TEST: no toca ledger — nunca existió reservation para este documento.
    });
  } catch (err) {
    if (err instanceof ReconciliationAbortedError) {
      return err.reasonCode === "CONCURRENT_CHANGE"
        ? { status: "ABORTED_CONCURRENT_CHANGE", detail: err.message }
        : { status: "INCONSISTENT_LOCAL_STATE", detail: err.message };
    }
    throw err;
  }

  return { status: "RESOLVED", dteStatus: finalStatus };
}

// ── Helpers internos ─────────────────────────────────────────────────

/**
 * Evidencia local mínima de que un mh_response ya persistido refleja
 * PROCESADO (usado solo para el repair local ACCEPTED/OBSERVED+PENDING
 * — nunca para decidir el resultado de una consulta MH real).
 */
function isMhResponseProcessed(mhResponse: unknown): boolean {
  if (!mhResponse || typeof mhResponse !== "object") return false;
  const estado = (mhResponse as Record<string, unknown>)["mhEstado"];
  return estado === "PROCESADO";
}

function describeNonConclusiveQuery(result: Exclude<DteQueryResult, { kind: "QUERY_PROCESSED" }>): string {
  switch (result.kind) {
    case "QUERY_REJECTED_OR_ERROR":
      return `MH respondió estado=${result.mhEstado ?? "(desconocido)"} — no conclusivo sobre el DTE original (codigoMsg=${result.codigoMsg ?? "-"}).`;
    case "QUERY_NOT_FOUND":
      return "MH indicó no encontrado — categoría reservada, sin acción automática (sin evidencia oficial inequívoca).";
    case "QUERY_TECHNICAL_ERROR":
      return `Error técnico de consulta: ${result.errorCode} — ${result.message}`;
    case "QUERY_INCONSISTENT":
      return `Respuesta inconsistente: ${result.reason}`;
  }
}

function sanitizeQueryResultForLog(result: DteQueryResult): Prisma.InputJsonValue {
  // Nunca incluye Authorization/token — el adapter ya nunca los devuelve
  // en DteQueryResult. rawResponse es la respuesta MH tal cual (sin
  // secretos por construcción del adapter).
  return JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
}
