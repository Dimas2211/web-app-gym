// ─────────────────────────────────────────────────────────────────
// classes — trainer-actions.test.ts
//
// GYM-4: las acciones del entrenador DELEGAN en GymBookingService /
// SessionActivityService. Certifica:
//  - gym.classes + write antes de tocar datos (entitlement, Support read-only);
//  - rol LIVE (effectiveUser.role) y Trainer activo vinculado resuelto en
//    context.client con el tenant efectivo (nunca ids del formulario);
//  - canal y actor desde el contexto; campos inyectados se ignoran;
//  - clave de idempotencia del formulario hasta el servicio;
//  - errores traducidos y dispose siempre.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidatePathMock, redirectMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/lib/permissions/guards", () => ({
  // Puerta del JWT: el rol del JWT NO decide (el contexto trae el LIVE).
  requireClassViewer: vi.fn(async () => ({ id: "u-trainer", tenant_id: "tenant-1", location_id: "loc-1", role: "trainer" })),
}));

const { service, activities, requireOperationalContextMock, disposeMock, FakeOperationalContextError } = vi.hoisted(() => {
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
    service: { recordAttendance: vi.fn(), updateTrainingNotes: vi.fn() },
    activities: { addSessionActivity: vi.fn(), addAttendanceActivity: vi.fn() },
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
  createGymBookingService: vi.fn(() => service),
  resolveIdempotencyKey: (raw: unknown) => (typeof raw === "string" && raw.length >= 8 ? raw : "server-generated-key"),
}));
vi.mock("./booking/session-activities", () => ({
  createSessionActivityService: vi.fn(() => activities),
}));

import {
  addAttendanceActivityAction,
  addSessionActivityAction,
  saveTrainingNotesAction,
  trainerRecordAttendanceAction,
} from "./trainer-actions";

const SES = "eeb1d1e1-e1c8-4958-9d16-db8129862c8e";
const BOOKING = "b0000000-0000-4000-8000-000000000001";
const KEY = "11111111-2222-4333-8444-555555555555";

function context(role: string, linkedTrainer: { id: string } | null = { id: "trainer-1" }) {
  const trainerFindFirst = vi.fn(async () =>
    linkedTrainer ? { ...linkedTrainer, branch_id: "loc-1", first_name: "T", last_name: "A" } : null
  );
  const classBookingFindFirst = vi.fn(async () => ({ scheduled_class_id: SES }));
  return {
    trainerFindFirst,
    handle: {
      context: {
        tenantId: "tenant-1",
        locationId: "loc-1",
        effectiveUser: { id: "u-trainer", role, tenant_id: "tenant-1", location_id: "loc-1" },
        client: { trainer: { findFirst: trainerFindFirst }, classBooking: { findFirst: classBookingFindFirst } },
      },
      dispose: disposeMock,
    },
  };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const lastRedirect = () => String(redirectMock.mock.calls.at(-1)?.[0] ?? "");

beforeEach(() => {
  vi.clearAllMocks();
  disposeMock.mockResolvedValue(undefined);
});

describe("trainerRecordAttendanceAction", () => {
  it("rol LIVE trainer + Trainer vinculado → canal TRAINER con actor/scope del contexto; campos inyectados ignorados", async () => {
    const c = context("trainer");
    requireOperationalContextMock.mockResolvedValue(c.handle);
    service.recordAttendance.mockResolvedValue({ ok: true, value: { attendanceId: "a1" }, operationId: "op", replayed: false });

    await trainerRecordAttendanceAction(
      form({
        scheduled_class_id: SES,
        booking_id: BOOKING,
        attendance_status: "late",
        idempotency_key: KEY,
        channel: "STAFF",
        role: "super_admin",
        tenant_id: "tenant-evil",
        trainer_id: "trainer-evil",
      })
    );

    expect(requireOperationalContextMock).toHaveBeenCalledWith(expect.anything(), { module: "gym.classes", write: true });
    expect(c.trainerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: "u-trainer", tenant_id: "tenant-1", status: "active" } })
    );
    expect(service.recordAttendance).toHaveBeenCalledWith({
      scope: { tenantId: "tenant-1", locationId: "loc-1" },
      actor: { userId: "u-trainer", role: "trainer" },
      channel: "TRAINER",
      bookingId: BOOKING,
      status: "late",
      idempotencyKey: KEY,
    });
    expect(lastRedirect()).toBe(`/dashboard/classes/${SES}?notice=${encodeURIComponent("Asistencia registrada.")}`);
    expect(disposeMock).toHaveBeenCalled();
  });

  it("JWT trainer degradado a recepción (LIVE) → sin servicio, rechazo", async () => {
    requireOperationalContextMock.mockResolvedValue(context("reception").handle);
    await trainerRecordAttendanceAction(form({ scheduled_class_id: SES, booking_id: BOOKING, attendance_status: "attended" }));
    expect(service.recordAttendance).not.toHaveBeenCalled();
    expect(lastRedirect()).toContain("?error=");
    expect(disposeMock).toHaveBeenCalled();
  });

  it("SA/BA no usan el canal TRAINER (conservan la acción de staff)", async () => {
    requireOperationalContextMock.mockResolvedValue(context("branch_admin").handle);
    await trainerRecordAttendanceAction(form({ scheduled_class_id: SES, booking_id: BOOKING, attendance_status: "attended" }));
    expect(service.recordAttendance).not.toHaveBeenCalled();
  });

  it("trainer sin perfil activo vinculado → mensaje de vinculación, sin permisos por defecto", async () => {
    requireOperationalContextMock.mockResolvedValue(context("trainer", null).handle);
    await trainerRecordAttendanceAction(form({ scheduled_class_id: SES, booking_id: BOOKING, attendance_status: "attended" }));
    expect(service.recordAttendance).not.toHaveBeenCalled();
    expect(decodeURIComponent(lastRedirect())).toContain("perfil de entrenador activo vinculado");
  });

  it("Support Session (solo lectura) y organización sin gym.classes → rechazo antes de leer datos", async () => {
    for (const [code, msg] of [
      ["READ_ONLY", "Modo solo lectura"],
      ["MODULE_DISABLED", "Este módulo no está habilitado para tu organización."],
    ] as const) {
      requireOperationalContextMock.mockRejectedValueOnce(new FakeOperationalContextError(code, msg, 403));
      await trainerRecordAttendanceAction(form({ scheduled_class_id: SES, booking_id: BOOKING, attendance_status: "attended" }));
      expect(decodeURIComponent(lastRedirect())).toContain(msg);
    }
    expect(service.recordAttendance).not.toHaveBeenCalled();
  });

  it("estado fuera de contrato (cancelled) → INVALID_COMMAND sin servicio", async () => {
    requireOperationalContextMock.mockResolvedValue(context("trainer").handle);
    await trainerRecordAttendanceAction(form({ scheduled_class_id: SES, booking_id: BOOKING, attendance_status: "cancelled" }));
    expect(service.recordAttendance).not.toHaveBeenCalled();
    expect(decodeURIComponent(lastRedirect())).toContain("Datos inválidos.");
  });

  it("errores del motor traducidos (ventana cerrada) y redirect saneado", async () => {
    requireOperationalContextMock.mockResolvedValue(context("trainer").handle);
    service.recordAttendance.mockResolvedValue({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
    await trainerRecordAttendanceAction(form({ scheduled_class_id: "../../admin", booking_id: BOOKING, attendance_status: "absent" }));
    expect(lastRedirect().startsWith("/dashboard/classes?error=")).toBe(true);
    expect(decodeURIComponent(lastRedirect())).toContain("Cerró el plazo");
  });
});

describe("saveTrainingNotesAction", () => {
  it("entrenador → canal TRAINER; vacío borra (null)", async () => {
    requireOperationalContextMock.mockResolvedValue(context("trainer").handle);
    service.updateTrainingNotes.mockResolvedValue({ ok: true, value: { attendanceId: "a1" }, operationId: "op", replayed: false });
    await saveTrainingNotesAction(form({ scheduled_class_id: SES, booking_id: BOOKING, training_notes: "   ", idempotency_key: KEY }));
    expect(service.updateTrainingNotes).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "TRAINER", actor: { userId: "u-trainer", role: "trainer" }, trainingNotes: null, idempotencyKey: KEY })
    );
  });

  it("SA/BA (LIVE) → canal STAFF; recepción → rechazo sin servicio (R36)", async () => {
    requireOperationalContextMock.mockResolvedValue(context("branch_admin").handle);
    service.updateTrainingNotes.mockResolvedValue({ ok: true, value: { attendanceId: "a1" }, operationId: "op", replayed: false });
    await saveTrainingNotesAction(form({ scheduled_class_id: SES, booking_id: BOOKING, training_notes: "ok" }));
    expect(service.updateTrainingNotes).toHaveBeenCalledWith(expect.objectContaining({ channel: "STAFF", actor: { userId: "u-trainer", role: "branch_admin" } }));

    service.updateTrainingNotes.mockClear();
    requireOperationalContextMock.mockResolvedValue(context("reception").handle);
    await saveTrainingNotesAction(form({ scheduled_class_id: SES, booking_id: BOOKING, training_notes: "x" }));
    expect(service.updateTrainingNotes).not.toHaveBeenCalled();
  });

  it("nota mayor a 2000 caracteres → rechazo sin servicio", async () => {
    requireOperationalContextMock.mockResolvedValue(context("trainer").handle);
    await saveTrainingNotesAction(form({ scheduled_class_id: SES, booking_id: BOOKING, training_notes: "x".repeat(2001) }));
    expect(service.updateTrainingNotes).not.toHaveBeenCalled();
    expect(decodeURIComponent(lastRedirect())).toContain("2000 caracteres");
  });
});

describe("actividades", () => {
  it("actividad común: sesión del formulario como objetivo; canal/actor del contexto; repetida → aviso", async () => {
    requireOperationalContextMock.mockResolvedValue(context("trainer").handle);
    activities.addSessionActivity.mockResolvedValue({ ok: true, value: { id: "x", sessionId: SES, created: false } });
    await addSessionActivityAction(form({ scheduled_class_id: SES, activity_id: "act-1", notes: "10 min", channel: "STAFF" }));
    expect(activities.addSessionActivity).toHaveBeenCalledWith({
      scope: { tenantId: "tenant-1", locationId: "loc-1" },
      actor: { userId: "u-trainer", role: "trainer" },
      channel: "TRAINER",
      sessionId: SES,
      activityId: "act-1",
      notes: "10 min",
    });
    expect(decodeURIComponent(lastRedirect())).toContain("ya estaba registrada");
  });

  it("actividad individual: sin asistencia en el formulario → mensaje, sin servicio", async () => {
    requireOperationalContextMock.mockResolvedValue(context("trainer").handle);
    await addAttendanceActivityAction(form({ scheduled_class_id: SES, activity_id: "act-1" }));
    expect(activities.addAttendanceActivity).not.toHaveBeenCalled();
    expect(decodeURIComponent(lastRedirect())).toContain("Primero registra la asistencia");
  });

  it("actividad individual: ACTIVITY_UNAVAILABLE traducido; recepción rechazada", async () => {
    requireOperationalContextMock.mockResolvedValue(context("trainer").handle);
    activities.addAttendanceActivity.mockResolvedValue({ ok: false, code: "ACTIVITY_UNAVAILABLE" });
    await addAttendanceActivityAction(form({ scheduled_class_id: SES, attendance_id: "att-1", activity_id: "act-x" }));
    expect(decodeURIComponent(lastRedirect())).toContain("no está disponible");

    activities.addAttendanceActivity.mockClear();
    requireOperationalContextMock.mockResolvedValue(context("reception").handle);
    await addAttendanceActivityAction(form({ scheduled_class_id: SES, attendance_id: "att-1", activity_id: "act-x" }));
    expect(activities.addAttendanceActivity).not.toHaveBeenCalled();
  });
});
