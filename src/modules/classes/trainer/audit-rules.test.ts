// GYM-4 — auditoría independiente: reglas puras de H01 (identidad LIVE),
// H02 (diagnóstico de zona horaria) y H03 (ventana de actividades), más la
// regresión de la regla histórica de asistencia.

import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions/guards";
import { checkAttendanceAccess, checkTrainingRecordAccess } from "../booking/booking-eligibility";
import { GYM_BOOKING_POLICY_DEFAULTS, resolveGymBookingPolicy } from "../booking/booking-policy";
import {
  LIVE_IDENTITY_CHANGED_MESSAGE,
  liveLocationMatches,
  resolveLiveClassViewer,
  resolveSessionOperator,
} from "./trainer-access";
import { evaluateGymTimezone, gymTimezoneAdminNotice } from "./timezone-preflight";

const HOUR = 3_600_000;
const NOW = new Date("2026-10-21T18:00:00.000Z");
const legacyOpen = resolveGymBookingPolicy({ ...GYM_BOOKING_POLICY_DEFAULTS, timezone: "America/El_Salvador", apply_policy_to_open: false });

describe("H03 · checkTrainingRecordAccess (actividades)", () => {
  const at = (startOffsetH: number | null, status: "scheduled" | "completed" = "scheduled") => ({
    policy: legacyOpen,
    now: NOW,
    startsAt: startOffsetH === null ? null : new Date(NOW.getTime() + startOffsetH * HOUR),
    endsAt: startOffsetH === null ? null : new Date(NOW.getTime() + (startOffsetH + 1) * HOUR),
    sessionStatus: status,
  });
  const staff = (role: string) => ({ channel: "STAFF" as const, role });
  const trainer = { channel: "TRAINER" as const, role: "trainer" };

  it("antes del inicio nadie registra, tampoco STAFF en OPEN sin política (sin excepción heredada)", () => {
    for (const who of [staff("super_admin"), staff("branch_admin"), trainer]) {
      expect(checkTrainingRecordAccess({ ...at(2), ...who })).toEqual({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
      // completed antes de empezar no es corrección administrativa.
      expect(checkTrainingRecordAccess({ ...at(2, "completed"), ...who })).toEqual({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
    }
  });

  it("sin instante de inicio → SCHEDULE_INCOMPLETE para todos", () => {
    expect(checkTrainingRecordAccess({ ...at(null), ...staff("super_admin") })).toEqual({ ok: false, code: "SCHEDULE_INCOMPLETE" });
  });

  it("en curso → abierto sin corrección; vencida o cerrada → solo SA/BA como corrección administrativa", () => {
    expect(checkTrainingRecordAccess({ ...at(-0.5), ...trainer })).toEqual({ ok: true, administrativeCorrection: false });
    expect(checkTrainingRecordAccess({ ...at(-60), ...trainer })).toEqual({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
    expect(checkTrainingRecordAccess({ ...at(-60), ...staff("branch_admin") })).toEqual({ ok: true, administrativeCorrection: true });
    expect(checkTrainingRecordAccess({ ...at(-2, "completed"), ...staff("super_admin") })).toEqual({ ok: true, administrativeCorrection: true });
    expect(checkTrainingRecordAccess({ ...at(-2, "completed"), ...trainer })).toEqual({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
  });

  it("regresión: la asistencia STAFF de OPEN sin política sigue sin ventana (regla histórica intacta)", () => {
    expect(checkAttendanceAccess({ ...at(2), kind: "OPEN", ...staff("reception") })).toEqual({ ok: true, administrativeCorrection: false });
    expect(checkAttendanceAccess({ ...at(2), kind: "OPEN", ...trainer })).toEqual({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
  });
});

describe("H02 · diagnóstico de zona horaria", () => {
  it("sin fila, vacía, inválida y válidas de varios países (sin zona por defecto)", () => {
    expect(evaluateGymTimezone(null)).toEqual({ ok: false, issue: "NO_SETTINGS" });
    expect(evaluateGymTimezone({ timezone: null })).toEqual({ ok: false, issue: "MISSING" });
    expect(evaluateGymTimezone({ timezone: "GMT-6 Centroamérica" })).toEqual({ ok: false, issue: "INVALID" });
    for (const tz of ["America/El_Salvador", "America/Mexico_City", "Europe/Madrid", "Asia/Tokyo"]) {
      expect(evaluateGymTimezone({ timezone: tz })).toEqual({ ok: true, timezone: tz });
    }
  });

  it("el aviso administrativo dice qué falta y quién lo configura", () => {
    expect(gymTimezoneAdminNotice("MISSING", "super_admin")).toMatch(/no tiene zona horaria.*Configúrala en Ajustes › Reservas/);
    expect(gymTimezoneAdminNotice("INVALID", "branch_admin")).toMatch(/no es válida.*Pide a un super administrador/);
  });
});

describe("H01 · identidad LIVE (rol + sede)", () => {
  const userRow = (branch_id: string | null) =>
    ({ user: { findUnique: vi.fn(async () => (branch_id === undefined ? null : { branch_id })) } }) as unknown as PrismaClient;
  const sessionUser = { id: "u1", role: "super_admin", tenant_id: "t1", location_id: null } as unknown as SessionUser;

  it("PLATFORM_NATIVE no consulta la base; RUNTIME_CLIENT compara la sede vigente con la del JWT", async () => {
    const client = userRow("loc-2");
    expect(await liveLocationMatches({ runtimeMode: "PLATFORM_NATIVE", client, userId: "u1", role: "branch_admin", locationId: "loc-1" })).toBe(true);
    expect(client.user.findUnique).not.toHaveBeenCalled();
    expect(await liveLocationMatches({ runtimeMode: "RUNTIME_CLIENT", client, userId: "u1", role: "branch_admin", locationId: "loc-1" })).toBe(false);
    expect(await liveLocationMatches({ runtimeMode: "RUNTIME_CLIENT", client, userId: "u1", role: "branch_admin", locationId: "loc-2" })).toBe(true);
    expect(await liveLocationMatches({ runtimeMode: "RUNTIME_CLIENT", client, userId: "u1", role: "reception", locationId: null })).toBe(false);
    // super_admin y entrenador no se acotan por sede.
    expect(await liveLocationMatches({ runtimeMode: "RUNTIME_CLIENT", client, userId: "u1", role: "super_admin", locationId: null })).toBe(true);
    expect(await liveLocationMatches({ runtimeMode: "RUNTIME_CLIENT", client, userId: "u1", role: "trainer", locationId: null })).toBe(true);
  });

  it("el visor usa el rol LIVE, nunca el del JWT; rol sin operaciones o sede cambiada → falla cerrado", async () => {
    const ctx = (effectiveRole: string, locationId: string | null, branch: string | null) => ({
      tenantId: "t1",
      client: userRow(branch),
      locationId,
      runtimeMode: "RUNTIME_CLIENT" as const,
      effectiveRole,
    });
    expect(await resolveLiveClassViewer(sessionUser, ctx("branch_admin", "loc-1", "loc-1"))).toMatchObject({
      ok: true,
      user: { role: "branch_admin", location_id: "loc-1", tenant_id: "t1" },
    });
    expect(await resolveLiveClassViewer(sessionUser, ctx("branch_admin", null, "loc-2"))).toEqual({ ok: false, message: LIVE_IDENTITY_CHANGED_MESSAGE });
    expect(await resolveLiveClassViewer(sessionUser, ctx("client", null, null))).toEqual({ ok: false, message: LIVE_IDENTITY_CHANGED_MESSAGE });
  });

  it("operador STAFF: branch_admin con sede del JWT obsoleta no opera; trainer no se amplía", async () => {
    const op = (role: string, branch: string | null) =>
      resolveSessionOperator(
        {
          effectiveUser: { id: "u1", role },
          tenantId: "t1",
          client: { ...userRow(branch), trainer: { findFirst: vi.fn(async () => null) } } as unknown as PrismaClient,
          runtimeMode: "RUNTIME_CLIENT",
          locationId: "loc-1",
        },
        { allowAdmin: true }
      );
    expect(await op("branch_admin", "loc-2")).toEqual({ ok: false, error: LIVE_IDENTITY_CHANGED_MESSAGE });
    expect(await op("branch_admin", "loc-1")).toMatchObject({ ok: true, channel: "STAFF" });
    expect(await op("super_admin", "loc-9")).toMatchObject({ ok: true, channel: "STAFF" });
    expect(await op("reception", "loc-1")).toMatchObject({ ok: false });
    expect(await op("trainer", "loc-1")).toMatchObject({ ok: false });
  });
});
