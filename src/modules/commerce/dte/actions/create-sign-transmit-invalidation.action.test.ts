// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-sign-transmit-invalidation.action.test.ts
//
// FASE VI-E6B — migrada a requireOperationalContext (mismo patrón que
// reconcile-dte-with-mh.action.ts / VI-E6A y transmit-dte-document.action.ts
// / VI-E5B). Garantías de la Server Action orquestadora de invalidación:
//   - guard admin (requireAdmin) siempre se invoca.
//   - módulo fiscal.dte deshabilitado -> denied, ningún paso se ejecuta.
//   - Support Session (READ_ONLY) -> denied ANTES de create/sign/transmit
//     — DTE_SUPPORT_INVALIDATION_BLOCKED.
//   - los tres pasos (create/sign/transmit) reciben SIEMPRE el mismo
//     context.client (runtime DB) — DTE_INVALIDATION_SAME_RUNTIME_DB.
//   - dispose() se invoca siempre, incluso en el camino feliz y en cada
//     bloqueo temprano.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "user-1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const {
  requireOperationalContextMock,
  disposeMock,
  FakeOperationalContextError,
  createInvalidationEventSpy,
  signInvalidationEventSpy,
  transmitInvalidationEventSpy,
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
    createInvalidationEventSpy: vi.fn(),
    signInvalidationEventSpy: vi.fn(),
    transmitInvalidationEventSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/create-invalidation-event.service", () => ({
  createInvalidationEvent: createInvalidationEventSpy,
}));
vi.mock("../services/sign-invalidation-event.service", () => ({
  signInvalidationEvent: signInvalidationEventSpy,
}));
vi.mock("../services/transmit-invalidation-event.service", () => ({
  transmitInvalidationEvent: transmitInvalidationEventSpy,
}));

import { createSignTransmitInvalidationAction } from "./create-sign-transmit-invalidation.action";
import { requireAdmin } from "@/lib/permissions/guards";

const RESPONSABLE = { nombre: "Juan Perez", tipoDocumento: "13", numeroDocumento: "12345678-9" };

const RAW_INPUT = {
  dteDocumentId: "11111111-1111-1111-1111-111111111111",
  invalidationTypeCode: "2" as const,
  reason: "Error de digitación",
  responsable: RESPONSABLE,
  solicita: RESPONSABLE,
};

function fakeHandle(overrides: Partial<{ client: unknown; tenantId: string; locationId: string | null }> = {}) {
  return {
    context: {
      effectiveUser: { id: "user-1", role: "super_admin" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: overrides.locationId === undefined ? "loc-1" : overrides.locationId,
      client: overrides.client ?? { __marker: "RUNTIME_CLIENT_DB" },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  createInvalidationEventSpy.mockReset();
  signInvalidationEventSpy.mockReset();
  transmitInvalidationEventSpy.mockReset();
  vi.mocked(requireAdmin).mockClear();
});

describe("createSignTransmitInvalidationAction — guards", () => {
  it("exige requireAdmin (se invoca siempre)", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    createInvalidationEventSpy.mockResolvedValue({ ok: true, invalidationEventId: "inv-1", dteDocumentId: "doc-1", status: "DRAFT", eventGenerationCode: "GEN-1" });
    signInvalidationEventSpy.mockResolvedValue({ ok: true, status: "SIGNED", signedAt: "2026-01-01T00:00:00.000Z" });
    transmitInvalidationEventSpy.mockResolvedValue({ ok: true, eventStatus: "ACCEPTED", mhEstado: "PROCESADO", descripcionMsg: null, selloRecibido: "SELLO-1", codigoMsg: null, observaciones: null });

    await createSignTransmitInvalidationAction(RAW_INPUT);

    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });

  it("fiscal.dte deshabilitado -> denied, ningún paso se ejecuta", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "El módulo fiscal.dte no está habilitado.", 403),
    );

    const result = await createSignTransmitInvalidationAction(RAW_INPUT);

    expect(result).toEqual({ ok: false, error: "El módulo fiscal.dte no está habilitado." });
    expect(createInvalidationEventSpy).not.toHaveBeenCalled();
    expect(signInvalidationEventSpy).not.toHaveBeenCalled();
    expect(transmitInvalidationEventSpy).not.toHaveBeenCalled();
  });

  it("Support Session (READ_ONLY) -> denied ANTES de crear/firmar/transmitir — DTE_SUPPORT_INVALIDATION_BLOCKED", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Operación no disponible en modo de solo lectura (Soporte).", 403),
    );

    const result = await createSignTransmitInvalidationAction(RAW_INPUT);

    expect(result.ok).toBe(false);
    expect(createInvalidationEventSpy).not.toHaveBeenCalled();
    expect(signInvalidationEventSpy).not.toHaveBeenCalled();
    expect(transmitInvalidationEventSpy).not.toHaveBeenCalled();
  });

  it("sin location activa -> denied, ningún paso se ejecuta, dispose() se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await createSignTransmitInvalidationAction(RAW_INPUT);

    expect(result).toEqual({ ok: false, error: "La sesión no tiene una location activa." });
    expect(createInvalidationEventSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("input inválido (UUID malformado) -> denied antes de crear, dispose() se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    const result = await createSignTransmitInvalidationAction({ ...RAW_INPUT, dteDocumentId: "not-a-uuid" });

    expect(result.ok).toBe(false);
    expect(createInvalidationEventSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("los tres pasos reciben SIEMPRE el mismo context.client (misma runtime DB) — DTE_INVALIDATION_SAME_RUNTIME_DB", async () => {
    const runtimeClient = { __marker: "RUNTIME_CLIENT_DB_XYZ" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeClient }));
    createInvalidationEventSpy.mockResolvedValue({ ok: true, invalidationEventId: "inv-1", dteDocumentId: "doc-1", status: "DRAFT", eventGenerationCode: "GEN-1" });
    signInvalidationEventSpy.mockResolvedValue({ ok: true, status: "SIGNED", signedAt: "2026-01-01T00:00:00.000Z" });
    transmitInvalidationEventSpy.mockResolvedValue({ ok: true, eventStatus: "ACCEPTED", mhEstado: "PROCESADO", descripcionMsg: null, selloRecibido: "SELLO-1", codigoMsg: null, observaciones: null });

    const result = await createSignTransmitInvalidationAction(RAW_INPUT);

    expect(result).toMatchObject({ ok: true, dteStatus: "INVALIDATED" });
    expect(createInvalidationEventSpy).toHaveBeenCalledWith(expect.anything(), runtimeClient);
    expect(signInvalidationEventSpy).toHaveBeenCalledWith(expect.anything(), runtimeClient);
    expect(transmitInvalidationEventSpy).toHaveBeenCalledWith(expect.anything(), runtimeClient);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("si crear falla, firmar y transmitir NUNCA se invocan (stepFailed: crear_evento)", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    createInvalidationEventSpy.mockResolvedValue({ ok: false, message: "Ya existe un evento activo." });

    const result = await createSignTransmitInvalidationAction(RAW_INPUT);

    expect(result).toMatchObject({ ok: false, stepFailed: "crear_evento" });
    expect(signInvalidationEventSpy).not.toHaveBeenCalled();
    expect(transmitInvalidationEventSpy).not.toHaveBeenCalled();
  });

  it("si firmar falla, transmitir NUNCA se invoca (stepFailed: firmar_evento)", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    createInvalidationEventSpy.mockResolvedValue({ ok: true, invalidationEventId: "inv-1", dteDocumentId: "doc-1", status: "DRAFT", eventGenerationCode: "GEN-1" });
    signInvalidationEventSpy.mockResolvedValue({ ok: false, error: "Firma rechazada." });

    const result = await createSignTransmitInvalidationAction(RAW_INPUT);

    expect(result).toMatchObject({ ok: false, stepFailed: "firmar_evento" });
    expect(transmitInvalidationEventSpy).not.toHaveBeenCalled();
  });

  it("MH RECHAZADO -> ok:true, eventStatus REJECTED, dteStatus vuelve a ACCEPTED", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    createInvalidationEventSpy.mockResolvedValue({ ok: true, invalidationEventId: "inv-1", dteDocumentId: "doc-1", status: "DRAFT", eventGenerationCode: "GEN-1" });
    signInvalidationEventSpy.mockResolvedValue({ ok: true, status: "SIGNED", signedAt: "2026-01-01T00:00:00.000Z" });
    transmitInvalidationEventSpy.mockResolvedValue({ ok: true, eventStatus: "REJECTED", mhEstado: "RECHAZADO", descripcionMsg: "Doc no encontrado", selloRecibido: null, codigoMsg: "003", observaciones: null });

    const result = await createSignTransmitInvalidationAction(RAW_INPUT);

    expect(result).toMatchObject({ ok: true, eventStatus: "REJECTED", dteStatus: "ACCEPTED" });
  });
});
