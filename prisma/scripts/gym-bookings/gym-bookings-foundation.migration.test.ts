// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2A — contrato estático de la migración expand-first.
//
// Sin base de datos. Certifica que:
//  - la migración es solo aditiva (sin DROP/RENAME/ALTER COLUMN/DELETE);
//  - toda columna NOT NULL agregada a una tabla existente tiene DEFAULT;
//  - los campos nuevos de modelos heredados son opcionales o con default
//    (código desplegado antes o sin 2A sigue pudiendo crear filas);
//  - el preflight "pre" no referencia columnas nuevas (válido en bases sin migrar);
//  - el rollback revisado cubre cada objeto creado.
// La certificación ejecutable sobre PostgreSQL vive en
// certify-gym-bookings-foundation.pglite.mjs.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import {
  GYM_BOOKINGS_EXPECTED_CHECKS,
  GYM_BOOKINGS_EXPECTED_TRIGGERS,
  gymPreflightChecksFor,
} from "./preflight-gym-bookings.queries";
import { describeUrlSafely } from "./preflight-gym-bookings";

const root = path.resolve(__dirname, "../../..");
const migration = readFileSync(
  path.join(root, "prisma/migrations/20261019000000_gym_bookings_foundation/migration.sql"),
  "utf8"
);
const rollback = readFileSync(path.join(__dirname, "rollback-gym-bookings-foundation.sql"), "utf8");
const sqlOnly = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
const migrationSql = sqlOnly(migration);

const EXISTING_TABLES = [
  "membership_plans", "clients", "client_memberships", "trainers",
  "scheduled_classes", "class_bookings", "class_attendance", "gym_settings",
];

// Campos agregados por 2A a modelos que ya existían.
const NEW_FIELDS_ON_LEGACY_MODELS: Record<string, string[]> = {
  MembershipPlan: ["modality"],
  Client: ["modality", "modality_changed_at"],
  ClientMembership: ["modality", "sessions_total", "sessions_used", "assigned_trainer_id"],
  Trainer: ["personalized_capacity"],
  ScheduledClass: [
    "session_kind", "series_id", "starts_at", "ends_at", "booked_count", "cancelled_at",
    "cancelled_by_user_id", "cancel_reason", "completed_at", "completed_by_user_id",
  ],
  ClassBooking: [
    "tenant_id", "client_membership_id", "channel", "booked_by_user_id", "consumption",
    "cancelled_at", "cancelled_by_user_id", "cancellation_type", "cancel_reason",
  ],
  ClassAttendance: ["tenant_id", "booking_id", "recorded_by_user_id", "recorded_at", "training_notes"],
  GymSettings: [
    "timezone", "personalized_booking_enabled", "group_booking_enabled", "personalized_default_capacity",
    "booking_horizon_days", "booking_min_lead_minutes", "cancel_min_lead_minutes",
    "late_cancel_consumes_session", "apply_policy_to_open", "attendance_edit_window_hours", "series_generation_weeks",
  ],
};
const NEW_MODELS = [
  "ClassSeries", "TrainerTimeOff", "GymActivity", "ScheduledClassActivity",
  "ClassAttendanceActivity", "ClientModalityChange", "ClassBookingEvent", "GymBookingOperation",
];
// Columnas nuevas recalculables desde datos heredados: el rollback las descarta sin bloquear.
const DERIVED_COLUMNS = new Set([
  "ScheduledClass.booked_count", "ClassBooking.tenant_id", "ClassAttendance.tenant_id", "ClassAttendance.booking_id",
]);
const TABLE_OF: Record<string, string> = {
  MembershipPlan: "membership_plans", Client: "clients", ClientMembership: "client_memberships", Trainer: "trainers",
  ScheduledClass: "scheduled_classes", ClassBooking: "class_bookings", ClassAttendance: "class_attendance", GymSettings: "gym_settings",
};
const models = Prisma.dmmf.datamodel.models;

describe("migración 20261019000000_gym_bookings_foundation — solo aditiva", () => {
  it("no contiene sentencias destructivas ni renombres", () => {
    expect(migrationSql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX|CONSTRAINT|TRIGGER|FUNCTION)\b/i);
    expect(migrationSql).not.toMatch(/\bRENAME\b/i);
    expect(migrationSql).not.toMatch(/\bALTER\s+COLUMN\b/i);
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("toda columna NOT NULL agregada a una tabla existente tiene DEFAULT", () => {
    const adds = [...migrationSql.matchAll(/ADD COLUMN\s+"(\w+)"\s+([^,;]+)/g)];
    expect(adds.length).toBeGreaterThan(0);
    for (const [, col, def] of adds) {
      if (/NOT NULL/.test(def)) expect(def, col).toMatch(/DEFAULT/);
    }
  });

  it("los UPDATE de backfill solo escriben columnas nuevas", () => {
    const sets = [...migrationSql.matchAll(/UPDATE\s+"(\w+)"\s+\w+\s+SET\s+"(\w+)"/g)].map(([, t, c]) => `${t}.${c}`);
    expect(sets.sort()).toEqual(
      ["class_attendance.booking_id", "class_attendance.tenant_id", "class_bookings.tenant_id", "scheduled_classes.booked_count"].sort()
    );
  });

  it("crea los triggers y CHECKs que verifica el postflight", () => {
    for (const t of GYM_BOOKINGS_EXPECTED_TRIGGERS) expect(migrationSql).toContain(`CREATE TRIGGER "${t}"`);
    for (const c of GYM_BOOKINGS_EXPECTED_CHECKS) expect(migrationSql).toContain(`ADD CONSTRAINT "${c}"`);
    expect([...migrationSql.matchAll(/CREATE TRIGGER/g)].length).toBe(GYM_BOOKINGS_EXPECTED_TRIGGERS.length);
  });

  it("no contiene control de transacción ni sentencias no transaccionales (Prisma la aplica como un solo mensaje)", () => {
    expect(migrationSql).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION|SAVEPOINT)\s*;/im);
    expect(migrationSql).not.toMatch(/\bCONCURRENTLY\b/i);
    expect(migrationSql).not.toMatch(/ALTER\s+TYPE\s+"?\w+"?\s+ADD\s+VALUE/i);
    expect(migrationSql).not.toMatch(/\bVACUUM\b/i);
    expect(sqlOnly(rollback)).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
  });

  it("no agrega el CHECK booked_count <= capacity en 2A (regla heredada intacta)", () => {
    expect(migrationSql).not.toMatch(/booked_count"?\s*<=\s*"?capacity/);
  });
});

describe("schema — aislamiento tenant de referencias nuevas (remediación B)", () => {
  const relationsOf = (modelName: string) =>
    models.find((m) => m.name === modelName)!.fields.filter((f) => f.kind === "object" && (f.relationFromFields?.length ?? 0) > 0);

  it.each(NEW_MODELS)("%s: toda FK saliente incluye tenant_id y es Restrict", (modelName) => {
    for (const rel of relationsOf(modelName)) {
      // runtime_tenant ES el tenant: su FK es tenant_id → runtime_tenants.id
      expect(rel.relationFromFields, `${modelName}.${rel.name}`).toContain("tenant_id");
      expect(rel.relationOnDelete, `${modelName}.${rel.name}`).toBe("Restrict");
    }
    expect(relationsOf(modelName).length).toBeGreaterThan(0);
  });

  it("referencias nuevas desde modelos heredados son compuestas", () => {
    const rel = (m: string, f: string) => models.find((x) => x.name === m)!.fields.find((x) => x.name === f)!;
    expect(rel("ScheduledClass", "series").relationFromFields).toEqual(["series_id", "tenant_id"]);
    expect(rel("ClientMembership", "assigned_trainer").relationFromFields).toEqual(["assigned_trainer_id", "tenant_id"]);
    expect(rel("ClassBooking", "client_membership").relationFromFields).toEqual(["client_membership_id", "client_id"]);
    expect(rel("ClassBookingEvent", "booking").relationFromFields).toEqual(["booking_id", "tenant_id", "scheduled_class_id", "client_id"]);
    // H02 / H03
    expect(rel("Trainer", "branch_tenant").relationFromFields).toEqual(["branch_id", "tenant_id"]);
    expect(rel("GymBookingOperation", "location").relationFromFields).toEqual(["location_id", "tenant_id"]);
    expect(rel("ClassBookingEvent", "client_membership").relationFromFields).toEqual(["client_membership_id", "tenant_id", "client_id"]);
  });

  it("H02: la FK compuesta del entrenador es NOT VALID (no revalida historial heredado)", () => {
    expect(migrationSql).toMatch(
      /ADD CONSTRAINT "trainers_branch_id_tenant_id_fkey" FOREIGN KEY \("branch_id", "tenant_id"\) REFERENCES "branches"\("id", "tenant_id"\) ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;/
    );
    expect(rollback).toContain('DROP CONSTRAINT IF EXISTS "trainers_branch_id_tenant_id_fkey"');
  });

  it("H01: los triggers hijo leen al padre con lock y las guardas de padre exigen READ COMMITTED", () => {
    const fn = (name: string) => migrationSql.slice(migrationSql.indexOf(`FUNCTION "${name}"`), migrationSql.indexOf("$$;", migrationSql.indexOf(`FUNCTION "${name}"`)));
    expect(fn("gym_trainer_location_matches")).toMatch(/FROM "trainers" WHERE "id" = NEW\."trainer_id" FOR SHARE/);
    expect(fn("gym_client_memberships_trainer_integrity")).toMatch(/FROM "trainers" WHERE "id" = NEW\."assigned_trainer_id" FOR SHARE/);
    expect(fn("gym_scheduled_classes_series_integrity")).toMatch(/FROM "class_series" WHERE "id" = NEW\."series_id" FOR SHARE/);
    expect(fn("gym_activity_location_matches")).toMatch(/FROM "gym_activities" WHERE "id" = NEW\."activity_id" FOR SHARE/);
    for (const t of ["clients", "client_memberships", "scheduled_classes"]) expect(fn("gym_class_bookings_integrity")).toMatch(new RegExp(`FROM "${t}"[^;]*FOR KEY SHARE`));
    for (const g of [
      "gym_trainers_branch_guard", "gym_activities_location_guard", "gym_class_series_dependents_guard",
      "gym_scheduled_classes_dependents_guard", "gym_dependents_tenant_guard", "gym_class_attendance_integrity",
      "gym_class_bookings_attendance_guard",
    ]) expect(fn(g), g).toContain('PERFORM "gym_require_read_committed"()');
    // Sin locks globales: ningún LOCK TABLE ni advisory lock en la migración.
    expect(migrationSql).not.toMatch(/\bLOCK\s+TABLE\b|pg_advisory/i);
  });

  it("H05: cambiar sesión/cliente de una reserva con asistencia vinculada se rechaza; la FK de asistencia sigue SET NULL", () => {
    expect(migrationSql).toMatch(
      /CREATE TRIGGER "gym_class_bookings_attendance_guard_trg"\s+BEFORE UPDATE OF "scheduled_class_id", "client_id" ON "class_bookings"/
    );
    const guard = migrationSql.slice(migrationSql.indexOf('FUNCTION "gym_class_bookings_attendance_guard"'));
    expect(guard.slice(0, guard.indexOf("$$;"))).toMatch(/FROM "class_attendance"\s+WHERE "booking_id" = OLD\."id"/);
    expect(migrationSql).toMatch(/"class_attendance_booking_id_fkey" FOREIGN KEY \("booking_id"\) REFERENCES "class_bookings"\("id"\) ON DELETE SET NULL/);
    expect(rollback).toContain('DROP TRIGGER IF EXISTS "gym_class_bookings_attendance_guard_trg" ON "class_bookings"');
    expect(rollback).toContain('DROP FUNCTION IF EXISTS "gym_class_bookings_attendance_guard"()');
  });

  it("triggers cubren lo que una FK compuesta no expresa (sede y tenant NULLable heredado)", () => {
    for (const t of [
      "gym_class_series_trainer_location_trg", "gym_trainer_time_off_trainer_location_trg",
      "gym_scheduled_classes_series_integrity_trg", "gym_client_memberships_trainer_integrity_trg",
      "gym_scheduled_class_activities_location_trg", "gym_class_attendance_activities_location_trg",
    ]) expect(migrationSql).toContain(`CREATE TRIGGER "${t}"`);
  });
});

describe("schema — compatibilidad con código heredado", () => {
  it.each(Object.entries(NEW_FIELDS_ON_LEGACY_MODELS))("%s: campos nuevos opcionales o con default", (modelName, fields) => {
    const model = models.find((m) => m.name === modelName)!;
    expect(model).toBeDefined();
    for (const name of fields) {
      const f = model.fields.find((x) => x.name === name);
      expect(f, `${modelName}.${name}`).toBeDefined();
      expect(!f!.isRequired || f!.hasDefaultValue, `${modelName}.${name}`).toBe(true);
    }
  });

  it("clases heredadas quedan OPEN y clientes/planes/membresías NORMAL por default", () => {
    const def = (m: string, f: string) => models.find((x) => x.name === m)!.fields.find((x) => x.name === f)!.default;
    expect(def("ScheduledClass", "session_kind")).toBe("OPEN");
    expect(def("Client", "modality")).toBe("NORMAL");
    expect(def("MembershipPlan", "modality")).toBe("NORMAL");
    expect(def("ClientMembership", "modality")).toBe("NORMAL");
    expect(def("ClassBooking", "consumption")).toBe("NOT_APPLICABLE");
    expect(def("ClientMembership", "sessions_used")).toBe(0);
  });

  it("conserva campos heredados sensibles (is_personalized, Client.assigned_trainer_id → User)", () => {
    const sc = models.find((m) => m.name === "ScheduledClass")!;
    expect(sc.fields.find((f) => f.name === "is_personalized")).toBeDefined();
    const client = models.find((m) => m.name === "Client")!;
    expect(client.fields.find((f) => f.name === "assigned_trainer")!.type).toBe("User");
    const cm = models.find((m) => m.name === "ClientMembership")!;
    expect(cm.fields.find((f) => f.name === "assigned_trainer")!.type).toBe("Trainer");
  });

  it.each(NEW_MODELS)("%s: tenant_id obligatorio (aislamiento por tenant)", (modelName) => {
    const model = models.find((m) => m.name === modelName)!;
    expect(model).toBeDefined();
    const tenant = model.fields.find((f) => f.name === "tenant_id")!;
    expect(tenant.isRequired).toBe(true);
  });
});

describe("preflight", () => {
  // tenant_id, assigned_trainer_id y timezone ya existen en otras tablas
  // heredadas (clients, scheduled_classes, platform_organizations…); el uso
  // de tenant_id en class_bookings/class_attendance se controla aparte.
  const PRE_EXISTING_NAMES = new Set(["tenant_id", "assigned_trainer_id", "timezone"]);
  const NEW_COLUMN_NAMES = [...new Set(Object.values(NEW_FIELDS_ON_LEGACY_MODELS).flat())].filter(
    (c) => !PRE_EXISTING_NAMES.has(c)
  );

  it("las comprobaciones 'pre' no usan columnas ni tablas nuevas", () => {
    for (const check of gymPreflightChecksFor("pre")) {
      const sql = `${check.countSql}\n${check.sampleSql ?? ""}`;
      for (const col of NEW_COLUMN_NAMES) expect(sql, `${check.id} usa ${col}`).not.toMatch(new RegExp(`"${col}"`));
      expect(sql, check.id).not.toMatch(/class_booking_events|gym_activities|class_series|trainer_time_off/);
      expect(sql, check.id).not.toMatch(/[ab]\."tenant_id"/);
    }
  });

  it("todas las consultas son de solo lectura", () => {
    for (const check of [...gymPreflightChecksFor("pre"), ...gymPreflightChecksFor("post")]) {
      const sql = `${check.countSql}\n${check.sampleSql ?? ""}`;
      expect(sql.trim(), check.id).toMatch(/^SELECT/i);
      expect(sql, check.id).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT)\b/i);
    }
  });

  it("nunca imprime credenciales de la URL", () => {
    const safe = describeUrlSafely("postgresql://user:s3cret@db.example.invalid:6543/runtime?sslmode=require");
    expect(safe).toBe("db.example.invalid:6543/runtime");
    expect(safe).not.toContain("s3cret");
  });
});

describe("rollback revisado", () => {
  it("elimina cada trigger, función, tabla y enum creado", () => {
    for (const t of GYM_BOOKINGS_EXPECTED_TRIGGERS) expect(rollback).toContain(`DROP TRIGGER IF EXISTS "${t}"`);
    for (const [, fn] of migrationSql.matchAll(/CREATE OR REPLACE FUNCTION "(\w+)"/g)) {
      expect(rollback).toContain(`DROP FUNCTION IF EXISTS "${fn}"()`);
    }
    for (const [, table] of migrationSql.matchAll(/CREATE TABLE "(\w+)"/g)) {
      expect(rollback).toContain(`DROP TABLE IF EXISTS "${table}"`);
    }
    for (const [, type] of migrationSql.matchAll(/CREATE TYPE "(\w+)"/g)) {
      expect(rollback).toContain(`DROP TYPE IF EXISTS "${type}"`);
    }
  });

  it("elimina cada columna agregada a tablas existentes", () => {
    for (const block of migrationSql.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN[\s\S]*?;/g)) {
      const table = block[1];
      expect(EXISTING_TABLES).toContain(table);
      for (const [, col] of block[0].matchAll(/ADD COLUMN\s+"(\w+)"/g)) {
        expect(rollback, `${table}.${col}`).toMatch(new RegExp(`ALTER TABLE "${table}"[\\s\\S]*?DROP COLUMN IF EXISTS "${col}"`));
      }
    }
  });

  it("se niega a ejecutar si hay datos nuevos que conservar", () => {
    expect(rollback).toContain("GYM_ROLLBACK_BLOCKED");
  });

  it("la guarda cubre toda columna nueva no derivada y toda tabla nueva (remediación C)", () => {
    const labels = new Set([...rollback.matchAll(/^\s*\('([a-z_.]+)',\s*'SELECT/gm)].map((m) => m[1]));
    for (const [model, fields] of Object.entries(NEW_FIELDS_ON_LEGACY_MODELS)) {
      for (const field of fields) {
        if (DERIVED_COLUMNS.has(`${model}.${field}`)) continue;
        expect(labels.has(`${TABLE_OF[model]}.${field}`), `${model}.${field}`).toBe(true);
      }
    }
    for (const [, table] of migrationSql.matchAll(/CREATE TABLE "(\w+)"/g)) expect(labels.has(table), table).toBe(true);
  });

  it("no instruye borrar filas de _prisma_migrations", () => {
    expect(rollback).not.toMatch(/DELETE\s+FROM\s+"?_prisma_migrations/i);
  });
});
