// ─────────────────────────────────────────────────────────────────
// client-portal — actions.test.ts
//
// FASE VI-D7: el Client Portal (`/portal/*`) era la superficie GYM con
// mayor gap de aislamiento runtime — ni lecturas ni escrituras pasaban
// por el contexto operacional runtime, así que un miembro real de un
// tenant hosteado podía terminar leyendo/escribiendo contra el Prisma
// global de la plataforma. Este test certifica que bookClassAction ahora
// resuelve requireOperationalContext({ write: true }) ANTES de tocar
// datos (bloqueo bajo Support Session / READ_ONLY) y que toda la
// resolución de datos pasa por context.client (nunca el prisma global).
//
// GYM-BOOKINGS 2B: reservar y cancelar exigen además module "gym.classes"
// y DELEGAN en GymBookingService (channel PORTAL). El alumno sale siempre
// de sessionUser.id y el actor lleva el rol LIVE.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidatePathMock } = vi.hoisted(() => ({ revalidatePathMock: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

vi.mock("@/lib/permissions/guards", () => ({
  requireClient: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "client" })),
}));

const {
  getClientByUserIdMock,
  bookingCreateSpy,
  bookingUpdateSpy,
  service,
  createServiceMock,
  requireOperationalContextMock,
  disposeMock,
  FakeOperationalContextError,
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
  const service = { bookSession: vi.fn(), cancelBooking: vi.fn(), cancelSession: vi.fn(), recordAttendance: vi.fn() };
  return {
    getClientByUserIdMock: vi.fn(async () => ({ id: "client-1", branch_id: "loc-1" }) as { id: string; branch_id: string } | null),
    bookingCreateSpy: vi.fn(),
    bookingUpdateSpy: vi.fn(),
    service,
    createServiceMock: vi.fn(() => service),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("./queries", () => ({
  getClientByUserId: getClientByUserIdMock,
}));

// LIVE-3: el envoltorio de identidad vigente delega en el mock de arriba; la identidad
// (usuario activo, tenant, rol y sede vigentes) se certifica con el contexto real en
// src/modules/classes/certification/live-*.integration.test.ts.
vi.mock("@/modules/platform/runtime/require-live-operational-context", async () => {
  const ctx = await import("@/modules/platform/runtime/require-operational-context");
  return { requireLiveOperationalContext: (...args: Parameters<typeof ctx.requireOperationalContext>) => ctx.requireOperationalContext(...args) };
});
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("@/modules/classes/booking/booking-service", () => ({
  createGymBookingService: createServiceMock,
  resolveIdempotencyKey: (raw: unknown) => (typeof raw === "string" && raw.length >= 8 ? raw : "server-generated-key"),
}));

import { bookClassAction, cancelBookingAction } from "./actions";

const CLASS_ID = "eeb1d1e1-e1c8-4958-9d16-db8129862c8e";
const BOOKING_ID = "5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const KEY = "4d3c2b1a-aaaa-bbbb-cccc-000000000001";

const runtimeClient = {
  clientMembership: { findFirst: vi.fn() },
  scheduledClass: { findFirst: vi.fn() },
  classBooking: { findUnique: vi.fn(), findFirst: vi.fn(), create: bookingCreateSpy, update: bookingUpdateSpy },
};

function fakeHandle(role = "client") {
  return {
    context: {
      effectiveUser: { id: "u1", role, location_id: "loc-1" },
      tenantId: "tenant-1",
      gymId: "gym-1",
      locationId: "loc-1",
      client: runtimeClient,
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getClientByUserIdMock.mockResolvedValue({ id: "client-1", branch_id: "loc-1" });
  requireOperationalContextMock.mockResolvedValue(fakeHandle());
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('bookClassAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("requireOperationalContext rechaza (READ_ONLY / Support Session) -> bloquea ANTES de tocar getClientByUserId/prisma", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    const result = await bookClassAction(undefined, fd({ class_id: CLASS_ID }));

    expect(result).toMatchObject({ error: expect.any(String) });
    expect(getClientByUserIdMock).not.toHaveBeenCalled();
    expect(createServiceMock).not.toHaveBeenCalled();
  });

  it("modo normal -> resuelve el perfil vía context.client y delega la reserva en GymBookingService (PORTAL)", async () => {
    service.bookSession.mockResolvedValue({ ok: true, value: { bookingId: "b1" }, operationId: "op", replayed: false });

    const result = await bookClassAction(undefined, fd({ class_id: CLASS_ID, idempotency_key: KEY }));

    expect(requireOperationalContextMock).toHaveBeenCalledWith(expect.anything(), { module: "gym.classes", write: true });
    // GYM-BOOKINGS 3B: el Client se resuelve además por el tenant del contexto.
    expect(getClientByUserIdMock).toHaveBeenCalledWith("u1", runtimeClient, { tenantId: "tenant-1", gymId: "gym-1" });
    expect(createServiceMock).toHaveBeenCalledWith(runtimeClient);
    expect(service.bookSession).toHaveBeenCalledWith({
      scope: { tenantId: "tenant-1", locationId: "loc-1" },
      actor: { userId: "u1", role: "client" },
      channel: "PORTAL",
      sessionId: CLASS_ID,
      clientId: "client-1",
      idempotencyKey: KEY,
    });
    expect(bookingCreateSpy).not.toHaveBeenCalled();
    expect(bookingUpdateSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });
});

describe("bookClassAction / cancelBookingAction — GYM-BOOKINGS 2B", () => {
  it("gym.classes deshabilitado → MODULE_DISABLED antes de tocar datos", async () => {
    requireOperationalContextMock.mockRejectedValue(new FakeOperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 402));
    expect(await bookClassAction(undefined, fd({ class_id: CLASS_ID }))).toEqual({ error: "Módulo no habilitado." });
    expect(await cancelBookingAction(undefined, fd({ booking_id: BOOKING_ID }))).toEqual({ error: "Módulo no habilitado." });
    expect(getClientByUserIdMock).not.toHaveBeenCalled();
  });

  it("rechazos del servicio con los textos heredados del portal", async () => {
    service.bookSession.mockResolvedValueOnce({ ok: false, code: "SESSION_FULL" });
    expect(await bookClassAction(undefined, fd({ class_id: CLASS_ID }))).toEqual({ error: "Esta clase ya no tiene cupo disponible." });
    service.bookSession.mockResolvedValueOnce({ ok: false, code: "NO_ELIGIBLE_MEMBERSHIP" });
    expect(await bookClassAction(undefined, fd({ class_id: CLASS_ID }))).toEqual({
      error: "No tienes una membresía activa vigente para reservar clases.",
    });
    service.bookSession.mockResolvedValueOnce({ ok: false, code: "SESSION_STARTED", message: "No puedes reservar una clase pasada." });
    expect(await bookClassAction(undefined, fd({ class_id: CLASS_ID }))).toEqual({ error: "No puedes reservar una clase pasada." });
  });

  it("sin perfil vinculado, o cuenta cuyo rol LIVE ya no es client → error sin llamar al servicio", async () => {
    getClientByUserIdMock.mockResolvedValueOnce(null);
    expect(await bookClassAction(undefined, fd({ class_id: CLASS_ID }))).toEqual({ error: "No tienes un perfil de cliente vinculado." });
    requireOperationalContextMock.mockResolvedValueOnce(fakeHandle("reception"));
    expect(await bookClassAction(undefined, fd({ class_id: CLASS_ID }))).toEqual({ error: "No tienes un perfil de cliente vinculado." });
    expect(service.bookSession).not.toHaveBeenCalled();
  });

  it("cancelBookingAction delega (PORTAL) con la clave del formulario y nunca escribe directo", async () => {
    service.cancelBooking.mockResolvedValue({ ok: true, value: { bookingId: BOOKING_ID }, operationId: "op", replayed: false });
    const result = await cancelBookingAction(undefined, fd({ booking_id: BOOKING_ID, idempotency_key: KEY }));
    expect(service.cancelBooking).toHaveBeenCalledWith({
      scope: { tenantId: "tenant-1", locationId: "loc-1" },
      actor: { userId: "u1", role: "client" },
      channel: "PORTAL",
      bookingId: BOOKING_ID,
      idempotencyKey: KEY,
    });
    expect(bookingUpdateSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("cancelBookingAction: ventana cerrada y reserva ajena se informan sin filtrar detalles", async () => {
    service.cancelBooking.mockResolvedValueOnce({ ok: false, code: "CANCEL_WINDOW_CLOSED", message: "No puedes cancelar una reserva de clase pasada." });
    expect(await cancelBookingAction(undefined, fd({ booking_id: BOOKING_ID }))).toEqual({ error: "No puedes cancelar una reserva de clase pasada." });
    service.cancelBooking.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "Reserva no encontrada." });
    expect(await cancelBookingAction(undefined, fd({ booking_id: BOOKING_ID }))).toEqual({ error: "Clase o reserva no encontrada." });
    expect(service.cancelBooking.mock.calls[0][0].idempotencyKey).toBe("server-generated-key");
  });

  it("validación de formulario intacta", async () => {
    expect(await bookClassAction(undefined, fd({ class_id: "x" }))).toEqual({ error: "ID de clase inválido" });
    expect(service.bookSession).not.toHaveBeenCalled();
  });
});

describe("bookClassAction / cancelBookingAction — GYM-BOOKINGS 3B", () => {
  it("el perfil se resuelve con el tenant del contexto, nunca con datos del formulario", async () => {
    service.cancelBooking.mockResolvedValue({ ok: true, value: { bookingId: BOOKING_ID }, operationId: "op", replayed: false });
    await cancelBookingAction(undefined, fd({ booking_id: BOOKING_ID, idempotency_key: KEY, client_id: "otro", tenant_id: "otro" }));
    expect(getClientByUserIdMock).toHaveBeenCalledWith("u1", runtimeClient, { tenantId: "tenant-1", gymId: "gym-1" });
    expect(service.cancelBooking.mock.calls[0][0].scope).toEqual({ tenantId: "tenant-1", locationId: "loc-1" });
  });

  it("tras reservar o cancelar se revalidan calendario, historial e inicio; un rechazo no revalida", async () => {
    service.bookSession.mockResolvedValueOnce({ ok: true, value: { bookingId: "b1" }, operationId: "op", replayed: false });
    await bookClassAction(undefined, fd({ class_id: CLASS_ID, idempotency_key: KEY }));
    expect(revalidatePathMock.mock.calls.map((c) => c[0]).sort()).toEqual(["/portal", "/portal/clases", "/portal/historial"]);
    revalidatePathMock.mockClear();
    service.bookSession.mockResolvedValueOnce({ ok: false, code: "SESSION_FULL" });
    await bookClassAction(undefined, fd({ class_id: CLASS_ID, idempotency_key: KEY }));
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
