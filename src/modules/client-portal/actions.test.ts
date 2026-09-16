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
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireClient: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "client" })),
}));

const {
  getClientByUserIdMock,
  membershipFindFirstSpy,
  classFindFirstSpy,
  bookingFindUniqueSpy,
  bookingCreateSpy,
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
  return {
    getClientByUserIdMock: vi.fn(async () => ({ id: "client-1", branch_id: "loc-1" })),
    membershipFindFirstSpy: vi.fn(async () => ({ id: "membership-1" })),
    classFindFirstSpy: vi.fn(async () => ({
      id: "eeb1d1e1-e1c8-4958-9d16-db8129862c8e",
      capacity: 10,
      class_date: new Date(Date.now() + 86400000),
      bookings: [],
    })),
    bookingFindUniqueSpy: vi.fn(async () => null),
    bookingCreateSpy: vi.fn(async () => ({ id: "booking-1" })),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("./queries", () => ({
  getClientByUserId: getClientByUserIdMock,
}));

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { bookClassAction } from "./actions";

function fakeHandle() {
  return {
    context: {
      effectiveUser: { id: "u1", role: "client", location_id: "loc-1" },
      tenantId: "tenant-1",
      locationId: "loc-1",
      client: {
        clientMembership: { findFirst: membershipFindFirstSpy },
        scheduledClass: { findFirst: classFindFirstSpy },
        classBooking: { findUnique: bookingFindUniqueSpy, create: bookingCreateSpy },
      },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  getClientByUserIdMock.mockClear();
  membershipFindFirstSpy.mockClear();
  classFindFirstSpy.mockClear();
  bookingFindUniqueSpy.mockClear();
  bookingCreateSpy.mockClear();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
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

    const result = await bookClassAction(undefined, fd({ class_id: "eeb1d1e1-e1c8-4958-9d16-db8129862c8e" }));

    expect(result).toMatchObject({ error: expect.any(String) });
    expect(getClientByUserIdMock).not.toHaveBeenCalled();
    expect(bookingCreateSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> resuelve el perfil y crea la reserva a través de context.client (runtime-aware)", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    const result = await bookClassAction(undefined, fd({ class_id: "eeb1d1e1-e1c8-4958-9d16-db8129862c8e" }));

    expect(getClientByUserIdMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ clientMembership: expect.anything() }),
    );
    expect(bookingCreateSpy).toHaveBeenCalledTimes(1);
    expect(disposeMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });
});
