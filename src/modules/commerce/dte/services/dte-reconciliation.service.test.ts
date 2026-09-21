// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-reconciliation.service.test.ts
//
// FASE IV-B.1 — reconcileDteWithMh: fake runtimeDb en memoria (nunca
// toca Postgres real), MhDteQueryAdapter mockeado (nunca llama MH
// real). $transaction simula commit/rollback real vía snapshot.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { reconcileDteWithMh } from "./dte-reconciliation.service";
import type { DteQueryResult } from "../types/dte-query.types";

const TENANT_ID = "tenant-1";
const LOCATION_ID = "loc-1";

interface DocRow {
  id: string;
  tenant_id: string;
  location_id: string;
  dte_status: string;
  environment: "TEST" | "PRODUCTION";
  dte_type_code: string;
  generation_code: string | null;
  control_number: string | null;
  issuer_config_id: string | null;
  reception_stamp: string | null;
  mh_response: unknown;
  observations: unknown;
  sent_at: Date | null;
  accepted_at: Date | null;
  observed_at: Date | null;
  updated_by: string | null;
}

interface ResRow {
  id: string;
  tenant_id: string;
  dte_document_id: string;
  entitlement_code: string;
  period_key: string;
  status: "PENDING" | "CONSUMED" | "RELEASED";
  reserved_at: Date;
  resolved_at: Date | null;
}

interface LogRow {
  id: string;
  dte_document_id: string;
  attempt_number: number;
  operation_type: string;
  request_url: string | null;
  http_status: number | null;
  error_message: string | null;
  response_body: unknown;
  created_at: Date;
}

function baseDoc(overrides: Partial<DocRow> = {}): DocRow {
  return {
    id: "doc-1",
    tenant_id: TENANT_ID,
    location_id: LOCATION_ID,
    dte_status: "SIGNED",
    environment: "PRODUCTION",
    dte_type_code: "01",
    generation_code: "ABCDEF12-1234-1234-1234-1234567890AB",
    control_number: "DTE-01-M001P001-000000000000001",
    issuer_config_id: "issuer-1",
    reception_stamp: null,
    mh_response: null,
    observations: null,
    sent_at: null,
    accepted_at: null,
    observed_at: null,
    updated_by: null,
    ...overrides,
  };
}

function createFakeDb(opts: { doc: DocRow; reservation?: ResRow | null; issuerNit?: string | null; sendLogs?: LogRow[] }) {
  const docs = new Map<string, DocRow>([[opts.doc.id, { ...opts.doc }]]);
  const reservations = new Map<string, ResRow>(
    opts.reservation ? [[opts.reservation.dte_document_id, { ...opts.reservation }]] : [],
  );
  const issuerConfigs = new Map<string, { id: string; nit: string | null }>([
    ["issuer-1", { id: "issuer-1", nit: opts.issuerNit === undefined ? "0614-000000-000-0" : opts.issuerNit }],
  ]);
  let logs: LogRow[] = (opts.sendLogs ?? []).map((l) => ({ ...l }));
  let logIdSeq = 0;
  let nowCounter = 1000;

  interface FakeDbApi {
    dteOutgoingDocument: {
      findFirst: (args: { where: { id: string; tenant_id: string; location_id: string } }) => Promise<DocRow | null>;
      findUnique: (args: { where: { id: string } }) => Promise<DocRow | null>;
      update: (args: { where: { id: string }; data: Partial<DocRow> }) => Promise<DocRow>;
    };
    dteFiscalMeteringReservation: {
      findUnique: (args: { where: { dte_document_id: string } }) => Promise<ResRow | null>;
      updateMany: (args: { where: { dte_document_id: string; status: string }; data: Partial<ResRow> }) => Promise<{ count: number }>;
    };
    dteIssuerConfig: {
      findUnique: (args: { where: { id: string } }) => Promise<{ id: string; nit: string | null } | null>;
    };
    dteTransmissionLog: {
      count: (args: { where: { dte_document_id: string; operation_type: string } }) => Promise<number>;
      create: (args: { data: Omit<LogRow, "id" | "created_at"> }) => Promise<LogRow>;
      findFirst: (args: { where: { dte_document_id: string; operation_type: string }; orderBy: { created_at: "asc" | "desc" } }) => Promise<LogRow | null>;
    };
    $transaction: (cb: (tx: FakeDbApi) => Promise<unknown>) => Promise<unknown>;
  }

  const api: FakeDbApi = {
    dteOutgoingDocument: {
      findFirst: async ({ where }: { where: { id: string; tenant_id: string; location_id: string } }) => {
        const row = docs.get(where.id);
        if (!row || row.tenant_id !== where.tenant_id || row.location_id !== where.location_id) return null;
        return { ...row };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = docs.get(where.id);
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<DocRow> }) => {
        const existing = docs.get(where.id);
        if (!existing) throw new Error("not found");
        const updated = { ...existing, ...data };
        docs.set(where.id, updated);
        return updated;
      },
    },
    dteFiscalMeteringReservation: {
      findUnique: async ({ where }: { where: { dte_document_id: string } }) => {
        const row = reservations.get(where.dte_document_id);
        return row ? { ...row } : null;
      },
      updateMany: async ({ where, data }: { where: { dte_document_id: string; status: string }; data: Partial<ResRow> }) => {
        const existing = reservations.get(where.dte_document_id);
        if (!existing || existing.status !== where.status) return { count: 0 };
        reservations.set(where.dte_document_id, { ...existing, ...data });
        return { count: 1 };
      },
    },
    dteIssuerConfig: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = issuerConfigs.get(where.id);
        return row ? { ...row } : null;
      },
    },
    dteTransmissionLog: {
      count: async ({ where }: { where: { dte_document_id: string; operation_type: string } }) =>
        logs.filter((l) => l.dte_document_id === where.dte_document_id && l.operation_type === where.operation_type).length,
      create: async ({ data }: { data: Omit<LogRow, "id" | "created_at"> }) => {
        const row: LogRow = { id: `log-${++logIdSeq}`, created_at: new Date(nowCounter++), ...data };
        logs.push(row);
        return row;
      },
      findFirst: async ({ where, orderBy }: { where: { dte_document_id: string; operation_type: string }; orderBy: { created_at: "asc" | "desc" } }) => {
        const matches = logs.filter((l) => l.dte_document_id === where.dte_document_id && l.operation_type === where.operation_type);
        matches.sort((a, b) => (orderBy.created_at === "asc" ? a.created_at.getTime() - b.created_at.getTime() : b.created_at.getTime() - a.created_at.getTime()));
        return matches[0] ?? null;
      },
    },
    $transaction: async (cb: (tx: typeof api) => Promise<unknown>) => {
      const snapDocs = new Map(docs);
      const snapRes = new Map(reservations);
      const snapLogs = logs.slice();
      try {
        return await cb(api);
      } catch (err) {
        docs.clear();
        for (const [k, v] of snapDocs) docs.set(k, v);
        reservations.clear();
        for (const [k, v] of snapRes) reservations.set(k, v);
        logs = snapLogs;
        throw err;
      }
    },
  };

  return { db: api as never, docs, reservations, logs: () => logs };
}

function pendingReservation(overrides: Partial<ResRow> = {}): ResRow {
  return {
    id: "res-1",
    tenant_id: TENANT_ID,
    dte_document_id: "doc-1",
    entitlement_code: "fiscal.dte.monthly_issued",
    period_key: "2026-09",
    status: "PENDING",
    reserved_at: new Date("2026-09-01T00:00:00Z"),
    resolved_at: null,
    ...overrides,
  };
}

function fakeAdapter(result: DteQueryResult | ((input: unknown) => DteQueryResult | Promise<DteQueryResult>)) {
  return { query: vi.fn(typeof result === "function" ? result : async () => result) } as never;
}

const PROCESSED_ACCEPTED: DteQueryResult = {
  kind: "QUERY_PROCESSED",
  mhEstado: "PROCESADO",
  ambiente: "01",
  codigoGeneracion: "ABCDEF12-1234-1234-1234-1234567890AB",
  selloRecibido: "SELLO123",
  fhProcesamiento: "19/08/2026 23:31:19",
  codigoMsg: "001",
  descripcionMsg: "RECIBIDO",
  observaciones: [],
  rawResponse: {},
  httpStatus: 200,
};

describe("reconcileDteWithMh — flujo normal PRODUCTION", () => {
  it("21. SIGNED+PENDING + PROCESSED (sin observaciones) -> ACCEPTED + ledger CONSUMED, atómico", async () => {
    const { db, docs, reservations, logs } = createFakeDb({ doc: baseDoc(), reservation: pendingReservation() });
    const result = await reconcileDteWithMh({
      dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db,
      queryAdapter: fakeAdapter(PROCESSED_ACCEPTED),
    });
    expect(result).toEqual({ status: "RESOLVED", dteStatus: "ACCEPTED" });
    expect(docs.get("doc-1")?.dte_status).toBe("ACCEPTED");
    expect(docs.get("doc-1")?.reception_stamp).toBe("SELLO123");
    expect(reservations.get("doc-1")?.status).toBe("CONSUMED");
    expect(logs().filter((l) => l.operation_type === "QUERY")).toHaveLength(1);
  });

  it("22. SIGNED+PENDING + PROCESSED con observaciones reales -> OBSERVED + ledger CONSUMED", async () => {
    const { db, docs, reservations } = createFakeDb({ doc: baseDoc(), reservation: pendingReservation() });
    const observed: DteQueryResult = { ...PROCESSED_ACCEPTED, observaciones: ["falta detalle X"] };
    const result = await reconcileDteWithMh({
      dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db,
      queryAdapter: fakeAdapter(observed),
    });
    expect(result).toEqual({ status: "RESOLVED", dteStatus: "OBSERVED" });
    expect(docs.get("doc-1")?.dte_status).toBe("OBSERVED");
    expect(reservations.get("doc-1")?.status).toBe("CONSUMED");
  });

  it("23. PROD, error técnico de consulta -> DTE sigue SIGNED, ledger sigue PENDING", async () => {
    const { db, docs, reservations } = createFakeDb({ doc: baseDoc(), reservation: pendingReservation() });
    const result = await reconcileDteWithMh({
      dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db,
      queryAdapter: fakeAdapter({ kind: "QUERY_TECHNICAL_ERROR", errorCode: "MH_QUERY_TIMEOUT", message: "timeout" }),
    });
    expect(result).toEqual({ status: "PENDING_UNCHANGED", queryKind: "QUERY_TECHNICAL_ERROR" });
    expect(docs.get("doc-1")?.dte_status).toBe("SIGNED");
    expect(reservations.get("doc-1")?.status).toBe("PENDING");
  });

  it("24. PROD, RECHAZADO de consulta -> fail-closed, DTE sigue SIGNED, ledger sigue PENDING", async () => {
    const { db, docs, reservations } = createFakeDb({ doc: baseDoc(), reservation: pendingReservation() });
    const result = await reconcileDteWithMh({
      dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db,
      queryAdapter: fakeAdapter({ kind: "QUERY_REJECTED_OR_ERROR", mhEstado: "RECHAZADO", codigoMsg: "ERROR_CODIGO", descripcionMsg: "ERROR_DESCRIPCION", rawResponse: {}, httpStatus: 400 }),
    });
    expect(result).toEqual({ status: "PENDING_UNCHANGED", queryKind: "QUERY_REJECTED_OR_ERROR" });
    expect(docs.get("doc-1")?.dte_status).toBe("SIGNED");
    expect(reservations.get("doc-1")?.status).toBe("PENDING");
  });

  it("25. mismatch (QUERY_INCONSISTENT) -> DTE sigue SIGNED, ledger sigue PENDING", async () => {
    const { db, docs, reservations } = createFakeDb({ doc: baseDoc(), reservation: pendingReservation() });
    const result = await reconcileDteWithMh({
      dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db,
      queryAdapter: fakeAdapter({ kind: "QUERY_INCONSISTENT", reason: "codigoGeneracion no coincide", rawResponse: {}, httpStatus: 200 }),
    });
    expect(result).toEqual({ status: "PENDING_UNCHANGED", queryKind: "QUERY_INCONSISTENT" });
    expect(docs.get("doc-1")?.dte_status).toBe("SIGNED");
    expect(reservations.get("doc-1")?.status).toBe("PENDING");
  });
});

describe("reconcileDteWithMh — TEST", () => {
  it("26. TEST + PROCESSED -> ACCEPTED, cero ledger (nunca crea reservation)", async () => {
    const { db, docs, reservations } = createFakeDb({ doc: baseDoc({ environment: "TEST" }), reservation: null });
    const result = await reconcileDteWithMh({
      dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db,
      queryAdapter: fakeAdapter({ ...PROCESSED_ACCEPTED, ambiente: "00" }),
    });
    expect(result).toEqual({ status: "RESOLVED", dteStatus: "ACCEPTED" });
    expect(docs.get("doc-1")?.dte_status).toBe("ACCEPTED");
    expect(reservations.size).toBe(0);
  });
});

describe("reconcileDteWithMh — inconsistencias locales (nunca llaman MH)", () => {
  it("27. PROD SIGNED+PENDING, pero la reserva desaparece durante la transacción -> rollback completo, sin escritura parcial", async () => {
    const { db, docs, reservations } = createFakeDb({ doc: baseDoc(), reservation: pendingReservation() });
    // Simula que, entre la llamada HTTP y la transacción, otro proceso
    // eliminó/alteró la reserva por completo.
    const adapter = fakeAdapter(async () => {
      reservations.delete("doc-1");
      return PROCESSED_ACCEPTED;
    });
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });
    expect(result.status).toBe("INCONSISTENT_LOCAL_STATE");
    expect(docs.get("doc-1")?.dte_status).toBe("SIGNED"); // nunca se escribió ACCEPTED
  });

  it("28. PROD reservation CONSUMED pero DTE SIGNED -> inconsistent, NUNCA llama MH", async () => {
    const { db, docs } = createFakeDb({ doc: baseDoc(), reservation: pendingReservation({ status: "CONSUMED" }) });
    const adapter = fakeAdapter(PROCESSED_ACCEPTED);
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });
    expect(result.status).toBe("INCONSISTENT_LOCAL_STATE");
    expect((adapter as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
    expect(docs.get("doc-1")?.dte_status).toBe("SIGNED");
  });

  it("PROD SIGNED sin reservation -> inconsistent, NUNCA llama MH", async () => {
    const { db } = createFakeDb({ doc: baseDoc(), reservation: null });
    const adapter = fakeAdapter(PROCESSED_ACCEPTED);
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });
    expect(result.status).toBe("INCONSISTENT_LOCAL_STATE");
    expect((adapter as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });
});

describe("reconcileDteWithMh — idempotencia en estados terminales (nunca llaman MH)", () => {
  it("29. ACCEPTED+CONSUMED -> no-op, no llama MH", async () => {
    const { db } = createFakeDb({ doc: baseDoc({ dte_status: "ACCEPTED", reception_stamp: "SELLO", mh_response: { mhEstado: "PROCESADO" } }), reservation: pendingReservation({ status: "CONSUMED" }) });
    const adapter = fakeAdapter(PROCESSED_ACCEPTED);
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });
    expect(result).toEqual({ status: "NO_OP", reason: "ALREADY_RESOLVED", dteStatus: "ACCEPTED" });
    expect((adapter as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });

  it("30. OBSERVED+CONSUMED -> no-op, no llama MH", async () => {
    const { db } = createFakeDb({ doc: baseDoc({ dte_status: "OBSERVED", reception_stamp: "SELLO" }), reservation: pendingReservation({ status: "CONSUMED" }) });
    const adapter = fakeAdapter(PROCESSED_ACCEPTED);
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });
    expect(result).toEqual({ status: "NO_OP", reason: "ALREADY_RESOLVED", dteStatus: "OBSERVED" });
    expect((adapter as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });

  it("31. INVALIDATED+CONSUMED -> no-op, nunca revierte a ACCEPTED", async () => {
    const { db, docs } = createFakeDb({ doc: baseDoc({ dte_status: "INVALIDATED", reception_stamp: "SELLO" }), reservation: pendingReservation({ status: "CONSUMED" }) });
    const adapter = fakeAdapter(PROCESSED_ACCEPTED);
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });
    expect(result).toEqual({ status: "NO_OP", reason: "ALREADY_RESOLVED", dteStatus: "INVALIDATED" });
    expect(docs.get("doc-1")?.dte_status).toBe("INVALIDATED");
    expect((adapter as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });

  it("32. REJECTED+RELEASED -> no-op, no llama MH", async () => {
    const { db } = createFakeDb({ doc: baseDoc({ dte_status: "REJECTED" }), reservation: pendingReservation({ status: "RELEASED" }) });
    const adapter = fakeAdapter(PROCESSED_ACCEPTED);
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });
    expect(result).toEqual({ status: "NO_OP", reason: "ALREADY_RESOLVED", dteStatus: "REJECTED" });
    expect((adapter as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });
});

describe("reconcileDteWithMh — repair local (ACCEPTED/OBSERVED + PENDING)", () => {
  it("33. evidencia local suficiente (reception_stamp + mh_response PROCESADO) -> repara ledger sin llamar MH", async () => {
    const { db, reservations } = createFakeDb({
      doc: baseDoc({ dte_status: "ACCEPTED", reception_stamp: "SELLO123", mh_response: { mhEstado: "PROCESADO" } }),
      reservation: pendingReservation({ status: "PENDING" }),
    });
    const adapter = fakeAdapter(PROCESSED_ACCEPTED);
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });
    expect(result).toEqual({ status: "REPAIRED_LOCAL", dteStatus: "ACCEPTED" });
    expect(reservations.get("doc-1")?.status).toBe("CONSUMED");
    expect((adapter as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });

  it("34. evidencia local insuficiente (sin reception_stamp) -> reporta, no muta nada", async () => {
    const { db, reservations, docs } = createFakeDb({
      doc: baseDoc({ dte_status: "ACCEPTED", reception_stamp: null }),
      reservation: pendingReservation({ status: "PENDING" }),
    });
    const adapter = fakeAdapter(PROCESSED_ACCEPTED);
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });
    expect(result.status).toBe("INCONSISTENT_LOCAL_STATE");
    expect(reservations.get("doc-1")?.status).toBe("PENDING"); // sin cambios
    expect(docs.get("doc-1")?.dte_status).toBe("ACCEPTED"); // sin cambios
    expect((adapter as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });
});

describe("reconcileDteWithMh — concurrencia y sent_at", () => {
  it("35. el DTE cambia de estado concurrentemente durante la llamada HTTP -> no sobrescribe", async () => {
    const { db, docs, reservations } = createFakeDb({ doc: baseDoc(), reservation: pendingReservation() });
    const adapter = fakeAdapter(async () => {
      // Simula que OTRO proceso ya resolvió el documento mientras esperábamos la respuesta MH.
      docs.set("doc-1", { ...docs.get("doc-1")!, dte_status: "REJECTED" });
      return PROCESSED_ACCEPTED;
    });
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });
    expect(result.status).toBe("ABORTED_CONCURRENT_CHANGE");
    expect(docs.get("doc-1")?.dte_status).toBe("REJECTED"); // se preserva el cambio concurrente, nunca se pisa
    expect(reservations.get("doc-1")?.status).toBe("PENDING"); // ledger no tocado por esta reconciliación abortada
  });

  it("36. sent_at ya existente se preserva tal cual", async () => {
    const existingSentAt = new Date("2026-08-01T10:00:00Z");
    const { db, docs } = createFakeDb({ doc: baseDoc({ sent_at: existingSentAt }), reservation: pendingReservation() });
    await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: fakeAdapter(PROCESSED_ACCEPTED) });
    expect(docs.get("doc-1")?.sent_at).toEqual(existingSentAt);
  });

  it("37. sent_at null + existe log SEND previo -> usa el created_at del primer SEND", async () => {
    const earliestSend = new Date("2026-08-01T09:00:00Z");
    const laterSend = new Date("2026-08-01T09:05:00Z");
    const { db, docs } = createFakeDb({
      doc: baseDoc({ sent_at: null }),
      reservation: pendingReservation(),
      sendLogs: [
        { id: "log-a", dte_document_id: "doc-1", attempt_number: 1, operation_type: "SEND", request_url: null, http_status: null, error_message: "timeout", response_body: null, created_at: earliestSend },
        { id: "log-b", dte_document_id: "doc-1", attempt_number: 2, operation_type: "SEND", request_url: null, http_status: null, error_message: "timeout", response_body: null, created_at: laterSend },
      ],
    });
    await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: fakeAdapter(PROCESSED_ACCEPTED) });
    expect(docs.get("doc-1")?.sent_at).toEqual(earliestSend);
  });

  it("38. sent_at null + sin ningún log SEND -> permanece null (nunca se inventa con la hora de la consulta)", async () => {
    const { db, docs } = createFakeDb({ doc: baseDoc({ sent_at: null }), reservation: pendingReservation() });
    await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: fakeAdapter(PROCESSED_ACCEPTED) });
    expect(docs.get("doc-1")?.sent_at).toBeNull();
  });
});

describe("reconcileDteWithMh — logging", () => {
  it("39. el log QUERY nunca contiene Authorization/token/Bearer", async () => {
    const { db, logs } = createFakeDb({ doc: baseDoc(), reservation: pendingReservation() });
    await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: fakeAdapter(PROCESSED_ACCEPTED) });
    const serialized = JSON.stringify(logs());
    expect(serialized).not.toMatch(/Bearer|Authorization|password/i);
  });

  it("40. attempt_number de QUERY es independiente de los intentos SEND previos", async () => {
    const { db, logs } = createFakeDb({
      doc: baseDoc({ sent_at: new Date("2026-08-01T09:00:00Z") }),
      reservation: pendingReservation(),
      sendLogs: [
        { id: "s1", dte_document_id: "doc-1", attempt_number: 1, operation_type: "SEND", request_url: null, http_status: null, error_message: "timeout", response_body: null, created_at: new Date(1) },
        { id: "s2", dte_document_id: "doc-1", attempt_number: 2, operation_type: "SEND", request_url: null, http_status: null, error_message: "timeout", response_body: null, created_at: new Date(2) },
        { id: "s3", dte_document_id: "doc-1", attempt_number: 3, operation_type: "SEND", request_url: null, http_status: null, error_message: "timeout", response_body: null, created_at: new Date(3) },
      ],
    });
    await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: fakeAdapter(PROCESSED_ACCEPTED) });
    const queryLogs = logs().filter((l) => l.operation_type === "QUERY");
    expect(queryLogs).toHaveLength(1);
    expect(queryLogs[0]?.attempt_number).toBe(1); // primer QUERY, sin importar que ya había 3 SEND
  });
});

describe("reconcileDteWithMh — errores de negocio", () => {
  it("documento inexistente -> BUSINESS_ERROR", async () => {
    const { db } = createFakeDb({ doc: baseDoc(), reservation: pendingReservation() });
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-inexistente", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: fakeAdapter(PROCESSED_ACCEPTED) });
    expect(result.status).toBe("BUSINESS_ERROR");
  });

  it("sin NIT en el issuer config -> BUSINESS_ERROR, nunca llama MH", async () => {
    const { db } = createFakeDb({ doc: baseDoc(), reservation: pendingReservation(), issuerNit: null });
    const adapter = fakeAdapter(PROCESSED_ACCEPTED);
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });
    expect(result.status).toBe("BUSINESS_ERROR");
    expect((adapter as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });

  it("estado no aplicable (ej. GENERATED) -> NO_OP NOT_APPLICABLE, no llama MH", async () => {
    const { db } = createFakeDb({ doc: baseDoc({ dte_status: "GENERATED" }), reservation: null });
    const adapter = fakeAdapter(PROCESSED_ACCEPTED);
    const result = await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });
    expect(result).toEqual({ status: "NO_OP", reason: "NOT_APPLICABLE", dteStatus: "GENERATED" });
    expect((adapter as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// FASE VI-E6A — cross-tenant/location isolation
// ─────────────────────────────────────────────────────────────────

describe("reconcileDteWithMh — cross-tenant/cross-location (VI-E6A)", () => {
  it("Tenant A no puede reconciliar un DTE de tenant B -> BUSINESS_ERROR, nunca llama MH", async () => {
    const { db } = createFakeDb({ doc: baseDoc({ tenant_id: "tenant-B" }), reservation: pendingReservation() });
    const adapter = fakeAdapter(PROCESSED_ACCEPTED);
    const result = await reconcileDteWithMh({
      dteDocumentId: "doc-1",
      tenantId: TENANT_ID, // pide con tenant-1, el doc real es de tenant-B
      locationId: LOCATION_ID,
      runtimeDb: db,
      queryAdapter: adapter,
    });
    expect(result.status).toBe("BUSINESS_ERROR");
    expect((adapter as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });

  it("Location A no puede reconciliar un DTE de location B (mismo tenant) -> BUSINESS_ERROR, nunca llama MH", async () => {
    const { db } = createFakeDb({ doc: baseDoc({ location_id: "loc-B" }), reservation: pendingReservation() });
    const adapter = fakeAdapter(PROCESSED_ACCEPTED);
    const result = await reconcileDteWithMh({
      dteDocumentId: "doc-1",
      tenantId: TENANT_ID,
      locationId: LOCATION_ID, // pide con loc-1, el doc real es de loc-B
      runtimeDb: db,
      queryAdapter: adapter,
    });
    expect(result.status).toBe("BUSINESS_ERROR");
    expect((adapter as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// FASE VI-E6A — integración de ambiente: TEST vs PRODUCTION selecciona
// la URL de consulta MH correcta (no basta con testear resolveDteMhUrls
// aislado — aquí se certifica el chain completo dteDoc.environment ->
// adapter.query({ environment }) -> request_url persistido en el log).
// ─────────────────────────────────────────────────────────────────

describe("reconcileDteWithMh — integración de ambiente TEST/PRODUCTION (VI-E6A)", () => {
  it("dteDoc.environment=TEST -> adapter.query recibe environment=TEST y el log QUERY usa la URL de consulta TEST", async () => {
    const { db, logs } = createFakeDb({
      doc: baseDoc({ environment: "TEST", dte_status: "SIGNED" }),
      reservation: null, // TEST nunca tiene ledger
    });
    const adapter = fakeAdapter({ kind: "QUERY_NOT_FOUND" } as DteQueryResult);
    await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });

    const queryCall = (adapter as { query: ReturnType<typeof vi.fn> }).query.mock.calls[0]?.[0];
    expect(queryCall.environment).toBe("TEST");

    const queryLog = logs().find((l) => l.operation_type === "QUERY");
    expect(queryLog?.request_url).toContain("apitest.dtes.mh.gob.sv");
  });

  it("dteDoc.environment=PRODUCTION -> adapter.query recibe environment=PRODUCTION y el log QUERY usa la URL de consulta PRODUCTION", async () => {
    const { db, logs } = createFakeDb({
      doc: baseDoc({ environment: "PRODUCTION", dte_status: "SIGNED" }),
      reservation: pendingReservation(),
    });
    const adapter = fakeAdapter({ kind: "QUERY_NOT_FOUND" } as DteQueryResult);
    await reconcileDteWithMh({ dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, runtimeDb: db, queryAdapter: adapter });

    const queryCall = (adapter as { query: ReturnType<typeof vi.fn> }).query.mock.calls[0]?.[0];
    expect(queryCall.environment).toBe("PRODUCTION");

    const queryLog = logs().find((l) => l.operation_type === "QUERY");
    expect(queryLog?.request_url).not.toContain("apitest.dtes.mh.gob.sv");
    expect(queryLog?.request_url).toMatch(/^https:\/\/api\.dtes\.mh\.gob\.sv/);
  });
});
