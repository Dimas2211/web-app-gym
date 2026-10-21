// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2B — contrato estático de 20261020000000_gym_bookings_capacity_check
// y de las comprobaciones de preflight 2B. El comportamiento real contra
// PostgreSQL está en src/modules/classes/booking/booking-capacity-migration.integration.test.ts.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  GYM_BOOKINGS_2B_CAPACITY_CHECK,
  GYM_BOOKINGS_2B_MIGRATION,
  GYM_BOOKINGS_PREFLIGHT_CHECKS,
  gymPreflightChecksFor,
} from "./preflight-gym-bookings.queries";

const root = path.resolve(__dirname, "../../..");
const migration = readFileSync(path.join(root, "prisma/migrations", GYM_BOOKINGS_2B_MIGRATION, "migration.sql"), "utf8");
const sql = migration
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");
const rollback = readFileSync(path.join(__dirname, "rollback-gym-bookings-capacity-check.sql"), "utf8");
const cleanup = readFileSync(path.join(__dirname, "cleanup-over-capacity-2b.sql"), "utf8");

describe(`migración ${GYM_BOOKINGS_2B_MIGRATION}`, () => {
  it("agrega SOLO el CHECK de cupo, NOT VALID (forma definida en 2A, decisión 11)", () => {
    expect(sql).toMatch(
      new RegExp(`ADD CONSTRAINT "${GYM_BOOKINGS_2B_CAPACITY_CHECK}"\\s+CHECK \\("booked_count" <= "capacity"\\) NOT VALID;`)
    );
    expect(sql).not.toMatch(/VALIDATE CONSTRAINT/i);
    expect(sql.match(/ADD CONSTRAINT/g)).toHaveLength(1);
  });

  it("la guarda de sobrecupo va DESPUÉS del ALTER (ACCESS EXCLUSIVE ya tomado) y aborta todo", () => {
    expect(sql.indexOf("ADD CONSTRAINT")).toBeLessThan(sql.indexOf("GYM_CAPACITY_CHECK_BLOCKED"));
    expect(sql).toMatch(/RAISE EXCEPTION 'GYM_CAPACITY_CHECK_BLOCKED/);
  });

  it("no modifica datos ni contadores, ni tiene control de transacción o sentencias no transaccionales", () => {
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|RENAME)\b/i);
    expect(sql).not.toMatch(/\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\s*;/i);
    expect(sql).not.toMatch(/CONCURRENTLY|ALTER TYPE .* ADD VALUE|VACUUM/i);
  });

  it("la reversión revisada solo elimina el CHECK y no toca _prisma_migrations", () => {
    expect(rollback).toMatch(new RegExp(`DROP CONSTRAINT IF EXISTS "${GYM_BOOKINGS_2B_CAPACITY_CHECK}"`));
    expect(rollback.replace(/^--.*$/gm, "")).not.toMatch(/_prisma_migrations|DELETE|UPDATE/i);
  });

  it("la limpieza no borra reservas ni escribe contadores; solo ajusta capacity del historial", () => {
    const body = cleanup.replace(/^--.*$/gm, "");
    expect(body).not.toMatch(/DELETE|booked_count"\s*=|sessions_used"\s*=|class_bookings"\s+SET/i);
    expect(body).toMatch(/SET "capacity" = "booked_count"/);
    expect(body).toMatch(/"class_date" < CURRENT_DATE - 1/);
  });
});

describe("preflight 2B", () => {
  it("fases pre2b/post2b separadas: no cambian el resultado de pre/post certificado en 2A", () => {
    const pre = gymPreflightChecksFor("pre").map((c) => c.id);
    const post = gymPreflightChecksFor("post").map((c) => c.id);
    expect([...pre, ...post].some((id) => id.includes("_2B_"))).toBe(false);
    expect(gymPreflightChecksFor("pre2b").map((c) => c.id)).toContain("PRE_2B_CLASSES_OVER_CAPACITY");
    expect(gymPreflightChecksFor("post2b").map((c) => c.id)).toContain("POST_2B_MISSING_CAPACITY_CHECK");
  });

  it("el sobrecupo y la deriva de contadores bloquean 2B", () => {
    const byId = Object.fromEntries(GYM_BOOKINGS_PREFLIGHT_CHECKS.map((c) => [c.id, c]));
    expect(byId.PRE_2B_CLASSES_OVER_CAPACITY.severity).toBe("BLOCKER");
    expect(byId.PRE_2B_BOOKING_COUNTER_DRIFT.severity).toBe("BLOCKER");
    expect(byId.POST_2B_MISSING_CAPACITY_CHECK.severity).toBe("BLOCKER");
  });

  it("todas las consultas 2B son de solo lectura", () => {
    for (const check of [...gymPreflightChecksFor("pre2b"), ...gymPreflightChecksFor("post2b")]) {
      const q = `${check.countSql}\n${check.sampleSql ?? ""}`;
      expect(q.trim(), check.id).toMatch(/^SELECT/i);
      expect(q, check.id).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT)\b/i);
    }
  });
});
