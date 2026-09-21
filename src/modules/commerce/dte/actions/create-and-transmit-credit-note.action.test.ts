// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-and-transmit-credit-note.action.test.ts
//
// FASE VI-E4B — migra el orquestador a requireOperationalContext.
// FASE VI-E5A — signDteDocument también recibe context.client.
// FASE VI-E5B — transmitDteDocument ya es runtime-aware y también
// recibe context.client — el flujo combinado ya no se detiene después
// de firmar. Certifica:
//   - Support Session (READ_ONLY) bloquea ANTES de crear/generar/
//     validar/firmar/transmitir (ningún paso se invoca).
//   - PLATFORM_NATIVE: create/generate/validate/sign/transmit reciben
//     context.client (comportamiento externo intacto, alcanza ACCEPTED).
//   - RUNTIME_CLIENT: create/generate/validate/sign/transmit reciben
//     context.client — el flujo llega hasta la transmisión igual que
//     PLATFORM_NATIVE.
//   - Si un paso intermedio falla, los pasos siguientes NUNCA se invocan.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const {
  requireOperationalContextMock,
  disposeMock,
  FakeOperationalContextError,
  createCreditNoteSpy,
  generateNcJsonSpy,
  validateDteJsonSchemaSpy,
  signDteDocumentSpy,
  transmitDteDocumentSpy,
} = vi.hoisted(() => {
  class FakeOperationalContextError extends Error {
    code: string;
    httpStatus: number;
    userMessage: string;
    constructor(code: string, userMessage: string, httpStatus: number) {
      super(userMessage);
      this.code = code;
      this.httpStatus = httpStatus;
      this.userMessage = userMessage;
    }
  }
  return {
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
    createCreditNoteSpy: vi.fn(),
    generateNcJsonSpy: vi.fn(),
    validateDteJsonSchemaSpy: vi.fn(),
    signDteDocumentSpy: vi.fn(),
    transmitDteDocumentSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/create-credit-note-dte.service", () => ({
  createCreditNoteDteFromAcceptedCcfe: createCreditNoteSpy,
}));
vi.mock("../services/generate-nc-json.service", () => ({
  generateNcJsonForDte: generateNcJsonSpy,
}));
vi.mock("../services/validate-dte-json-schema.service", () => ({
  validateDteJsonSchema: validateDteJsonSchemaSpy,
}));
vi.mock("../services/sign-dte-document.service", () => ({
  signDteDocument: signDteDocumentSpy,
}));
vi.mock("../services/transmit-dte-document.service", () => ({
  transmitDteDocument: transmitDteDocumentSpy,
}));

import { createAndTransmitCreditNoteAction } from "./create-and-transmit-credit-note.action";

function fakeHandle(
  overrides: Partial<{ client: unknown; tenantId: string; locationId: string | null; authScope: "PLATFORM" | "RUNTIME_CLIENT" }> = {},
) {
  return {
    context: {
      effectiveUser: { id: "u1", role: "super_admin" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: overrides.locationId === undefined ? "loc-1" : overrides.locationId,
      client: overrides.client ?? { __marker: "RUNTIME_CLIENT_DB" },
      authScope: overrides.authScope ?? "PLATFORM",
    },
    dispose: disposeMock,
  };
}

const VALID_INPUT = {
  sourceDteDocumentId: "11111111-1111-1111-1111-111111111111",
  reasonText: "Devolución de mercadería",
};

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  createCreditNoteSpy.mockReset();
  generateNcJsonSpy.mockReset();
  validateDteJsonSchemaSpy.mockReset();
  signDteDocumentSpy.mockReset();
  transmitDteDocumentSpy.mockReset();
});

describe("createAndTransmitCreditNoteAction — FASE VI-E4B", () => {
  it("Support Session (READ_ONLY) bloquea -> ningún paso del pipeline se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await createAndTransmitCreditNoteAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: false, error: "Modo runtime read-only activo." });
    expect(createCreditNoteSpy).not.toHaveBeenCalled();
    expect(generateNcJsonSpy).not.toHaveBeenCalled();
    expect(validateDteJsonSchemaSpy).not.toHaveBeenCalled();
    expect(signDteDocumentSpy).not.toHaveBeenCalled();
    expect(transmitDteDocumentSpy).not.toHaveBeenCalled();
  });

  it("PLATFORM_NATIVE -> create/generate/validate/sign reciben context.client; transmit corre igual que antes", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker, authScope: "PLATFORM" }));

    createCreditNoteSpy.mockResolvedValue({
      ok: true,
      creditNoteDteId: "nc-1",
      controlNumber: "DTE-05-C001P001-000000000000001",
      generationCode: "GEN-NC-1",
      dteStatus: "PENDING_GENERATION",
    });
    generateNcJsonSpy.mockResolvedValue({
      ok: true,
      dteStatus: "GENERATED",
      dteDocumentId: "nc-1",
      controlNumber: "DTE-05-C001P001-000000000000001",
      generationCode: "GEN-NC-1",
    });
    validateDteJsonSchemaSpy.mockResolvedValue({ ok: true });
    signDteDocumentSpy.mockResolvedValue({ ok: true });
    transmitDteDocumentSpy.mockResolvedValue({
      ok: true,
      dteStatus: "ACCEPTED",
      selloRecibido: "SELLO-1",
      descripcionMsg: "Procesado",
    });

    const result = await createAndTransmitCreditNoteAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: true, creditNoteDteId: "nc-1", finalStatus: "ACCEPTED" });

    expect(createCreditNoteSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", locationId: "loc-1", userId: "u1" }),
      runtimeDbMarker,
    );
    expect(generateNcJsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dteDocumentId: "nc-1", tenantId: "tenant-1", locationId: "loc-1" }),
      runtimeDbMarker,
    );
    expect(validateDteJsonSchemaSpy).toHaveBeenCalledWith("nc-1", "tenant-1", "loc-1", "u1", runtimeDbMarker);

    // VI-E5A — sign ahora también recibe context.client (runtime DB).
    expect(signDteDocumentSpy).toHaveBeenCalledWith(
      { dteDocumentId: "nc-1", userId: "u1", tenantId: "tenant-1", locationId: "loc-1" },
      runtimeDbMarker,
    );
    // VI-E5B — transmit ahora también recibe context.client (runtime DB).
    expect(transmitDteDocumentSpy).toHaveBeenCalledWith(
      { dteDocumentId: "nc-1", userId: "u1", tenantId: "tenant-1", locationId: "loc-1" },
      runtimeDbMarker,
    );

    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("RUNTIME_CLIENT -> sign y transmit reciben context.client, flujo completo hasta ACCEPTED", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker, authScope: "RUNTIME_CLIENT" }));

    createCreditNoteSpy.mockResolvedValue({
      ok: true,
      creditNoteDteId: "nc-1",
      controlNumber: "DTE-05-C001P001-000000000000001",
      generationCode: "GEN-NC-1",
      dteStatus: "PENDING_GENERATION",
    });
    generateNcJsonSpy.mockResolvedValue({
      ok: true,
      dteStatus: "GENERATED",
      dteDocumentId: "nc-1",
      controlNumber: "DTE-05-C001P001-000000000000001",
      generationCode: "GEN-NC-1",
    });
    validateDteJsonSchemaSpy.mockResolvedValue({ ok: true });
    signDteDocumentSpy.mockResolvedValue({ ok: true, dteStatus: "SIGNED", signedAt: "2026-01-01T00:00:00.000Z" });
    transmitDteDocumentSpy.mockResolvedValue({
      ok: true,
      dteStatus: "ACCEPTED",
      selloRecibido: "SELLO-1",
      descripcionMsg: "Procesado",
    });

    const result = await createAndTransmitCreditNoteAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: true, creditNoteDteId: "nc-1", finalStatus: "ACCEPTED" });
    expect(signDteDocumentSpy).toHaveBeenCalledWith(
      { dteDocumentId: "nc-1", userId: "u1", tenantId: "tenant-1", locationId: "loc-1" },
      runtimeDbMarker,
    );
    expect(transmitDteDocumentSpy).toHaveBeenCalledWith(
      { dteDocumentId: "nc-1", userId: "u1", tenantId: "tenant-1", locationId: "loc-1" },
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("falla en crear_nc -> generate/validate/sign/transmit NUNCA se invocan", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    createCreditNoteSpy.mockResolvedValue({ ok: false, message: "Ya existe una NC activa." });

    const result = await createAndTransmitCreditNoteAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: false, stepFailed: "crear_nc" });
    expect(generateNcJsonSpy).not.toHaveBeenCalled();
    expect(validateDteJsonSchemaSpy).not.toHaveBeenCalled();
    expect(signDteDocumentSpy).not.toHaveBeenCalled();
    expect(transmitDteDocumentSpy).not.toHaveBeenCalled();
  });

  it("falla en validar_schema -> sign/transmit NUNCA se invocan", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    createCreditNoteSpy.mockResolvedValue({
      ok: true, creditNoteDteId: "nc-1", controlNumber: "cn", generationCode: "gc", dteStatus: "PENDING_GENERATION",
    });
    generateNcJsonSpy.mockResolvedValue({
      ok: true, dteStatus: "GENERATED", dteDocumentId: "nc-1", controlNumber: "cn", generationCode: "gc",
    });
    validateDteJsonSchemaSpy.mockResolvedValue({ ok: false, error: "Schema inválido." });

    const result = await createAndTransmitCreditNoteAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: false, stepFailed: "validar_schema" });
    expect(signDteDocumentSpy).not.toHaveBeenCalled();
    expect(transmitDteDocumentSpy).not.toHaveBeenCalled();
  });

  it("sin location activa -> error explícito, ningún paso se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await createAndTransmitCreditNoteAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: false });
    expect(createCreditNoteSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
