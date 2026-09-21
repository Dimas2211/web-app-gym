// ─────────────────────────────────────────────────────────────────
// commerce/dte — reopen-rejected-dte-for-resign.service.test.ts
//
// FASE VI-E6A — primer test dedicado del service (antes solo se
// certificaba a través del mock en el test de la action). Fake db en
// memoria (nunca toca Postgres real), $transaction simula commit/
// rollback vía snapshot. Certifica:
//   - flujo normal REJECTED (802) -> SCHEMA_VALIDATED
//   - preconditions: estado != REJECTED, reception_stamp presente,
//     sin json_document, codigoMsg no resignable
//   - aislamiento cross-tenant/cross-location (findFirst scoped)
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { reopenRejectedDteForResign } from "./reopen-rejected-dte-for-resign.service";

const TENANT_ID = "tenant-1";
const LOCATION_ID = "loc-1";

interface DocRow {
  id: string;
  tenant_id: string;
  location_id: string;
  dte_status: string;
  reception_stamp: string | null;
  json_document: unknown;
  control_number: string | null;
  generation_code: string | null;
  signed_jws: string | null;
  signed_at: Date | null;
  sent_at: Date | null;
  rejected_at: Date | null;
  rejection_reason: string | null;
  updated_by: string | null;
}

interface LogRow {
  id: string;
  dte_document_id: string;
  attempt_number: number;
  operation_type: string;
  response_body: unknown;
  error_message: string | null;
  created_at: Date;
}

function baseDoc(overrides: Partial<DocRow> = {}): DocRow {
  return {
    id: "doc-1",
    tenant_id: TENANT_ID,
    location_id: LOCATION_ID,
    dte_status: "REJECTED",
    reception_stamp: null,
    json_document: { some: "json" },
    control_number: "DTE-01-M001P001-000000000000001",
    generation_code: "GEN-1",
    signed_jws: "jws-old",
    signed_at: new Date("2026-01-01T00:00:00Z"),
    sent_at: new Date("2026-01-01T00:00:01Z"),
    rejected_at: new Date("2026-01-01T00:00:02Z"),
    rejection_reason: "Firma inválida",
    updated_by: null,
    ...overrides,
  };
}

interface FakeDbApi {
  dteOutgoingDocument: {
    findFirst: (args: { where: { id: string; tenant_id: string; location_id: string } }) => Promise<DocRow | null>;
    update: (args: { where: { id: string }; data: Partial<DocRow> }) => Promise<DocRow>;
  };
  dteTransmissionLog: {
    findFirst: (args: { where: { dte_document_id: string; operation_type: string }; orderBy: { created_at: "asc" | "desc" } }) => Promise<LogRow | null>;
    create: (args: { data: Omit<LogRow, "id" | "created_at"> }) => Promise<LogRow>;
  };
  $transaction: (cb: (tx: FakeDbApi) => Promise<unknown>) => Promise<unknown>;
}

function createFakeDb(opts: { doc: DocRow; sendLogs?: LogRow[] }) {
  const docs = new Map<string, DocRow>([[opts.doc.id, { ...opts.doc }]]);
  let logs: LogRow[] = (opts.sendLogs ?? []).map((l) => ({ ...l }));
  let logIdSeq = 0;

  const api: FakeDbApi = {
    dteOutgoingDocument: {
      findFirst: async ({ where }: { where: { id: string; tenant_id: string; location_id: string } }) => {
        const row = docs.get(where.id);
        if (!row || row.tenant_id !== where.tenant_id || row.location_id !== where.location_id) return null;
        return { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<DocRow> }) => {
        const existing = docs.get(where.id);
        if (!existing) throw new Error("not found");
        const updated = { ...existing, ...data };
        docs.set(where.id, updated);
        return updated;
      },
    },
    dteTransmissionLog: {
      findFirst: async ({ where, orderBy }: { where: { dte_document_id: string; operation_type: string }; orderBy: { created_at: "asc" | "desc" } }) => {
        const matches = logs.filter((l) => l.dte_document_id === where.dte_document_id && l.operation_type === where.operation_type);
        matches.sort((a, b) => (orderBy.created_at === "asc" ? a.created_at.getTime() - b.created_at.getTime() : b.created_at.getTime() - a.created_at.getTime()));
        return matches[0] ?? null;
      },
      create: async ({ data }: { data: Omit<LogRow, "id" | "created_at"> }) => {
        const row: LogRow = { id: `log-${++logIdSeq}`, created_at: new Date(), ...data };
        logs.push(row);
        return row;
      },
    },
    $transaction: async (cb: (tx: FakeDbApi) => Promise<unknown>) => {
      const snapDocs = new Map(docs);
      const snapLogs = logs.slice();
      try {
        return await cb(api);
      } catch (err) {
        docs.clear();
        for (const [k, v] of snapDocs) docs.set(k, v);
        logs = snapLogs;
        throw err;
      }
    },
  };

  return { db: api as never, docs, logs: () => logs };
}

function resignableSendLog(overrides: Partial<LogRow> = {}): LogRow {
  return {
    id: "send-1",
    dte_document_id: "doc-1",
    attempt_number: 1,
    operation_type: "SEND",
    response_body: { codigoMsg: "802" },
    error_message: null,
    created_at: new Date("2026-01-01T00:00:02Z"),
    ...overrides,
  };
}

describe("reopenRejectedDteForResign — flujo normal", () => {
  it("REJECTED + codigoMsg 802 -> SCHEMA_VALIDATED, limpia signed_jws/signed_at/sent_at/rejected_at/rejection_reason", async () => {
    const { db, docs, logs } = createFakeDb({ doc: baseDoc(), sendLogs: [resignableSendLog()] });

    const result = await reopenRejectedDteForResign(
      { dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, userId: "user-1" },
      db,
    );

    expect(result).toEqual({ ok: true });
    const doc = docs.get("doc-1")!;
    expect(doc.dte_status).toBe("SCHEMA_VALIDATED");
    expect(doc.signed_jws).toBeNull();
    expect(doc.signed_at).toBeNull();
    expect(doc.sent_at).toBeNull();
    expect(doc.rejected_at).toBeNull();
    expect(doc.rejection_reason).toBeNull();
    expect(doc.updated_by).toBe("user-1");
    // preserva correlativo/generation code
    expect(doc.control_number).toBe("DTE-01-M001P001-000000000000001");
    expect(doc.generation_code).toBe("GEN-1");

    const retryLog = logs().find((l) => l.operation_type === "RETRY_PREPARE");
    expect(retryLog).toBeTruthy();
  });
});

describe("reopenRejectedDteForResign — preconditions (fail closed)", () => {
  it("estado != REJECTED -> error explícito, no muta nada", async () => {
    const { db, docs } = createFakeDb({ doc: baseDoc({ dte_status: "SIGNED" }), sendLogs: [resignableSendLog()] });
    const result = await reopenRejectedDteForResign(
      { dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, userId: "user-1" },
      db,
    );
    expect(result.ok).toBe(false);
    expect(docs.get("doc-1")!.dte_status).toBe("SIGNED");
  });

  it("reception_stamp presente -> error explícito (no es rechazo técnico de firma)", async () => {
    const { db, docs } = createFakeDb({ doc: baseDoc({ reception_stamp: "SELLO-X" }), sendLogs: [resignableSendLog()] });
    const result = await reopenRejectedDteForResign(
      { dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, userId: "user-1" },
      db,
    );
    expect(result.ok).toBe(false);
    expect(docs.get("doc-1")!.dte_status).toBe("REJECTED");
  });

  it("sin json_document -> error explícito", async () => {
    const { db } = createFakeDb({ doc: baseDoc({ json_document: null }), sendLogs: [resignableSendLog()] });
    const result = await reopenRejectedDteForResign(
      { dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, userId: "user-1" },
      db,
    );
    expect(result.ok).toBe(false);
  });

  it("codigoMsg no resignable (ej. datos fiscales) -> error explícito, requiere revisión manual", async () => {
    const { db, docs } = createFakeDb({
      doc: baseDoc(),
      sendLogs: [resignableSendLog({ response_body: { codigoMsg: "999" } })],
    });
    const result = await reopenRejectedDteForResign(
      { dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, userId: "user-1" },
      db,
    );
    expect(result.ok).toBe(false);
    expect(docs.get("doc-1")!.dte_status).toBe("REJECTED");
  });

  it("sin ningún log SEND -> error explícito (codigoMsg desconocido, no reintentable)", async () => {
    const { db } = createFakeDb({ doc: baseDoc(), sendLogs: [] });
    const result = await reopenRejectedDteForResign(
      { dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, userId: "user-1" },
      db,
    );
    expect(result.ok).toBe(false);
  });
});

describe("reopenRejectedDteForResign — cross-tenant/cross-location (VI-E6A)", () => {
  it("tenant A no puede reabrir un DTE de tenant B -> error explícito, no muta nada, no toca logs", async () => {
    const { db, docs, logs } = createFakeDb({ doc: baseDoc({ tenant_id: "tenant-B" }), sendLogs: [resignableSendLog()] });
    const result = await reopenRejectedDteForResign(
      { dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, userId: "user-1" },
      db,
    );
    expect(result.ok).toBe(false);
    expect(docs.get("doc-1")!.dte_status).toBe("REJECTED");
    expect(logs().find((l) => l.operation_type === "RETRY_PREPARE")).toBeUndefined();
  });

  it("location A no puede reabrir un DTE de location B (mismo tenant) -> error explícito, no muta nada", async () => {
    const { db, docs, logs } = createFakeDb({ doc: baseDoc({ location_id: "loc-B" }), sendLogs: [resignableSendLog()] });
    const result = await reopenRejectedDteForResign(
      { dteDocumentId: "doc-1", tenantId: TENANT_ID, locationId: LOCATION_ID, userId: "user-1" },
      db,
    );
    expect(result.ok).toBe(false);
    expect(docs.get("doc-1")!.dte_status).toBe("REJECTED");
    expect(logs().find((l) => l.operation_type === "RETRY_PREPARE")).toBeUndefined();
  });
});
