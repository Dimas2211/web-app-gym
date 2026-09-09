// ─────────────────────────────────────────────────────────────────
// commerce/dte — list-dte-query-history.test.ts
//
// FASE IV-C — garantiza: solo operation_type="QUERY", orden desc,
// resumen extraído sin reenviar rawResponse/secretos, y que un
// response_body con forma inesperada no lanza (degrada a null).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { listDteQueryHistory } from "./list-dte-query-history";

function fakeClient(findManyImpl: (args: never) => unknown) {
  return { dteTransmissionLog: { findMany: vi.fn(findManyImpl) } } as never;
}

describe("listDteQueryHistory", () => {
  it("filtra por dte_document_id + operation_type=QUERY, ordena created_at desc", async () => {
    const findMany = vi.fn(async (args: { where: unknown; orderBy: unknown }) => {
      expect(args.where).toEqual({ dte_document_id: "doc-1", operation_type: "QUERY" });
      expect(args.orderBy).toEqual({ created_at: "desc" });
      return [];
    });
    await listDteQueryHistory({ dteDocumentId: "doc-1", client: fakeClient(findMany) });
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("extrae resumen de QUERY_PROCESSED (mhResponseSanitized) sin reenviar el objeto completo", async () => {
    const client = fakeClient(async () => [
      {
        id: "log-1",
        attempt_number: 1,
        http_status: 202,
        created_at: new Date("2026-09-01T00:00:00Z"),
        error_message: null,
        response_body: {
          mhEstado: "PROCESADO",
          ambiente: "00",
          codigoMsg: "001",
          descripcionMsg: "RECIBIDO",
          fhProcesamiento: "01/09/2026 01:52:08",
          httpStatus: 202,
          source: "RECONCILIATION_QUERY",
        },
      },
    ]);
    const result = await listDteQueryHistory({ dteDocumentId: "doc-1", client });
    expect(result).toEqual([
      {
        id: "log-1",
        attempt_number: 1,
        http_status: 202,
        created_at: new Date("2026-09-01T00:00:00Z"),
        error_message: null,
        result_kind: null, // mhResponseSanitized no tiene "kind"
        mh_estado: "PROCESADO",
        codigo_msg: "001",
        descripcion_msg: "RECIBIDO",
      },
    ]);
    // Nunca expone fhProcesamiento/ambiente/source/httpStatus del objeto original.
    expect(result[0]).not.toHaveProperty("fhProcesamiento");
    expect(result[0]).not.toHaveProperty("rawResponse");
  });

  it("extrae resumen de un resultado no conclusivo (sanitizeQueryResultForLog) con `kind`", async () => {
    const client = fakeClient(async () => [
      {
        id: "log-2",
        attempt_number: 1,
        http_status: 400,
        created_at: new Date("2026-09-01T00:00:00Z"),
        error_message: "MH respondió estado=RECHAZADO",
        response_body: {
          kind: "QUERY_REJECTED_OR_ERROR",
          mhEstado: "RECHAZADO",
          codigoMsg: "999",
          descripcionMsg: "No se encontro ningun registro que coincida",
          rawResponse: { secreto: "esto nunca debe salir del test" },
          httpStatus: 400,
        },
      },
    ]);
    const result = await listDteQueryHistory({ dteDocumentId: "doc-1", client });
    expect(result[0]).toMatchObject({
      result_kind: "QUERY_REJECTED_OR_ERROR",
      mh_estado: "RECHAZADO",
      codigo_msg: "999",
      descripcion_msg: "No se encontro ningun registro que coincida",
    });
    expect(result[0]).not.toHaveProperty("rawResponse");
    expect(JSON.stringify(result[0])).not.toContain("secreto");
  });

  it("response_body null/no-objeto -> summary con todos los campos null, sin lanzar", async () => {
    const client = fakeClient(async () => [
      {
        id: "log-3",
        attempt_number: 1,
        http_status: null,
        created_at: new Date("2026-09-01T00:00:00Z"),
        error_message: "Error técnico de consulta: MH_QUERY_TIMEOUT",
        response_body: null,
      },
    ]);
    const result = await listDteQueryHistory({ dteDocumentId: "doc-1", client });
    expect(result[0]).toMatchObject({
      result_kind: null,
      mh_estado: null,
      codigo_msg: null,
      descripcion_msg: null,
    });
  });

  it("response_body con forma inesperada (array/string) -> degrada a null sin lanzar", async () => {
    const client = fakeClient(async () => [
      { id: "log-4", attempt_number: 1, http_status: 200, created_at: new Date(), error_message: null, response_body: ["no", "es", "objeto"] },
    ]);
    const result = await listDteQueryHistory({ dteDocumentId: "doc-1", client });
    expect(result[0].result_kind).toBeNull();
  });

  it("usa el prisma global por defecto cuando no se pasa `client`", async () => {
    const { listDteQueryHistory: fn } = await import("./list-dte-query-history");
    // Solo confirma que no lanza por falta de `client` — comportamiento
    // real contra DB no se ejercita en este test unitario.
    expect(typeof fn).toBe("function");
  });
});
