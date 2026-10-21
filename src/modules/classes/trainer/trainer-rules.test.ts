// GYM-4 — reglas puras del operador de sesión, capacidades del rol trainer
// (sin ampliar) y protección estática R36 de training_notes.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { checkSessionOperator, trainerOwnsSession } from "../booking/booking-eligibility";
import { resolveEffectiveCapacity } from "../booking/booking-rules";
import { GYM_BOOKING_POLICY_DEFAULTS, resolveGymBookingPolicy } from "../booking/booking-policy";

const session = (over: Partial<{ branch_id: string; user_id: string | null; status: string }> = {}) => ({
  branch_id: over.branch_id ?? "loc-1",
  trainer: { user_id: over.user_id === undefined ? "u-t" : over.user_id, status: over.status ?? "active" },
});

describe("trainerOwnsSession / checkSessionOperator", () => {
  it("solo el Trainer activo asignado y vinculado al usuario", () => {
    expect(trainerOwnsSession({ userId: "u-t", role: "trainer" }, { user_id: "u-t", status: "active" })).toBe(true);
    expect(trainerOwnsSession({ userId: "u-t", role: "trainer" }, { user_id: "u-x", status: "active" })).toBe(false);
    expect(trainerOwnsSession({ userId: "u-t", role: "trainer" }, { user_id: "u-t", status: "inactive" })).toBe(false);
    expect(trainerOwnsSession({ userId: "u-t", role: "trainer" }, { user_id: null, status: "active" })).toBe(false);
    expect(trainerOwnsSession({ userId: "u-t", role: "reception" }, { user_id: "u-t", status: "active" })).toBe(false);
  });

  it("TRAINER por asignación (la sede no cuenta); STAFF solo SA o BA de la sede; recepción nunca", () => {
    const op = (channel: "TRAINER" | "STAFF" | "PORTAL", role: string, scopeLocationId: string | null, s = session()) =>
      checkSessionOperator({ channel, actor: { userId: "u-t", role }, scopeLocationId, session: s });
    expect(op("TRAINER", "trainer", "loc-2")).toBe(true);
    expect(op("TRAINER", "trainer", "loc-1", session({ user_id: "u-x" }))).toBe(false);
    expect(op("STAFF", "super_admin", null)).toBe(true);
    expect(op("STAFF", "branch_admin", "loc-1")).toBe(true);
    expect(op("STAFF", "branch_admin", "loc-2")).toBe(false);
    expect(op("STAFF", "branch_admin", null)).toBe(false);
    expect(op("STAFF", "reception", "loc-1")).toBe(false);
    expect(op("STAFF", "trainer", "loc-1")).toBe(false);
    expect(op("PORTAL", "client", "loc-1")).toBe(false);
  });
});

describe("K/L · el rol trainer no se amplía", () => {
  it("sin administración: política, series, planes (requireAdmin) ni membresías (requireMembershipManager)", () => {
    const caps = getCapabilities("trainer");
    expect(caps.canManageStaff).toBe(false); // requireAdmin → política, series, planes, actividades
    expect(caps.canManageMembers).toBe(false); // requireMembershipManager → vender/gestionar membresías, reservar, cancelar
    expect(caps.canOperateCommerce).toBe(false);
    // canManageClass / canManageMembership / canManagePlan derivan de estas
    // capacidades (guards.ts): el entrenador no gestiona clases, membresías ni planes.
    expect(caps.isGlobal).toBe(false);
  });
});

describe("PERSONALIZED_CAPACITY_RULE = DEFAULT_ONLY (sin cambios)", () => {
  it("sesión > serie > entrenador > GymSettings; el cupo del entrenador es predeterminado, no máximo", () => {
    const policy = resolveGymBookingPolicy({ ...GYM_BOOKING_POLICY_DEFAULTS, personalized_default_capacity: 1 });
    const cap = (over: Partial<Parameters<typeof resolveEffectiveCapacity>[0]>) =>
      resolveEffectiveCapacity({ kind: "PERSONALIZED", policy, ...over });
    expect(cap({ explicitCapacity: 5, seriesCapacity: 3, trainerPersonalizedCapacity: 2 })).toBe(5); // supera el del entrenador
    expect(cap({ seriesCapacity: 3, trainerPersonalizedCapacity: 2 })).toBe(3);
    expect(cap({ trainerPersonalizedCapacity: 2 })).toBe(2);
    expect(cap({})).toBe(1);
  });
});

describe("Z · R36 estático: training_notes fuera del portal y de consultas compartidas", () => {
  const ROOT = path.resolve(__dirname, "../../../..");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
    });
  const codeLines = (file: string) =>
    readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));

  it("ningún archivo del portal del alumno selecciona o lee training_notes", () => {
    const files = [...walk(path.join(ROOT, "src/modules/client-portal")), ...walk(path.join(ROOT, "src/app/(portal)"))];
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter((f) => codeLines(f).some((l) => l.includes("training_notes")));
    expect(offenders).toEqual([]);
  });

  it("getScheduledClassById (recepción, edición) selecciona asistencia de forma explícita sin training_notes", () => {
    const src = readFileSync(path.join(ROOT, "src/modules/classes/queries.ts"), "utf8");
    const fn = src.slice(src.indexOf("export async function getScheduledClassById"), src.indexOf("// ── Form helpers"));
    expect(fn).toMatch(/attendance:\s*\{\s*select:/);
    expect(fn).not.toMatch(/attendance:\s*\{\s*include:/);
    expect(codeLines(path.join(ROOT, "src/modules/classes/queries.ts")).some((l) => l.includes("training_notes"))).toBe(false);
  });
});
