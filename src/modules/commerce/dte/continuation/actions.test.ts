import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  context: vi.fn(),
  dispose: vi.fn(),
  find: vi.fn(),
  log: vi.fn(),
  fe: vi.fn(),
  ccf: vi.fn(),
  nc: vi.fn(),
  fse: vi.fn(),
  validate: vi.fn(),
  sign: vi.fn(),
  transmit: vi.fn(),
  deliver: vi.fn(),
  reopen: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: h.context,
  OperationalContextError: class extends Error {
    userMessage = "Sesión de solo lectura";
  },
}));
vi.mock("../actions/generate-fe-json-for-sale.action", () => ({
  generateFeJsonForSaleAction: h.fe,
}));
vi.mock("../actions/generate-ccfe-json-for-sale.action", () => ({
  generateCcfeJsonForSaleAction: h.ccf,
}));
vi.mock("../actions/generate-nc-json.action", () => ({ generateNcJsonAction: h.nc }));
vi.mock("../actions/generate-fse-json-for-purchase.action", () => ({
  generateFseJsonForPurchaseAction: h.fse,
}));
vi.mock("../actions/validate-dte-json-schema.action", () => ({
  validateDteJsonSchemaAction: h.validate,
}));
vi.mock("../actions/sign-dte-document.action", () => ({ signDteDocumentAction: h.sign }));
vi.mock("../actions/transmit-dte-document.action", () => ({
  transmitDteDocumentAction: h.transmit,
}));
vi.mock("../actions/deliver-dte-to-external-db.action", () => ({
  deliverDteToExternalDbAction: h.deliver,
}));
vi.mock("../actions/reopen-rejected-dte-for-resign.action", () => ({
  reopenRejectedDteForResignAction: h.reopen,
}));
vi.mock("../actions/reconcile-dte-with-mh.action", () => ({
  reconcileDteWithMhAction: h.reconcile,
}));
import { getDteContinuationAction, runDteContinuationAction } from "./actions";
import { OperationalContextError } from "@/modules/platform/runtime/require-operational-context";
import type { DteContinuationRequest } from "./types";

const request: DteContinuationRequest = { dteId: "doc-1", origin: "sale", originId: "sale-1" };
const writes = [
  h.fe,
  h.ccf,
  h.nc,
  h.fse,
  h.validate,
  h.sign,
  h.transmit,
  h.deliver,
  h.reopen,
  h.reconcile,
];
let doc: Record<string, unknown>;
const db = { dteOutgoingDocument: { findFirst: h.find }, dteTransmissionLog: { findFirst: h.log } };
beforeEach(() => {
  vi.resetAllMocks();
  doc = {
    id: "doc-1",
    tenant_id: "tenant-1",
    location_id: "loc-1",
    sale_id: "sale-1",
    purchase_id: null,
    dte_type_code: "01",
    environment: "TEST",
    dte_status: "PENDING_GENERATION",
    control_number: "DTE-01-001",
    generation_code: "GEN-1",
    json_document: null,
    signed_jws: null,
    reception_stamp: null,
    sale: { status: "CONFIRMED" },
    purchase: null,
  };
  h.context.mockResolvedValue({
    context: {
      tenantId: "tenant-1",
      locationId: "loc-1",
      effectiveUser: { role: "branch_admin" },
      client: db,
    },
    dispose: h.dispose,
  });
  h.find.mockImplementation(async ({ where }) => {
    if (
      where.id !== doc.id ||
      where.tenant_id !== doc.tenant_id ||
      where.location_id !== doc.location_id ||
      where.sale_id !== doc.sale_id ||
      where.purchase_id !== doc.purchase_id
    )
      return null;
    const allowed =
      typeof where.dte_type_code === "string" ? [where.dte_type_code] : where.dte_type_code.in;
    return allowed.includes(doc.dte_type_code) ? { ...doc } : null;
  });
  h.log.mockResolvedValue(null);
  for (const action of writes) action.mockResolvedValue({ ok: true });
  for (const action of [h.fe, h.ccf, h.nc])
    action.mockImplementation(async () => {
      doc.dte_status = "GENERATED";
      doc.json_document = {};
      return { ok: true };
    });
  h.validate.mockImplementation(async () => {
    doc.dte_status = "SCHEMA_VALIDATED";
    return { ok: true };
  });
  h.fse.mockImplementation(async () => {
    doc.dte_status = "SCHEMA_VALIDATED";
    return { ok: true };
  });
});

describe("Continuar DTE existente", () => {
  it("abrir solo lee el runtime scoped y no genera, firma ni transmite", async () => {
    const result = await getDteContinuationAction(request);
    expect(result).toMatchObject({
      ok: true,
      state: { id: "doc-1", status: "PENDING_GENERATION", controlNumber: "DTE-01-001" },
    });
    expect(h.context).toHaveBeenCalledWith(
      { id: "user-1" },
      { module: "fiscal.dte", write: false }
    );
    writes.forEach((action) => expect(action).not.toHaveBeenCalled());
    expect(h.dispose).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("json_document");
    expect(JSON.stringify(result)).not.toContain("signed_jws");
  });
  it.each(["01", "03", "05", "14"])(
    "tipo %s usa su generador habilitado y conserva el mismo DTE",
    async (type) => {
      doc.dte_type_code = type;
      const input =
        type === "14"
          ? { ...request, origin: "purchase" as const, originId: "purchase-1" }
          : request;
      if (type === "14")
        Object.assign(doc, {
          sale_id: null,
          purchase_id: "purchase-1",
          sale: null,
          purchase: { status: "CONFIRMED" },
        });
      const result = await runDteContinuationAction(input, "generate");
      expect(result).toMatchObject({
        ok: true,
        state: {
          id: "doc-1",
          controlNumber: "DTE-01-001",
          generationCode: "GEN-1",
          status: "SCHEMA_VALIDATED",
        },
      });
      const selected = { "01": h.fe, "03": h.ccf, "05": h.nc, "14": h.fse }[type]!;
      expect(selected).toHaveBeenCalledWith("doc-1");
      [h.fe, h.ccf, h.nc, h.fse]
        .filter((fn) => fn !== selected)
        .forEach((fn) => expect(fn).not.toHaveBeenCalled());
      expect(h.sign).not.toHaveBeenCalled();
      expect(h.transmit).not.toHaveBeenCalled();
    }
  );
  it("GENERATED valida sin volver a generar ni cambiar correlativo", async () => {
    doc.dte_status = "GENERATED";
    doc.json_document = {};
    expect((await runDteContinuationAction(request, "generate")).ok).toBe(true);
    expect(h.fe).not.toHaveBeenCalled();
    expect(h.validate).toHaveBeenCalledWith("doc-1");
  });
  it.each(["tenant_id", "location_id", "sale_id"])(
    "rechaza documento de otro scope/origen: %s",
    async (field) => {
      doc[field] = "different";
      expect((await runDteContinuationAction(request, "generate")).ok).toBe(false);
      writes.forEach((action) => expect(action).not.toHaveBeenCalled());
      expect(h.dispose).toHaveBeenCalledOnce();
    }
  );
  it("no usa el flujo de compras para un DTE de venta", async () => {
    expect((await getDteContinuationAction({ ...request, origin: "purchase" })).ok).toBe(false);
  });
  it("rechaza tipos no habilitados antes de mutar", async () => {
    doc.dte_type_code = "99";
    expect((await runDteContinuationAction(request, "generate")).ok).toBe(false);
    expect(h.fe).not.toHaveBeenCalled();
  });
  it.each(["ACCEPTED", "CANCELLED", "INVALIDATED", "SENT"])(
    "no genera ni firma un DTE %s",
    async (status) => {
      doc.dte_status = status;
      expect((await runDteContinuationAction(request, "generate")).ok).toBe(false);
      expect((await runDteContinuationAction(request, "sign")).ok).toBe(false);
      writes.forEach((action) => expect(action).not.toHaveBeenCalled());
    }
  );
  it("bloquea writes de un origen anulado", async () => {
    doc.sale = { status: "CANCELLED" };
    expect((await runDteContinuationAction(request, "generate")).ok).toBe(false);
    expect(h.fe).not.toHaveBeenCalled();
  });
  it("guard read-only bloquea antes de leer o delegar", async () => {
    h.context.mockRejectedValueOnce(
      new OperationalContextError("READ_ONLY" as never, "readonly", 403)
    );
    expect((await runDteContinuationAction(request, "generate")).ok).toBe(false);
    expect(h.find).not.toHaveBeenCalled();
    expect(h.fe).not.toHaveBeenCalled();
  });
  it("un rol LIVE sin permiso fiscal bloquea aunque la sesión previa fuera admin", async () => {
    h.context.mockResolvedValueOnce({
      context: {
        tenantId: "tenant-1",
        locationId: "loc-1",
        effectiveUser: { role: "reception" },
        client: db,
      },
      dispose: h.dispose,
    });
    expect((await runDteContinuationAction(request, "generate")).ok).toBe(false);
    expect(h.find).not.toHaveBeenCalled();
    expect(h.dispose).toHaveBeenCalledOnce();
  });
  it("validación legible y dispose incluso ante error", async () => {
    h.validate.mockResolvedValue({
      ok: false,
      error: "Schema inválido",
      validation_errors: [{ path: "/receptor", message: "Falta documento" }],
    });
    expect(await runDteContinuationAction(request, "generate")).toMatchObject({
      ok: false,
      error: "Schema inválido\n/receptor: Falta documento",
    });
    expect(h.dispose).toHaveBeenCalledOnce();
    expect(h.transmit).not.toHaveBeenCalled();
  });
  it("transmisión requiere confirmación y solo usa el ID persistido", async () => {
    doc.dte_status = "SIGNED";
    doc.signed_jws = "PRIVATE_JWS";
    expect((await runDteContinuationAction(request, "transmit")).ok).toBe(false);
    expect(h.transmit).not.toHaveBeenCalled();
    expect((await runDteContinuationAction(request, "transmit", true)).ok).toBe(true);
    expect(h.transmit).toHaveBeenCalledWith("doc-1");
  });
  it("entrega solo recibido con sello y confirmación explícita", async () => {
    doc.dte_status = "ACCEPTED";
    doc.reception_stamp = "STAMP";
    expect((await runDteContinuationAction(request, "deliver")).ok).toBe(false);
    expect((await runDteContinuationAction(request, "deliver", true)).ok).toBe(true);
    expect(h.deliver).toHaveBeenCalledWith("doc-1", { confirmed: true });
  });
  it("no repite una entrega externa exitosa", async () => {
    doc.dte_status = "ACCEPTED";
    doc.reception_stamp = "STAMP";
    h.log.mockImplementation(async ({ where }) =>
      where.operation_type === "EXTERNAL_DELIVERY" ? { id: "delivery-1" } : null
    );
    expect((await runDteContinuationAction(request, "deliver", true)).ok).toBe(false);
    expect(h.deliver).not.toHaveBeenCalled();
  });
  it("recupera únicamente rechazo 802 probado por log SEND", async () => {
    doc.dte_status = "REJECTED";
    expect((await runDteContinuationAction(request, "reopen")).ok).toBe(false);
    h.log.mockImplementation(async ({ where }) =>
      where.operation_type === "SEND" ? { response_body: { codigoMsg: "802" } } : null
    );
    expect((await runDteContinuationAction(request, "reopen")).ok).toBe(true);
    expect(h.reopen).toHaveBeenCalledWith("doc-1");
  });
});
