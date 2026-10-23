// ─────────────────────────────────────────────────────────────────
// classes — actions.bookings.test.ts
//
// GYM-BOOKINGS 2B: las acciones del staff (reservar, cancelar reserva,
// asistencia, cancelar sesión) DELEGAN en GymBookingService. Certifica:
//  - module "gym.classes" + write antes de tocar datos;
//  - scope (tenant/location) y rol LIVE desde el OperationalContext;
//  - clave de idempotencia del formulario hasta el servicio;
//  - ninguna escritura directa de class_bookings / class_attendance;
//  - errores del servicio traducidos (sin códigos ni errores de BD);
//  - ruta OPEN heredada de la cancelación de sesión intacta.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidatePathMock, redirectMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "branch_admin" })),
  requireMembershipManager: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "reception" })),
  canManageClass: vi.fn(() => true),
}));

vi.mock("@/modules/trainers/availability-validator", () => ({
  validateClassWithinTrainerAvailability: vi.fn(async () => ({ valid: true })),
}));

const { service, createServiceMock, loadPolicyMock, requireOperationalContextMock, disposeMock, FakeOperationalContextError } = vi.hoisted(() => {
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
  const service = {
    bookSession: vi.fn(),
    cancelBooking: vi.fn(),
    cancelSession: vi.fn(),
    recordAttendance: vi.fn(),
  };
  return {
    service,
    createServiceMock: vi.fn(() => service),
    loadPolicyMock: vi.fn(),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("./booking/booking-service", () => ({
  createGymBookingService: createServiceMock,
  loadGymBookingPolicy: loadPolicyMock,
  resolveIdempotencyKey: (raw: unknown) => (typeof raw === "string" && raw.length >= 8 ? raw : "server-generated-key"),
}));

import {
  cancelBookingAction,
  createBookingAction,
  recordAttendanceAction,
  toggleScheduledClassStatusAction,
  updateScheduledClassAction,
} from "./actions";

const SES = "eeb1d1e1-e1c8-4958-9d16-db8129862c8e";
const CLI = "0b7c8a3e-36a9-4c8e-9d61-3f8a2b1c4d5e";
const KEY = "4d3c2b1a-aaaa-bbbb-cccc-000000000001";

let liveUser = { status: "active", tenant_id: "tenant-1", role: "reception", branch_id: "loc-1" as string | null };

const db: Record<string, unknown> & {
  classBooking: Record<string, ReturnType<typeof vi.fn>>;
  classAttendance: Record<string, ReturnType<typeof vi.fn>>;
  scheduledClass: Record<string, ReturnType<typeof vi.fn>>;
  trainer: Record<string, ReturnType<typeof vi.fn>>;
  branch: Record<string, ReturnType<typeof vi.fn>>;
  classType: Record<string, ReturnType<typeof vi.fn>>;
  trainerTimeOff: Record<string, ReturnType<typeof vi.fn>>;
} = {
  classBooking: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), count: vi.fn(async () => 0) },
  classAttendance: { upsert: vi.fn(), create: vi.fn(), update: vi.fn() },
  scheduledClass: { findFirst: vi.fn(), update: vi.fn() },
  trainer: { findFirst: vi.fn() },
  // GYM-BOOKINGS 3A: referencias del tenant y ausencias del entrenador.
  branch: { findFirst: vi.fn(async () => ({ id: "loc-1" })) },
  classType: { findFirst: vi.fn(async () => ({ capacity_default: null })) },
  trainerTimeOff: { findMany: vi.fn(async () => []) },
  // LIVE-2: identidad vigente del usuario, coherente con handle() (la discrepancia
  // se certifica con el contexto real en certification/live-identity.integration.test.ts).
  user: { findUnique: vi.fn(async () => liveUser) },
  // H03: alta/edición de clases en transacción con lock del entrenador (la
  // concurrencia real se certifica en actions.scheduling.integration.test.ts).
  $queryRaw: vi.fn(async () => []),
};
db.$transaction = vi.fn(async (fn: (tx: typeof db) => unknown) => fn(db));

function handle(role = "reception", locationId: string | null = "loc-1") {
  liveUser = { status: "active", tenant_id: "tenant-1", role, branch_id: locationId };
  return {
    context: {
      effectiveUser: { id: "u1", role, location_id: locationId },
      tenantId: "tenant-1",
      locationId,
      client: db,
    },
    dispose: disposeMock,
  };
}

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const okResult = (value: unknown) => ({ ok: true, value, operationId: "op-1", replayed: false });

beforeEach(() => {
  vi.clearAllMocks();
  requireOperationalContextMock.mockResolvedValue(handle());
});

function expectNoDirectBookingWrites() {
  expect(db.classBooking.create).not.toHaveBeenCalled();
  expect(db.classBooking.update).not.toHaveBeenCalled();
  expect(db.classBooking.upsert).not.toHaveBeenCalled();
  expect(db.classAttendance.upsert).not.toHaveBeenCalled();
  expect(db.classAttendance.create).not.toHaveBeenCalled();
  expect(db.classAttendance.update).not.toHaveBeenCalled();
}

describe("createBookingAction → GymBookingService.bookSession", () => {
  it("exige gym.classes + write y delega con scope, rol LIVE, canal STAFF y la clave del formulario", async () => {
    service.bookSession.mockResolvedValue(okResult({ bookingId: "b1", sessionId: SES }));
    const r = await createBookingAction(undefined, fd({ scheduled_class_id: SES, client_id: CLI, idempotency_key: KEY }));
    expect(r).toBeUndefined();
    expect(requireOperationalContextMock).toHaveBeenCalledWith(expect.anything(), { module: "gym.classes", write: true });
    expect(createServiceMock).toHaveBeenCalledWith(db);
    expect(service.bookSession).toHaveBeenCalledWith({
      scope: { tenantId: "tenant-1", locationId: "loc-1" },
      actor: { userId: "u1", role: "reception" },
      channel: "STAFF",
      sessionId: SES,
      clientId: CLI,
      idempotencyKey: KEY,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/dashboard/classes/${SES}`);
    expectNoDirectBookingWrites();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("traduce el rechazo del servicio a un mensaje (sin código) y no revalida", async () => {
    service.bookSession.mockResolvedValue({ ok: false, code: "SESSION_FULL" });
    const r = await createBookingAction(undefined, fd({ scheduled_class_id: SES, client_id: CLI }));
    expect(r).toEqual({ error: "No hay cupo disponible en esta clase." });
    expect(service.bookSession.mock.calls[0][0].idempotencyKey).toBe("server-generated-key");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("bloquea antes de tocar datos si el contexto rechaza (READ_ONLY / MODULE_DISABLED)", async () => {
    requireOperationalContextMock.mockRejectedValue(new FakeOperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 402));
    const r = await createBookingAction(undefined, fd({ scheduled_class_id: SES, client_id: CLI }));
    expect(r).toEqual({ error: "Módulo no habilitado." });
    expect(createServiceMock).not.toHaveBeenCalled();
  });

  it("rol LIVE ajeno a reservas → error sin llamar al servicio", async () => {
    requireOperationalContextMock.mockResolvedValue(handle("auditor"));
    const r = await createBookingAction(undefined, fd({ scheduled_class_id: SES, client_id: CLI }));
    expect(r).toEqual({ error: "Sin permiso para gestionar esta clase." });
    expect(service.bookSession).not.toHaveBeenCalled();
  });

  it("validación de formulario intacta (errores por campo)", async () => {
    const r = await createBookingAction(undefined, fd({ scheduled_class_id: SES, client_id: "x" }));
    expect(r).toMatchObject({ errors: { client_id: expect.any(Array) } });
    expect(service.bookSession).not.toHaveBeenCalled();
  });
});

describe("cancelBookingAction → GymBookingService.cancelBooking", () => {
  it("delega con motivo y clave; éxito → revalida y vuelve al detalle limpio", async () => {
    service.cancelBooking.mockResolvedValue(okResult({ bookingId: "b1", sessionId: SES }));
    await cancelBookingAction(fd({ booking_id: "b1", scheduled_class_id: SES, reason: " lesión ", idempotency_key: KEY }));
    expect(service.cancelBooking).toHaveBeenCalledWith({
      scope: { tenantId: "tenant-1", locationId: "loc-1" },
      actor: { userId: "u1", role: "reception" },
      channel: "STAFF",
      bookingId: "b1",
      reason: "lesión",
      idempotencyKey: KEY,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/dashboard/classes/${SES}`);
    expect(redirectMock).toHaveBeenCalledWith(`/dashboard/classes/${SES}`);
    expectNoDirectBookingWrites();
  });

  it("rechazo → vuelve al detalle con ?error= (antes se descartaba en silencio)", async () => {
    service.cancelBooking.mockResolvedValue({ ok: false, code: "REASON_REQUIRED" });
    await cancelBookingAction(fd({ booking_id: "b1", scheduled_class_id: SES }));
    expect(service.cancelBooking.mock.calls[0][0].reason).toBeUndefined();
    expect(redirectMock).toHaveBeenCalledWith(`/dashboard/classes/${SES}?error=${encodeURIComponent("Indica el motivo de la cancelación.")}`);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("recordAttendanceAction → GymBookingService.recordAttendance", () => {
  it("resuelve la reserva del tenant efectivo y delega; sin campo notes no sobrescribe la nota", async () => {
    db.classBooking.findFirst.mockResolvedValue({ id: "b1" });
    service.recordAttendance.mockResolvedValue(okResult({ attendanceId: "a1" }));
    await recordAttendanceAction(fd({ scheduled_class_id: SES, client_id: CLI, attendance_status: "attended", idempotency_key: KEY }));
    expect(db.classBooking.findFirst).toHaveBeenCalledWith({
      where: { scheduled_class_id: SES, client_id: CLI, tenant_id: "tenant-1" },
      select: { id: true },
    });
    expect(service.recordAttendance).toHaveBeenCalledWith({
      scope: { tenantId: "tenant-1", locationId: "loc-1" },
      actor: { userId: "u1", role: "reception" },
      channel: "STAFF",
      bookingId: "b1",
      status: "attended",
      notes: undefined,
      idempotencyKey: KEY,
    });
    expect(redirectMock).toHaveBeenCalledWith(`/dashboard/classes/${SES}`);
    expectNoDirectBookingWrites();
  });

  it("sin reserva o con estado 'cancelled' → error en el detalle, sin llamar al servicio", async () => {
    db.classBooking.findFirst.mockResolvedValue(null);
    await recordAttendanceAction(fd({ scheduled_class_id: SES, client_id: CLI, attendance_status: "absent" }));
    expect(redirectMock).toHaveBeenLastCalledWith(expect.stringContaining("?error="));
    db.classBooking.findFirst.mockResolvedValue({ id: "b1" });
    await recordAttendanceAction(fd({ scheduled_class_id: SES, client_id: CLI, attendance_status: "cancelled" }));
    expect(service.recordAttendance).not.toHaveBeenCalled();
    expectNoDirectBookingWrites();
  });

  it("ventana cerrada → mensaje del servicio en el detalle", async () => {
    db.classBooking.findFirst.mockResolvedValue({ id: "b1" });
    service.recordAttendance.mockResolvedValue({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
    await recordAttendanceAction(fd({ scheduled_class_id: SES, client_id: CLI, attendance_status: "late" }));
    expect(redirectMock).toHaveBeenCalledWith(
      `/dashboard/classes/${SES}?error=${encodeURIComponent("Cerró el plazo para registrar o editar la asistencia.")}`
    );
  });
});

describe("toggleScheduledClassStatusAction — cancelación de sesión", () => {
  const policy = (applyToOpen: boolean) => ({ applyPolicyToOpen: applyToOpen });

  beforeEach(() => {
    requireOperationalContextMock.mockResolvedValue(handle("branch_admin"));
  });

  it("OPEN heredado (apply_policy_to_open = false): solo cambia el estado, las reservas no se tocan", async () => {
    db.scheduledClass.findFirst.mockResolvedValue({ id: SES, status: "scheduled", session_kind: "OPEN", branch_id: "loc-1" });
    loadPolicyMock.mockResolvedValue(policy(false));
    await toggleScheduledClassStatusAction(fd({ id: SES }));
    expect(service.cancelSession).not.toHaveBeenCalled();
    expect(db.scheduledClass.update).toHaveBeenCalledWith({
      where: { id: SES },
      data: expect.objectContaining({ status: "cancelled", cancelled_by_user_id: "u1" }),
    });
  });

  it("GROUP / PERSONALIZED (o OPEN con política): delega en cancelSession, que libera cupos y sesiones", async () => {
    db.scheduledClass.findFirst.mockResolvedValue({ id: SES, status: "scheduled", session_kind: "GROUP", branch_id: "loc-1" });
    loadPolicyMock.mockResolvedValue(policy(false));
    service.cancelSession.mockResolvedValue(okResult({ released: [] }));
    await toggleScheduledClassStatusAction(fd({ id: SES, idempotency_key: KEY }));
    expect(service.cancelSession).toHaveBeenCalledWith({
      scope: { tenantId: "tenant-1", locationId: "loc-1" },
      actor: { userId: "u1", role: "branch_admin" },
      sessionId: SES,
      reason: "Sesión cancelada desde la agenda.",
      idempotencyKey: KEY,
    });
    expect(db.scheduledClass.update).not.toHaveBeenCalled();

    db.scheduledClass.findFirst.mockResolvedValue({ id: SES, status: "scheduled", session_kind: "OPEN", branch_id: "loc-1" });
    loadPolicyMock.mockResolvedValue(policy(true));
    await toggleScheduledClassStatusAction(fd({ id: SES, cancel_reason: "Lluvia" }));
    expect(service.cancelSession).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "Lluvia" }));
  });

  it("reactivar una sesión cancelada: estado scheduled y limpia los datos de cancelación", async () => {
    db.scheduledClass.findFirst.mockResolvedValue({ id: SES, status: "cancelled", session_kind: "GROUP", branch_id: "loc-1" });
    await toggleScheduledClassStatusAction(fd({ id: SES }));
    expect(db.scheduledClass.update).toHaveBeenCalledWith({
      where: { id: SES },
      data: { status: "scheduled", cancelled_at: null, cancelled_by_user_id: null, cancel_reason: null },
    });
    expect(service.cancelSession).not.toHaveBeenCalled();
  });
});

describe("updateScheduledClassAction — cupo frente a reservas confirmadas (I5)", () => {
  const form = (capacity: string) =>
    fd({
      id: SES,
      branch_id: "9b2f6c1e-1111-4a2b-8c3d-000000000001",
      class_type_id: "9b2f6c1e-1111-4a2b-8c3d-000000000002",
      trainer_id: "9b2f6c1e-1111-4a2b-8c3d-000000000003",
      title: "Funcional",
      class_date: "2026-10-25",
      start_time: "07:00",
      end_time: "08:00",
      capacity,
    });

  // GYM-BOOKINGS 3A: el BA solo edita dentro de su sucursal (la del formulario).
  const BRANCH = "9b2f6c1e-1111-4a2b-8c3d-000000000001";

  beforeEach(() => {
    requireOperationalContextMock.mockResolvedValue(handle("branch_admin", BRANCH));
    db.trainer.findFirst.mockResolvedValue({ id: "t", branch_id: BRANCH, status: "active", personalized_capacity: null });
    db.scheduledClass.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      "trainer_id" in args.where
        ? null // sin solapamiento
        : {
            id: SES,
            branch_id: BRANCH,
            session_kind: "OPEN",
            series_id: null,
            status: "scheduled",
            trainer_id: "9b2f6c1e-1111-4a2b-8c3d-000000000003",
            booked_count: 4,
            class_date: new Date("2026-10-25T00:00:00.000Z"),
            start_time: "07:00",
            end_time: "08:00",
          }
    );
  });

  it("rechaza bajar el cupo por debajo de las reservas confirmadas", async () => {
    const r = await updateScheduledClassAction(undefined, form("3"));
    expect(r).toEqual({ errors: { capacity: ["La capacidad no puede ser menor que las reservas confirmadas (4)."] } });
    expect(db.scheduledClass.update).not.toHaveBeenCalled();
  });

  it("valida y escribe dentro de una transacción READ COMMITTED que bloquea antes al entrenador (H03)", async () => {
    db.scheduledClass.update.mockResolvedValue({});
    await updateScheduledClassAction(undefined, form("6"));
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "ReadCommitted" }));
    const firstLock = String((db.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(firstLock).toMatch(/FROM "trainers"[\s\S]*FOR UPDATE/);
  });

  it("si una reserva entra en paralelo, el CHECK de BD se traduce al mismo error", async () => {
    db.scheduledClass.update.mockRejectedValue(new Error('new row violates check constraint "scheduled_classes_booked_count_capacity_chk"'));
    const r = await updateScheduledClassAction(undefined, form("4"));
    expect(r).toMatchObject({ errors: { capacity: expect.any(Array) } });
  });

  it("cupo válido y mismo horario: actualiza sin anular starts_at/ends_at", async () => {
    db.scheduledClass.update.mockResolvedValue({});
    await updateScheduledClassAction(undefined, form("6"));
    const data = db.scheduledClass.update.mock.calls[0][0].data;
    expect(data.capacity).toBe(6);
    expect("starts_at" in data).toBe(false);
  });

  it("3A · BA no puede mover la clase a otra sucursal", async () => {
    requireOperationalContextMock.mockResolvedValue(handle("branch_admin", "loc-1"));
    const r = await updateScheduledClassAction(undefined, form("6"));
    expect(r).toEqual({ error: "Solo puedes programar clases en tu propia sucursal." });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("3A · formulario heredado sin session_kind conserva OPEN e is_personalized", async () => {
    db.scheduledClass.update.mockResolvedValue({});
    const f = form("6");
    f.set("is_personalized", "on");
    await updateScheduledClassAction(undefined, f);
    expect(db.scheduledClass.update.mock.calls[0][0].data).toMatchObject({ session_kind: "OPEN", is_personalized: true });
  });

  it("si cambia la hora, anula los instantes para que el motor los derive de nuevo", async () => {
    db.scheduledClass.update.mockResolvedValue({});
    const f = form("6");
    f.set("start_time", "06:30");
    await updateScheduledClassAction(undefined, f);
    expect(db.scheduledClass.update.mock.calls[0][0].data).toMatchObject({ starts_at: null, ends_at: null });
  });
});
