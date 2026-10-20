/**
 * certify-gym-bookings-foundation.pglite.mjs
 *
 * GYM-BOOKINGS 2A — certificación SQL de la migración
 * 20261019000000_gym_bookings_foundation sobre bases SINTÉTICAS DESCARTABLES.
 *
 * Dos drivers (mismo set de pruebas):
 *
 *  --driver=pglite (default): PGlite (PostgreSQL 16 WASM) EN MEMORIA dentro
 *     de este proceso. Sin sockets ni credenciales.
 *       $env:PGLITE_DIR = "<carpeta con node_modules/@electric-sql/pglite>"
 *
 *  --driver=pg: un PostgreSQL REAL desechable levantado por el operador
 *     (p. ej. embedded-postgres con initdb en una carpeta temporal). El
 *     script se niega a correr si el servidor no es 127.0.0.1, si usa el
 *     puerto 5432, o si su data_directory no es exactamente CERT_PG_DATA_DIR.
 *     Crea y borra sus propias bases `zolvi_cert_*` (UTF8, template0).
 *       $env:PG_MODULE_DIR    = "<carpeta con node_modules/pg>"
 *       $env:CERT_PG_ADMIN_URL = "postgresql://<user>:<pwd>@127.0.0.1:<port>/postgres"
 *       $env:CERT_PG_DATA_DIR  = "<data_directory del servidor desechable>"
 *
 * Nunca lee DATABASE_URL / DIRECT_URL / .env. Requiere Node >= 23.6 (importa
 * los módulos .ts de contrato con type stripping).
 *
 *   node --no-warnings prisma/scripts/gym-bookings/certify-gym-bookings-foundation.pglite.mjs [--driver=pg]
 *
 * La certificación de `prisma migrate deploy` (CLI) vive en
 * certify-gym-bookings-prisma-migrate.mjs.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const migrationsDir = path.join(repoRoot, "prisma/migrations");
const TARGET = "20261019000000_gym_bookings_foundation";
const targetSql = readFileSync(path.join(migrationsDir, TARGET, "migration.sql"), "utf8");
const rollbackSql = readFileSync(path.join(here, "rollback-gym-bookings-foundation.sql"), "utf8");
const { GYM_BOOKINGS_PREFLIGHT_CHECKS } = await import(pathToFileURL(path.join(here, "preflight-gym-bookings.queries.ts")).href);
const idem = await import(pathToFileURL(path.join(repoRoot, "src/modules/classes/booking/booking-idempotency.ts")).href);

const DRIVER = (process.argv.find((a) => a.startsWith("--driver=")) ?? "--driver=pglite").split("=")[1];

// ── Drivers ──────────────────────────────────────────────────────────
let createDb;
if (DRIVER === "pglite") {
  const dir = process.env.PGLITE_DIR;
  const entry = dir && path.join(dir, "node_modules/@electric-sql/pglite/dist/index.js");
  if (!entry || !existsSync(entry)) throw new Error("PGLITE_DIR no apunta a una instalación de @electric-sql/pglite");
  const { PGlite } = await import(pathToFileURL(entry).href);
  createDb = async () => {
    const db = new PGlite();
    return {
      exec: (sql) => db.exec(sql),
      query: (sql, params) => db.query(sql, params),
      close: () => db.close(),
      extraConnection: null,
    };
  };
} else if (DRIVER === "pg") {
  const req = createRequire(path.join(process.env.PG_MODULE_DIR ?? "", "noop.js"));
  const { Client } = req("pg");
  const adminUrl = process.env.CERT_PG_ADMIN_URL;
  const expectedDir = process.env.CERT_PG_DATA_DIR;
  if (!adminUrl || !expectedDir) throw new Error("Faltan CERT_PG_ADMIN_URL / CERT_PG_DATA_DIR");
  const u = new URL(adminUrl);
  if (u.hostname !== "127.0.0.1" || (u.port || "5432") === "5432") {
    throw new Error("Rechazado: el servidor de certificación debe ser 127.0.0.1 y un puerto distinto de 5432");
  }
  const norm = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const { rows } = await admin.query("SELECT current_setting('data_directory') AS d");
  if (norm(rows[0].d) !== norm(expectedDir)) {
    await admin.end();
    throw new Error(`Rechazado: data_directory=${rows[0].d} no es CERT_PG_DATA_DIR`);
  }
  let seq = 0;
  createDb = async (label) => {
    const name = `zolvi_cert_${label.toLowerCase()}_${process.pid}_${seq++}`;
    await admin.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    const open = async () => {
      const c = new Client({ connectionString: url.toString() });
      c.on("notice", () => {});
      await c.connect();
      return c;
    };
    const c = await open();
    const extras = [];
    return {
      exec: (sql) => c.query(sql),
      query: (sql, params) => c.query(sql, params),
      extraConnection: async () => {
        const x = await open();
        extras.push(x);
        return { exec: (s) => x.query(s), query: (s, p) => x.query(s, p) };
      },
      close: async () => {
        for (const x of extras) await x.end();
        await c.end();
        await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
      },
    };
  };
  process.on("beforeExit", () => admin.end().catch(() => {}));
} else {
  throw new Error(`driver desconocido: ${DRIVER}`);
}

// ── Reporte ───────────────────────────────────────────────────────────
const results = [];
const skips = [];
function record(id, ok, detail = "") {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? `  — ${detail}` : ""}`);
}
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
const val = async (db, sql, params) => {
  const row = await one(db, sql, params);
  return row ? Object.values(row)[0] : undefined;
};
async function expectOk(db, id, sql) {
  try {
    await db.exec(sql);
    record(id, true);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    record(id, false, `error inesperado: ${e.message}`);
  }
}
async function expectError(db, id, sql, pattern) {
  try {
    await db.exec(sql);
    record(id, false, "se esperaba error y la sentencia pasó");
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    const ok = pattern.test(e.message);
    record(id, ok, ok ? `rechazado: ${e.message.split("\n")[0]}` : `error distinto: ${e.message}`);
  }
}
async function expectEq(db, id, sql, expected) {
  const got = await val(db, sql);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  record(id, ok, ok ? `= ${JSON.stringify(got)}` : `esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(got)}`);
}

/** Divide un script SQL en sentencias, respetando comillas, comentarios y $$…$$. */
function splitStatements(sql) {
  const out = [];
  let cur = "";
  let i = 0;
  let inDollar = false;
  let inQuote = false;
  while (i < sql.length) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);
    if (!inQuote && two === "$$") {
      inDollar = !inDollar;
      cur += two;
      i += 2;
      continue;
    }
    if (!inDollar && ch === "'") inQuote = !inQuote;
    if (!inDollar && !inQuote && two === "--") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (!inDollar && !inQuote && ch === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ── Base sintética ────────────────────────────────────────────────────
async function freshSyntheticDb(label) {
  const db = await createDb(label);
  const iso = await one(
    db,
    `SELECT current_database() AS db, (SELECT COUNT(*)::int FROM pg_tables WHERE schemaname = 'public') AS tables,
            current_setting('server_version') AS version`
  );
  if (iso.tables !== 0) throw new Error(`[${label}] la base no está vacía`);
  record(`ISOLATION_${label}`, true, `${DRIVER} PostgreSQL ${iso.version}, db=${iso.db}, tablas públicas=0`);
  const legacy = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name < TARGET)
    .map((d) => d.name)
    .sort();
  for (const name of legacy) await db.exec(readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8"));
  record(`LEGACY_CHAIN_${label}`, true, `${legacy.length} migraciones previas aplicadas`);
  return db;
}

const T1 = "00000000-0000-0000-0000-0000000000t1";
const T2 = "00000000-0000-0000-0000-0000000000t2";

const SEED = `
INSERT INTO runtime_tenants (id, name, slug, updated_at) VALUES
  ('${T1}', 'Synthetic Gym One', 'synthetic-one', now()),
  ('${T2}', 'Synthetic Gym Two', 'synthetic-two', now());
INSERT INTO gyms (id, tenant_id, name, slug, updated_at) VALUES
  ('${T1}', '${T1}', 'Synthetic Gym One', 'synthetic-one', now()),
  ('${T2}', '${T2}', 'Synthetic Gym Two', 'synthetic-two', now());
INSERT INTO branches (id, gym_id, tenant_id, name, updated_at) VALUES
  ('b1',  '${T1}', '${T1}', 'Sede A',  now()),
  ('b1b', '${T1}', '${T1}', 'Sede A2', now()),
  ('b2',  '${T2}', '${T2}', 'Sede Z',  now());
INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, role, updated_at) VALUES
  ('u-tr1', '${T1}', 'tr1@synthetic.invalid', 'x', 'Tr', 'One', 'trainer', now()),
  ('u-rc1', '${T1}', 'rc1@synthetic.invalid', 'x', 'Rc', 'One', 'reception', now()),
  ('u-tr2', '${T2}', 'tr2@synthetic.invalid', 'x', 'Tr', 'Two', 'trainer', now());
INSERT INTO trainers (id, gym_id, tenant_id, branch_id, user_id, first_name, last_name, updated_at) VALUES
  ('tr1',     '${T1}', '${T1}', 'b1',  'u-tr1', 'Tr', 'One',  now()),
  ('tr1b',    '${T1}', '${T1}', 'b1b', NULL,    'Tr', 'OneB', now()),
  ('tr-null', '${T1}', NULL,    'b1',  NULL,    'Tr', 'Null', now()),
  ('tr2',     '${T2}', '${T2}', 'b2',  'u-tr2', 'Tr', 'Two',  now()),
  -- filas heredadas inconsistentes (tenant ≠ tenant de su sede): aíslan la FK compuesta del trigger de sede
  ('tr1-in-b2', '${T1}', '${T1}', 'b2', NULL, 'Tr', 'X1', now()),
  ('tr2-in-b1', '${T2}', '${T2}', 'b1', NULL, 'Tr', 'X2', now());
INSERT INTO class_types (id, gym_id, tenant_id, name, updated_at) VALUES
  ('ct1', '${T1}', '${T1}', 'Funcional', now()),
  ('ct2', '${T2}', '${T2}', 'Yoga', now());
INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, is_personalized, updated_at) VALUES
  ('s1',    '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'Abierta 1',       '2030-01-07', '07:00', '08:00', 2, false, now()),
  ('s2',    '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'Sobrecupo',       '2030-01-07', '09:00', '10:00', 1, false, now()),
  ('s3',    '${T1}', NULL,    'b1', 'ct1', 'tr1', 'Sin tenant',      '2030-01-08', '07:00', '08:00', 5, false, now()),
  ('s-per', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'Personalizada H', '2030-01-09', '07:00', '08:00', 1, true,  now()),
  ('s4',    '${T2}', '${T2}', 'b2', 'ct2', 'tr2', 'Otra org',        '2030-01-07', '07:00', '08:00', 3, false, now());
INSERT INTO clients (id, gym_id, tenant_id, branch_id, first_name, last_name, updated_at) VALUES
  ('c1',     '${T1}', '${T1}', 'b1', 'A', 'A', now()),
  ('c2',     '${T1}', '${T1}', 'b1', 'B', 'B', now()),
  ('c3',     '${T1}', '${T1}', 'b1', 'C', 'C', now()),
  ('c-null', '${T1}', NULL,    'b1', 'N', 'N', now()),
  ('c4',     '${T2}', '${T2}', 'b2', 'Z', 'Z', now());
INSERT INTO membership_plans (id, gym_id, tenant_id, name, duration_days, sessions_limit, price, updated_at) VALUES
  ('p1', '${T1}', '${T1}', 'Mensual', 30, 12, 30.00, now()),
  ('p2', '${T2}', '${T2}', 'Mensual Z', 30, NULL, 30.00, now());
INSERT INTO client_memberships (id, gym_id, tenant_id, branch_id, client_id, membership_plan_id, start_date, end_date, price_at_sale, final_amount, payment_status, updated_at) VALUES
  ('m1',     '${T1}', '${T1}', 'b1', 'c1',     'p1', '2029-12-01', '2030-12-31', 30, 30, 'paid', now()),
  ('m2',     '${T1}', '${T1}', 'b1', 'c2',     'p1', '2029-12-01', '2030-12-31', 30, 30, 'paid', now()),
  ('m-null', '${T1}', NULL,    'b1', 'c-null', 'p1', '2029-12-01', '2030-12-31', 30, 30, 'paid', now()),
  ('m4',     '${T2}', '${T2}', 'b2', 'c4',     'p2', '2029-12-01', '2030-12-31', 30, 30, 'paid', now());
INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, updated_at) VALUES
  ('bk-s1-c1',   's1',    'c1',     'confirmed',  now()),
  ('bk-s1-c2',   's1',    'c2',     'cancelled',  now()),
  ('bk-s1-c4',   's1',    'c4',     'confirmed',  now()),
  ('bk-s2-c1',   's2',    'c1',     'confirmed',  now()),
  ('bk-s2-c2',   's2',    'c2',     'confirmed',  now()),
  ('bk-s2-c3',   's2',    'c3',     'waitlisted', now()),
  ('bk-s3-cn',   's3',    'c-null', 'confirmed',  now()),
  ('bk-sper-c1', 's-per', 'c1',     'confirmed',  now()),
  ('bk-s4-c4',   's4',    'c4',     'confirmed',  now());
INSERT INTO class_attendance (id, scheduled_class_id, client_id, attendance_status, updated_at) VALUES
  ('at-s1-c1', 's1', 'c1', 'attended', now()),
  ('at-s2-c3', 's2', 'c3', 'attended', now()),
  ('at-s4-c4', 's4', 'c4', 'attended', now());
INSERT INTO gym_settings (id, gym_id, tenant_id, updated_at) VALUES
  ('gs1', '${T1}', '${T1}', now());
`;

const LEGACY_TABLES = [
  "clients", "membership_plans", "client_memberships", "trainers", "class_types", "branches",
  "scheduled_classes", "class_bookings", "class_attendance", "gym_settings",
];

async function dataSnapshot(db) {
  const snap = {};
  for (const t of LEGACY_TABLES) {
    const r = await db.query(`SELECT to_jsonb(x) AS j FROM "${t}" x ORDER BY x."id"`);
    snap[t] = r.rows.map((row) => row.j);
  }
  return snap;
}

async function schemaSnapshot(db) {
  const q = async (sql) => (await db.query(sql)).rows.map((r) => JSON.stringify(r)).join("\n");
  return {
    columns: await q(`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
                        FROM information_schema.columns WHERE table_schema = 'public'
                       ORDER BY table_name, column_name`),
    indexes: await q(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`),
    constraints: await q(`SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
                            FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY conname`),
    enums: await q(`SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
                      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname ORDER BY t.typname`),
    triggers: await q(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`),
    functions: await q(`SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY proname`),
  };
}
const sameSchema = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);

async function runPreflight(db, phase) {
  const out = {};
  for (const c of GYM_BOOKINGS_PREFLIGHT_CHECKS.filter((x) => x.phase === phase)) out[c.id] = await val(db, c.countSql);
  return out;
}

// ── Protocolo de referencia de idempotencia por comando ───────────────
// NO es el servicio de 2B: es la secuencia mínima que fija el contrato
// (booking-idempotency.ts) para demostrarla contra la BD.
async function runCommand(db, { tenant, key, command, payload, effects }) {
  const fingerprint = idem.commandFingerprint(command, payload);
  await db.exec("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [idem.idempotencyLockText(tenant, key)]);
    const existing = await one(
      db,
      `SELECT id, command::text AS command, request_fingerprint, result FROM gym_booking_operations
        WHERE tenant_id = $1 AND idempotency_key = $2`,
      [tenant, key]
    );
    const decision = idem.decideIdempotency(existing ?? null, command, fingerprint);
    if (decision.kind !== "EXECUTE") {
      await db.exec("COMMIT");
      return decision;
    }
    const opId = `op-${tenant.slice(-2)}-${key}`;
    const { targetId, result, events } = await effects(db, opId);
    await db.query(
      `INSERT INTO gym_booking_operations (id, tenant_id, command, idempotency_key, request_fingerprint, target_id, result)
       VALUES ($1, $2, $3::"GymBookingCommand", $4, $5, $6, $7::jsonb)`,
      [opId, tenant, command, key, fingerprint, targetId, JSON.stringify(result)]
    );
    for (const e of events) {
      await db.query(
        `INSERT INTO class_booking_events (id, tenant_id, operation_id, booking_id, scheduled_class_id, client_id, event_type, to_status, cancellation_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7::"GymBookingEventType", $8::"BookingStatus", $9::"GymBookingCancellationType")`,
        [`${opId}-ev-${e.booking}`, tenant, opId, e.booking, e.session, e.client, e.type, e.to, e.cancellation ?? null]
      );
    }
    await db.exec("COMMIT");
    return { kind: "EXECUTE", operationId: opId, result };
  } catch (err) {
    await db.exec("ROLLBACK").catch(() => {});
    throw err;
  }
}

// ═════════════════════════════════════════════════════════════════════
// ESCENARIO A — atomicidad, migración, invariantes, rutas heredadas
// ═════════════════════════════════════════════════════════════════════
console.log(`\n══ ESCENARIO A (${DRIVER}): atomicidad + migración + invariantes ══`);
const db = await freshSyntheticDb("A");
await db.exec(SEED);

// Prisma aplica el archivo como un solo mensaje (transacción implícita); el
// archivo no debe contener control de transacción (ver encabezado de la migración).
record("MIGRATION_HAS_NO_TRANSACTION_CONTROL",
  !splitStatements(targetSql).some((st) => /^(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION|SAVEPOINT)\b/i.test(st) || /\bCONCURRENTLY\b/i.test(st)));

// A.1 Falla inyectada: script completo (un mensaje) y sentencia por sentencia.
const schemaPre = await schemaSnapshot(db);
const dataPre = await dataSnapshot(db);
const faultLate = `${targetSql}\nSELECT 1/0; -- FALLA INYECTADA (después de todo el DDL y los triggers)\n`;
const part2 = targetSql.indexOf("-- PARTE 2");
const faultMid = `${targetSql.slice(0, part2)}SELECT 1/0; -- FALLA INYECTADA\n${targetSql.slice(part2)}`;
await expectError(db, "FAULT_LATE_SINGLE_SCRIPT_FAILS", faultLate, /division by zero/);
record("FAULT_LATE_SINGLE_SCRIPT_NO_PARTIAL_SCHEMA", sameSchema(schemaPre, await schemaSnapshot(db)));
await expectError(db, "FAULT_MID_SINGLE_SCRIPT_FAILS", faultMid, /division by zero/);
record("FAULT_MID_SINGLE_SCRIPT_NO_PARTIAL_SCHEMA", sameSchema(schemaPre, await schemaSnapshot(db)));

// Equivalente a `psql -1 -v ON_ERROR_STOP=1`: el EJECUTOR abre la transacción.
async function runStatementByStatement(sql) {
  let firstError = null;
  await db.exec("BEGIN");
  for (const stmt of splitStatements(sql)) {
    try {
      await db.exec(stmt);
    } catch (e) {
      firstError ??= e.message;
    }
  }
  await db.exec("ROLLBACK").catch(() => {});
  return firstError;
}
const sbsErr = await runStatementByStatement(faultMid);
record("FAULT_MID_RUNNER_SINGLE_TRANSACTION_NO_PARTIAL_SCHEMA",
  sameSchema(schemaPre, await schemaSnapshot(db)), `primer error: ${String(sbsErr).split("\n")[0]}`);
record("FAULT_DATA_UNCHANGED", JSON.stringify(dataPre) === JSON.stringify(await dataSnapshot(db)));

// Contrafactual: un ejecutor sentencia por sentencia SIN transacción propia SÍ
// deja esquema parcial → por eso está prohibido (encabezado de la migración).
{
  const dbX = await freshSyntheticDb("X");
  for (const stmt of splitStatements(faultMid)) await dbX.exec(stmt).catch(() => {});
  const partial = await val(dbX, `SELECT COUNT(*)::int FROM pg_type WHERE typname = 'GymClientModality'`);
  record("INFO_STATEMENT_RUNNER_WITHOUT_TX_LEAVES_PARTIAL_SCHEMA", partial === 1,
    "documenta la prohibición de ejecutores sentencia por sentencia sin -1");
  await dbX.close();
}

const pre = await runPreflight(db, "pre");
const expectedPre = {
  PRE_CROSS_TENANT_BOOKINGS: 1,
  PRE_CROSS_TENANT_ATTENDANCE: 0,
  PRE_CROSS_TENANT_MEMBERSHIPS: 0,
  PRE_CROSS_BRANCH_BOOKINGS: 1,
  PRE_CLASSES_OVER_CAPACITY: 1,
  PRE_LEGACY_PERSONALIZED_CLASSES: 1,
  PRE_LEGACY_PERSONALIZED_CLASSES_WITH_BOOKINGS: 1,
  PRE_NULL_TENANT_CLIENTS: 1,
  PRE_NULL_TENANT_TRAINERS: 1,
  PRE_NULL_TENANT_SCHEDULED_CLASSES: 1,
  PRE_ATTENDANCE_WITHOUT_CONFIRMED_BOOKING: 1,
  PRE_GYMS_WITHOUT_SETTINGS: 1,
  PRE_BOOKINGS_WITHOUT_RESOLVABLE_TENANT: 1,
  PRE_TRAINER_BRANCH_TENANT_MISMATCH: 2, // tr1-in-b2, tr2-in-b1 (historial inconsistente)
  PRE_DB_TIMEZONE_MARGIN_UNSAFE: 0,
};
for (const [id, n] of Object.entries(expectedPre)) record(`PREFLIGHT_DETECTS_${id}`, pre[id] === n, `n=${pre[id]} (esperado ${n})`);

const legacyBefore = await dataSnapshot(db);
const t0 = Date.now();
await expectOk(db, "MIGRATION_APPLIES", targetSql);
record("MIGRATION_DURATION", true, `${Date.now() - t0} ms en datos sintéticos`);

const legacyAfter = await dataSnapshot(db);
const changed = [];
for (const t of LEGACY_TABLES) {
  legacyBefore[t].forEach((row, i) => {
    for (const k of Object.keys(row)) {
      if (JSON.stringify(row[k]) !== JSON.stringify(legacyAfter[t][i][k])) changed.push(`${t}.${row.id}.${k}`);
    }
  });
}
record("LEGACY_VALUES_UNCHANGED", changed.length === 0, changed.length ? changed.join(", ") : "todas las columnas heredadas idénticas");

await expectEq(db, "DEFAULT_CLIENTS_NORMAL", `SELECT COUNT(*)::int FROM clients WHERE modality <> 'NORMAL'`, 0);
await expectEq(db, "DEFAULT_MEMBERSHIPS_NO_RETRO_CONSUMPTION",
  `SELECT COUNT(*)::int FROM client_memberships WHERE modality <> 'NORMAL' OR sessions_total IS NOT NULL OR sessions_used <> 0 OR assigned_trainer_id IS NOT NULL`, 0);
await expectEq(db, "DEFAULT_CLASSES_OPEN_INCL_IS_PERSONALIZED", `SELECT COUNT(*)::int FROM scheduled_classes WHERE session_kind <> 'OPEN'`, 0);
await expectEq(db, "DEFAULT_BOOKINGS_NOT_APPLICABLE",
  `SELECT COUNT(*)::int FROM class_bookings WHERE consumption <> 'NOT_APPLICABLE' OR channel IS NOT NULL OR client_membership_id IS NOT NULL`, 0);
await expectEq(db, "BACKFILL_BOOKED_COUNT", `SELECT jsonb_object_agg(id, booked_count ORDER BY id) FROM scheduled_classes`,
  { s1: 2, s2: 2, s3: 1, s4: 1, "s-per": 1 });
await expectEq(db, "BACKFILL_NULL_TENANT_NOT_INVENTED", `SELECT tenant_id FROM class_bookings WHERE id = 'bk-s3-cn'`, null);
await expectEq(db, "BACKFILL_ATTENDANCE_LINKED", `SELECT booking_id FROM class_attendance WHERE id = 'at-s1-c1'`, "bk-s1-c1");

const post = await runPreflight(db, "post");
for (const id of ["POST_BOOKED_COUNT_DRIFT", "POST_SESSIONS_USED_DRIFT", "POST_MISSING_TRIGGERS", "POST_MISSING_CHECKS", "POST_MISSING_FOREIGN_KEYS", "POST_LEGACY_DEFAULTS_ALTERED"]) {
  record(`POSTFLIGHT_${id}_ZERO`, post[id] === 0, `n=${post[id]}`);
}

// ── Rutas de escritura heredadas ──
console.log("\n── Rutas heredadas ──");
await expectOk(db, "LEGACY_STAFF_CREATE_BOOKING",
  `INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, updated_at) VALUES ('bk-s1-c3', 's1', 'c3', 'confirmed', now())`);
await expectEq(db, "LEGACY_CREATE_COUNTS_SEAT", `SELECT booked_count FROM scheduled_classes WHERE id = 's1'`, 3);
await expectOk(db, "LEGACY_REACTIVATION_OVER_CAPACITY_STILL_ALLOWED",
  `UPDATE class_bookings SET booking_status = 'confirmed', booked_at = now(), updated_at = now() WHERE id = 'bk-s1-c2'`);
await expectEq(db, "LEGACY_REACTIVATION_COUNTED", `SELECT booked_count FROM scheduled_classes WHERE id = 's1'`, 4);
await expectOk(db, "LEGACY_CANCEL_ON_CROSS_TENANT_HISTORICAL_ROW",
  `UPDATE class_bookings SET booking_status = 'cancelled', updated_at = now() WHERE id = 'bk-s1-c4'`);
await expectOk(db, "LEGACY_ATTENDANCE_UPSERT",
  `INSERT INTO class_attendance (id, scheduled_class_id, client_id, attendance_status, updated_at) VALUES ('at-s1-c3', 's1', 'c3', 'attended', now())
   ON CONFLICT (scheduled_class_id, client_id) DO UPDATE SET attendance_status = EXCLUDED.attendance_status, updated_at = now()`);
await expectOk(db, "LEGACY_CLASS_WITH_TRAINER_OF_OTHER_BRANCH_STILL_ALLOWED",
  `INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, updated_at)
   VALUES ('s5', '${T1}', '${T1}', 'b1', 'ct1', 'tr1b', 'SA asigna otra sede', '2030-02-01', '07:00', '08:00', 10, now())`);
await expectOk(db, "LEGACY_CLASS_UPDATE_BRANCH_AND_CAPACITY",
  `UPDATE scheduled_classes SET branch_id = 'b1b', capacity = 1, updated_at = now() WHERE id = 's5'`);
await expectOk(db, "LEGACY_MEMBERSHIP_INSERT_AND_BRANCH_UPDATE",
  `INSERT INTO client_memberships (id, gym_id, tenant_id, branch_id, client_id, membership_plan_id, start_date, end_date, price_at_sale, final_amount, updated_at)
     VALUES ('m3', '${T1}', '${T1}', 'b1', 'c3', 'p1', '2030-01-01', '2030-01-31', 30, 30, now());
   UPDATE client_memberships SET branch_id = 'b1b', status = 'active', updated_at = now() WHERE id = 'm3';`);
await expectOk(db, "LEGACY_MEMBERSHIP_NULL_TENANT_UPDATE", `UPDATE client_memberships SET notes = 'x', branch_id = 'b1', updated_at = now() WHERE id = 'm-null'`);
await expectOk(db, "LEGACY_SETTINGS_UPSERT",
  `INSERT INTO gym_settings (id, gym_id, tenant_id, updated_at) VALUES ('gs2', '${T2}', '${T2}', now())
   ON CONFLICT (gym_id) DO UPDATE SET client_code_prefix = 'Z', updated_at = now()`);
await expectOk(db, "LEGACY_PURGE_ORDER_BOOKINGS_THEN_ATTENDANCE",
  `BEGIN;
   DELETE FROM class_bookings WHERE scheduled_class_id = 's1';
   DELETE FROM class_attendance WHERE scheduled_class_id = 's1';
   DELETE FROM scheduled_classes WHERE id = 's1';
   COMMIT;`);
await expectOk(db, "LEGACY_MEMBERSHIP_DELETE_WITHOUT_LINKED_BOOKINGS", `DELETE FROM client_memberships WHERE id = 'm3'`);

// ── Consumo y contadores ──
console.log("\n── Consumo y contadores ──");
await db.exec(`
  INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, updated_at) VALUES
    ('sp1', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'P1', '2030-03-01', '07:00', '08:00', 3, 'PERSONALIZED', now()),
    ('sp2', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'P2', '2030-03-02', '07:00', '08:00', 3, 'PERSONALIZED', now()),
    ('sp3', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'P3', '2030-03-03', '07:00', '08:00', 3, 'PERSONALIZED', now());
  INSERT INTO client_memberships (id, gym_id, tenant_id, branch_id, client_id, membership_plan_id, start_date, end_date, price_at_sale, final_amount, payment_status, modality, sessions_total, assigned_trainer_id, updated_at) VALUES
    ('mp',  '${T1}', '${T1}', 'b1', 'c1', 'p1', '2030-01-01', '2030-12-31', 50, 50, 'paid', 'PERSONALIZED', 2, 'tr1', now()),
    ('mp9', '${T1}', '${T1}', 'b1', 'c1', 'p1', '2030-01-01', '2030-12-31', 50, 50, 'paid', 'PERSONALIZED', NULL, 'tr1', now());
`);
const book = (id, s, c, m) =>
  `INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, client_membership_id, consumption, channel, updated_at)
   VALUES ('${id}', '${s}', '${c}', 'confirmed', ${m ? `'${m}'` : "NULL"}, 'CONSUMED', 'PORTAL', now())`;
const counters = (m, s) =>
  `SELECT (SELECT sessions_used FROM client_memberships WHERE id='${m}') || '/' || (SELECT booked_count FROM scheduled_classes WHERE id='${s}')`;
await expectOk(db, "BOOK_CONSUMES", book("bp1", "sp1", "c1", "mp"));
await expectEq(db, "BOOK_CONSUMES_COUNTERS", counters("mp", "sp1"), "1/1");
await expectError(db, "REJECT_MEMBERSHIP_OF_OTHER_CLIENT", book("bp-x", "sp1", "c2", "mp"), /GYM_MEMBERSHIP_CLIENT_MISMATCH/);
await expectError(db, "REJECT_CONSUMED_WITHOUT_MEMBERSHIP", book("bp-y", "sp1", "c2", null), /class_bookings_consumption_membership_chk/);
await expectOk(db, "CANCEL_IN_POLICY_RELEASES",
  `UPDATE class_bookings SET booking_status='cancelled', consumption='RELEASED', cancellation_type='CLIENT_IN_POLICY', cancelled_at=now(), updated_at=now() WHERE id='bp1'`);
await expectEq(db, "CANCEL_IN_POLICY_COUNTERS", counters("mp", "sp1"), "0/0");
await expectOk(db, "REACTIVATE_FROM_RELEASED", `UPDATE class_bookings SET booking_status='confirmed', consumption='CONSUMED', cancellation_type=NULL, cancelled_at=NULL WHERE id='bp1'`);
await expectOk(db, "LATE_CANCEL_KEEPS_CONSUMPTION", `UPDATE class_bookings SET booking_status='cancelled', cancellation_type='CLIENT_LATE', cancelled_at=now() WHERE id='bp1'`);
await expectEq(db, "LATE_CANCEL_COUNTERS", counters("mp", "sp1"), "1/0");
await expectOk(db, "REACTIVATE_LATE_NO_DOUBLE_CONSUMPTION", `UPDATE class_bookings SET booking_status='confirmed', cancellation_type=NULL, cancelled_at=NULL WHERE id='bp1'`);
await expectEq(db, "REACTIVATE_LATE_COUNTERS", counters("mp", "sp1"), "1/1");
await expectOk(db, "BOOK_SECOND_SESSION", book("bp2", "sp2", "c1", "mp"));
await expectError(db, "REJECT_EXHAUSTED_MEMBERSHIP", book("bp3", "sp3", "c1", "mp"), /client_memberships_sessions_chk/);
await expectEq(db, "EXHAUSTED_STATEMENT_ATOMIC", counters("mp", "sp3"), "2/0");
await expectError(db, "GUARD_BOOKED_COUNT_DIRECT_UPDATE", `UPDATE scheduled_classes SET booked_count = 99 WHERE id='sp1'`, /GYM_COUNTER_READONLY/);
await expectError(db, "GUARD_SESSIONS_USED_DIRECT_UPDATE", `UPDATE client_memberships SET sessions_used = 0 WHERE id='mp'`, /GYM_COUNTER_READONLY/);
await expectOk(db, "GUARD_RECONCILE_WITH_EXPLICIT_GUC",
  `BEGIN; SELECT set_config('zolvi.gym_counters_reconcile', 'on', true);
   UPDATE scheduled_classes s SET booked_count = (SELECT COUNT(*) FROM class_bookings b WHERE b.scheduled_class_id = s.id AND b.booking_status = 'confirmed');
   COMMIT;`);
await expectError(db, "GUARD_RECONCILE_GUC_IS_TRANSACTION_LOCAL", `UPDATE scheduled_classes SET booked_count = 42 WHERE id='sp1'`, /GYM_COUNTER_READONLY/);

// ═════════════════════════════════════════════════════════════════════
// B — Aislamiento tenant/sede de TODAS las referencias nuevas (dos tenants)
// ═════════════════════════════════════════════════════════════════════
console.log("\n── B: aislamiento tenant / sede ──");
const series = (id, tenant, loc, ct, tr, kind = "GROUP") =>
  `INSERT INTO class_series (id, tenant_id, location_id, class_type_id, trainer_id, session_kind, title, weekday, start_time, end_time, valid_from, updated_at)
   VALUES ('${id}', '${tenant}', '${loc}', '${ct}', '${tr}', '${kind}', 'Serie', 1, '07:00', '08:00', '2030-01-01', now())`;
await expectOk(db, "B_SERIES_SAME_TENANT_SAME_BRANCH", series("se1", T1, "b1", "ct1", "tr1"));
await expectError(db, "B_SERIES_LOCATION_OTHER_TENANT", series("x", T1, "b2", "ct1", "tr1-in-b2"), /class_series_location_id_tenant_id_fkey/);
await expectError(db, "B_SERIES_TRAINER_OTHER_TENANT", series("x", T1, "b1", "ct1", "tr2-in-b1"), /class_series_trainer_id_tenant_id_fkey/);
await expectError(db, "B_SERIES_CLASS_TYPE_OTHER_TENANT", series("x", T1, "b1", "ct2", "tr1"), /class_series_class_type_id_tenant_id_fkey/);
await expectError(db, "B_SERIES_TRAINER_NULL_TENANT_FAILS_CLOSED", series("x", T1, "b1", "ct1", "tr-null"), /class_series_trainer_id_tenant_id_fkey/);
await expectError(db, "B_SERIES_TRAINER_OTHER_BRANCH", series("x", T1, "b1", "ct1", "tr1b"), /GYM_LOCATION_MISMATCH/);
await expectError(db, "B_SERIES_UPDATE_TO_OTHER_TENANT_TRAINER", `UPDATE class_series SET trainer_id = 'tr2' WHERE id = 'se1'`, /fkey|GYM_LOCATION_MISMATCH/);
await expectError(db, "B_SERIES_TENANT_WITHOUT_RUNTIME_TENANT",
  series("x", "00000000-0000-0000-0000-00000000none", "b1", "ct1", "tr1"), /fkey/);

const timeOff = (id, tenant, loc, tr) =>
  `INSERT INTO trainer_time_off (id, tenant_id, location_id, trainer_id, starts_on, ends_on, updated_at)
   VALUES ('${id}', '${tenant}', '${loc}', '${tr}', '2030-01-01', '2030-01-02', now())`;
await expectOk(db, "B_TIME_OFF_SAME_TENANT", timeOff("to1", T1, "b1", "tr1"));
await expectError(db, "B_TIME_OFF_TRAINER_OTHER_TENANT", timeOff("x", T1, "b1", "tr2-in-b1"), /trainer_time_off_trainer_id_tenant_id_fkey/);
await expectError(db, "B_TIME_OFF_LOCATION_OTHER_TENANT", timeOff("x", T1, "b2", "tr1-in-b2"), /trainer_time_off_location_id_tenant_id_fkey/);
await expectError(db, "B_TIME_OFF_TRAINER_OTHER_BRANCH", timeOff("x", T1, "b1b", "tr1"), /GYM_LOCATION_MISMATCH/);
await expectOk(db, "B_LEGACY_TRAINER_BRANCH_MOVE_WITH_TIME_OFF_STILL_ALLOWED",
  `UPDATE trainers SET branch_id = 'b1b', updated_at = now() WHERE id = 'tr1b'`);

const activity = (id, tenant, loc) =>
  `INSERT INTO gym_activities (id, tenant_id, location_id, name, updated_at) VALUES ('${id}', '${tenant}', ${loc ? `'${loc}'` : "NULL"}, 'Act ${id}', now())`;
await expectOk(db, "B_ACTIVITY_ALL_BRANCHES", activity("act1", T1, null));
await expectOk(db, "B_ACTIVITY_BRANCH_B1B", activity("act1b", T1, "b1b"));
await expectOk(db, "B_ACTIVITY_TENANT_2", activity("act2", T2, null));
await expectError(db, "B_ACTIVITY_LOCATION_OTHER_TENANT", activity("x", T1, "b2"), /gym_activities_location_id_tenant_id_fkey/);

await expectOk(db, "B_SESSION_FROM_SERIES",
  `INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, series_id, updated_at)
   VALUES ('sg1', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'Grupal', '2030-01-07', '07:00', '08:00', 12, 'GROUP', 'se1', now())`);
await expectError(db, "B_SESSION_SERIES_OTHER_TENANT",
  `INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, series_id, updated_at)
   VALUES ('x', '${T2}', '${T2}', 'b2', 'ct2', 'tr2', 'x', '2030-01-08', '07:00', '08:00', 5, 'GROUP', 'se1', now())`, /GYM_TENANT_MISMATCH|scheduled_classes_series_id_tenant_id_fkey/);
await expectError(db, "B_SESSION_SERIES_WITH_NULL_TENANT",
  `INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, series_id, updated_at)
   VALUES ('x', '${T1}', NULL, 'b1', 'ct1', 'tr1', 'x', '2030-01-09', '07:00', '08:00', 5, 'GROUP', 'se1', now())`, /GYM_TENANT_MISMATCH/);
await expectError(db, "B_SESSION_SERIES_OTHER_BRANCH",
  `INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, series_id, updated_at)
   VALUES ('x', '${T1}', '${T1}', 'b1b', 'ct1', 'tr1', 'x', '2030-01-10', '07:00', '08:00', 5, 'GROUP', 'se1', now())`, /GYM_LOCATION_MISMATCH/);
await expectError(db, "B_SESSION_SERIES_KIND_MISMATCH",
  `INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, series_id, updated_at)
   VALUES ('x', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'x', '2030-01-11', '07:00', '08:00', 5, 'PERSONALIZED', 'se1', now())`, /GYM_SERIES_KIND_MISMATCH/);
await expectError(db, "B_LEGACY_SESSION_ATTACHED_TO_SERIES_WITH_NULL_TENANT", `UPDATE scheduled_classes SET series_id = 'se1' WHERE id = 's3'`, /GYM_TENANT_MISMATCH/);

await expectError(db, "B_MEMBERSHIP_TRAINER_OTHER_TENANT", `UPDATE client_memberships SET assigned_trainer_id = 'tr2-in-b1' WHERE id = 'm1'`, /GYM_TENANT_MISMATCH/);
await expectError(db, "B_MEMBERSHIP_TRAINER_OTHER_TENANT_FK_WITHOUT_TRIGGER",
  `BEGIN; ALTER TABLE client_memberships DISABLE TRIGGER gym_client_memberships_trainer_integrity_trg;
   UPDATE client_memberships SET assigned_trainer_id = 'tr2-in-b1' WHERE id = 'm1'; COMMIT;`, /client_memberships_assigned_trainer_id_tenant_id_fkey/);
await expectError(db, "B_MEMBERSHIP_TRAINER_WITH_NULL_TENANT", `UPDATE client_memberships SET assigned_trainer_id = 'tr1' WHERE id = 'm-null'`, /GYM_TENANT_MISMATCH/);
await expectError(db, "B_MEMBERSHIP_TRAINER_OTHER_BRANCH", `UPDATE client_memberships SET assigned_trainer_id = 'tr1b' WHERE id = 'm1'`, /GYM_LOCATION_MISMATCH/);
await expectError(db, "B_MEMBERSHIP_TRAINER_NULL_TENANT_TRAINER", `UPDATE client_memberships SET assigned_trainer_id = 'tr-null' WHERE id = 'm1'`, /GYM_TENANT_MISMATCH|fkey/);
await expectOk(db, "B_MEMBERSHIP_TRAINER_SAME_TENANT_BRANCH", `UPDATE client_memberships SET assigned_trainer_id = 'tr1' WHERE id = 'm2'`);

const sca = (id, tenant, s, a) =>
  `INSERT INTO scheduled_class_activities (id, tenant_id, scheduled_class_id, activity_id, activity_name) VALUES ('${id}', '${tenant}', '${s}', '${a}', 'snap')`;
await expectOk(db, "B_SESSION_ACTIVITY_OK", sca("sa1", T1, "sg1", "act1"));
await expectError(db, "B_SESSION_ACTIVITY_SESSION_OTHER_TENANT", sca("x", T1, "s4", "act1"), /scheduled_class_activities_scheduled_class_id_tenant_id_fkey/);
await expectError(db, "B_SESSION_ACTIVITY_ACTIVITY_OTHER_TENANT", sca("x", T1, "sg1", "act2"), /scheduled_class_activities_activity_id_tenant_id_fkey/);
await expectError(db, "B_SESSION_ACTIVITY_LEGACY_SESSION_NULL_TENANT", sca("x", T1, "s3", "act1"), /fkey/);
await expectError(db, "B_SESSION_ACTIVITY_OTHER_BRANCH", sca("x", T1, "sg1", "act1b"), /GYM_LOCATION_MISMATCH/);

await db.exec(`INSERT INTO class_attendance (id, scheduled_class_id, client_id, attendance_status, updated_at) VALUES ('at-sg1-c1', 'sg1', 'c1', 'attended', now())`);
const caa = (id, tenant, att, a) =>
  `INSERT INTO class_attendance_activities (id, tenant_id, attendance_id, activity_id, activity_name) VALUES ('${id}', '${tenant}', '${att}', '${a}', 'snap')`;
await expectOk(db, "B_ATTENDANCE_ACTIVITY_OK", caa("aa1", T1, "at-sg1-c1", "act1"));
await expectError(db, "B_ATTENDANCE_ACTIVITY_ATTENDANCE_OTHER_TENANT", caa("x", T1, "at-s4-c4", "act1"), /class_attendance_activities_attendance_id_tenant_id_fkey/);
await expectError(db, "B_ATTENDANCE_ACTIVITY_ACTIVITY_OTHER_TENANT", caa("x", T1, "at-sg1-c1", "act2"), /class_attendance_activities_activity_id_tenant_id_fkey/);
await expectError(db, "B_ATTENDANCE_ACTIVITY_OTHER_BRANCH", caa("x", T1, "at-sg1-c1", "act1b"), /GYM_LOCATION_MISMATCH/);

const mc = (id, tenant, client) =>
  `INSERT INTO client_modality_changes (id, tenant_id, client_id, from_modality, to_modality, reason) VALUES ('${id}', '${tenant}', '${client}', 'NORMAL', 'GROUP', 'x')`;
await expectOk(db, "B_MODALITY_CHANGE_OK", mc("mc1", T1, "c2"));
await expectError(db, "B_MODALITY_CHANGE_CLIENT_OTHER_TENANT", mc("x", T1, "c4"), /client_modality_changes_client_id_tenant_id_fkey/);
await expectError(db, "B_MODALITY_CHANGE_CLIENT_NULL_TENANT", mc("x", T1, "c-null"), /client_modality_changes_client_id_tenant_id_fkey/);
await expectError(db, "B_MODALITY_CHANGE_REJECT_UPDATE", `UPDATE client_modality_changes SET reason = 'y' WHERE id = 'mc1'`, /GYM_APPEND_ONLY/);

const fp = "a".repeat(64);
await db.exec(`
  INSERT INTO gym_booking_operations (id, tenant_id, command, idempotency_key, request_fingerprint, target_id, result) VALUES
    ('op-t1', '${T1}', 'BOOK_SESSION', 'key-t1-0001', '${fp}', 'sp1', '{}'),
    ('op-t2', '${T2}', 'BOOK_SESSION', 'key-t2-0001', '${fp}', 's4',  '{}');`);
const ev = (id, tenant, op, booking, session, client) =>
  `INSERT INTO class_booking_events (id, tenant_id, operation_id, booking_id, scheduled_class_id, client_id, event_type)
   VALUES ('${id}', '${tenant}', '${op}', '${booking}', '${session}', '${client}', 'BOOKED')`;
await expectOk(db, "B_EVENT_OK", ev("e1", T1, "op-t1", "bp1", "sp1", "c1"));
await expectError(db, "B_EVENT_BOOKING_OTHER_TENANT", ev("x", T1, "op-t1", "bk-s4-c4", "s4", "c4"), /class_booking_events_booking_id_tenant_id_scheduled_class__fkey/);
await expectError(db, "B_EVENT_OPERATION_OTHER_TENANT", ev("x", T1, "op-t2", "bp2", "sp2", "c1"), /class_booking_events_operation_id_tenant_id_fkey/);
await expectError(db, "B_EVENT_SESSION_MISMATCH", ev("x", T1, "op-t1", "bp2", "sp1", "c1"), /class_booking_events_booking_id_tenant_id_scheduled_class__fkey/);
await expectError(db, "B_EVENT_CLIENT_MISMATCH", ev("x", T1, "op-t1", "bp2", "sp2", "c2"), /class_booking_events_booking_id_tenant_id_scheduled_class__fkey/);
await expectError(db, "B_EVENT_LEGACY_BOOKING_NULL_TENANT", ev("x", T1, "op-t1", "bk-s3-cn", "s3", "c-null"), /fkey/);
await expectError(db, "B_BOOKING_TENANT_MISMATCH", `INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, updated_at) VALUES ('x', 's2', 'c4', 'confirmed', now())`, /GYM_TENANT_MISMATCH/);
await expectError(db, "B_ATTENDANCE_TENANT_MISMATCH_H5", `INSERT INTO class_attendance (id, scheduled_class_id, client_id, attendance_status, updated_at) VALUES ('x', 's2', 'c4', 'attended', now())`, /GYM_TENANT_MISMATCH/);
await expectError(db, "B_BOOKING_MEMBERSHIP_OF_OTHER_TENANT_CLIENT", book("x", "sp1", "c3", "m4"), /GYM_MEMBERSHIP_CLIENT_MISMATCH|fkey/);

// ═════════════════════════════════════════════════════════════════════
// D — Idempotencia a nivel de comando
// ═════════════════════════════════════════════════════════════════════
console.log("\n── D: idempotencia por comando ──");
await expectError(db, "D_OPERATION_APPEND_ONLY_UPDATE", `UPDATE gym_booking_operations SET result = '{"x":1}' WHERE id = 'op-t1'`, /GYM_APPEND_ONLY/);
await expectError(db, "D_OPERATION_APPEND_ONLY_DELETE", `DELETE FROM gym_booking_operations WHERE id = 'op-t1'`, /GYM_APPEND_ONLY/);
await expectError(db, "D_OPERATION_SHAPE_CHECK",
  `INSERT INTO gym_booking_operations (id, tenant_id, command, idempotency_key, request_fingerprint, target_id, result) VALUES ('x', '${T1}', 'BOOK_SESSION', 'short', 'zz', 'sp1', '{}')`,
  /gym_booking_operations_shape_chk/);
await expectError(db, "D_DB_BACKSTOP_DUPLICATE_KEY_SAME_TENANT",
  `INSERT INTO gym_booking_operations (id, tenant_id, command, idempotency_key, request_fingerprint, target_id, result) VALUES ('x', '${T1}', 'BOOK_SESSION', 'key-t1-0001', '${fp}', 'sp1', '{}')`,
  /gym_booking_operations_tenant_id_idempotency_key_key/);

await db.exec(`
  INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, updated_at) VALUES
    ('sgd', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'Grupal D', '2030-04-01', '07:00', '08:00', 10, 'GROUP', now());
  INSERT INTO client_memberships (id, gym_id, tenant_id, branch_id, client_id, membership_plan_id, start_date, end_date, price_at_sale, final_amount, payment_status, modality, sessions_total, updated_at) VALUES
    ('mg1', '${T1}', '${T1}', 'b1', 'c1', 'p1', '2030-01-01', '2030-12-31', 40, 40, 'paid', 'GROUP', 8, now()),
    ('mg2', '${T1}', '${T1}', 'b1', 'c2', 'p1', '2030-01-01', '2030-12-31', 40, 40, 'paid', 'GROUP', 8, now()),
    ('mg3', '${T1}', '${T1}', 'b1', 'c3', 'p1', '2030-01-01', '2030-12-31', 40, 40, 'paid', 'GROUP', 8, now());`);

const bookCommand = (tenant, key, session, client, membership) => ({
  tenant, key, command: "BOOK_SESSION",
  payload: { scope: { tenantId: tenant, locationId: "b1" }, actor: { userId: "u-rc1", role: "reception" }, channel: "STAFF", sessionId: session, clientId: client, now: new Date() },
  effects: async (tx) => {
    const bid = `bk-${session}-${client}`;
    await tx.query(
      `INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, client_membership_id, consumption, channel, booked_by_user_id, updated_at)
       VALUES ($1, $2, $3, 'confirmed', $4, 'CONSUMED', 'STAFF', 'u-rc1', now())`, [bid, session, client, membership]);
    return { targetId: session, result: { bookingId: bid, status: "confirmed" }, events: [{ booking: bid, session, client, type: "BOOKED", to: "confirmed" }] };
  },
});
const evCount = () => val(db, `SELECT COUNT(*)::int FROM class_booking_events WHERE scheduled_class_id = 'sgd'`);

const r1 = await runCommand(db, bookCommand(T1, "order-0001", "sgd", "c1", "mg1"));
record("D1_FIRST_EXECUTION", r1.kind === "EXECUTE", JSON.stringify(r1.result));
const r1b = await runCommand(db, bookCommand(T1, "order-0001", "sgd", "c1", "mg1"));
const sortKeys = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
record("D1_SAME_COMMAND_TWICE_REPLAYS", r1b.kind === "REPLAY" && r1b.operationId === r1.operationId && sortKeys(r1b.result) === sortKeys(r1.result), `${r1b.kind} op=${r1b.operationId}`);
await expectEq(db, "D1_NO_DUPLICATE_EFFECTS", `SELECT (SELECT COUNT(*) FROM class_bookings WHERE scheduled_class_id='sgd') || '/' || (SELECT booked_count FROM scheduled_classes WHERE id='sgd') || '/' || (SELECT sessions_used FROM client_memberships WHERE id='mg1')`, "1/1/1");
record("D1_NO_DUPLICATE_EVENTS", (await evCount()) === 1);

// D2 — respuesta perdida: la tx confirmó, el cliente no recibió nada y reintenta.
const lost = await runCommand(db, bookCommand(T1, "order-0002", "sgd", "c2", "mg2"));
void lost; // respuesta "perdida"
const retry = await runCommand(db, bookCommand(T1, "order-0002", "sgd", "c2", "mg2"));
record("D2_RETRY_AFTER_LOST_RESPONSE_RETURNS_STORED_RESULT", retry.kind === "REPLAY" && retry.result.bookingId === "bk-sgd-c2");
await runCommand(db, bookCommand(T1, "order-0003", "sgd", "c3", "mg3"));
await expectEq(db, "D2_STATE_AFTER_RETRY", `SELECT booked_count FROM scheduled_classes WHERE id='sgd'`, 3);

// D3 — cancelación masiva: 1 operación, N eventos.
const cancelSession = (tenant, key, reason = "Entrenador ausente") => ({
  tenant, key, command: "CANCEL_SESSION",
  payload: { scope: { tenantId: tenant, locationId: "b1" }, actor: { userId: "u-rc1", role: "branch_admin" }, sessionId: "sgd", reason },
  effects: async (tx) => {
    const { rows } = await tx.query(`SELECT id, client_id FROM class_bookings WHERE scheduled_class_id = 'sgd' AND booking_status = 'confirmed' ORDER BY id`);
    await tx.query(`UPDATE class_bookings SET booking_status='cancelled', consumption='RELEASED', cancellation_type='SESSION_CANCELLED', cancelled_at=now(), cancel_reason=$1
                     WHERE scheduled_class_id = 'sgd' AND booking_status = 'confirmed'`, [reason]);
    await tx.query(`UPDATE scheduled_classes SET status='cancelled', cancelled_at=now(), cancel_reason=$1 WHERE id='sgd'`, [reason]);
    return {
      targetId: "sgd",
      result: { released: rows.map((r) => r.id) },
      events: rows.map((r) => ({ booking: r.id, session: "sgd", client: r.client_id, type: "SESSION_CANCELLED", to: "cancelled", cancellation: "SESSION_CANCELLED" })),
    };
  },
});
const c1 = await runCommand(db, cancelSession(T1, "cancel-sgd-01"));
record("D3_MASS_CANCEL_EXECUTES", c1.kind === "EXECUTE" && c1.result.released.length === 3, JSON.stringify(c1.result));
await expectEq(db, "D3_ONE_OPERATION_N_EVENTS",
  `SELECT (SELECT COUNT(*) FROM class_booking_events WHERE operation_id = '${c1.operationId}') || '/' || (SELECT COUNT(*) FROM gym_booking_operations WHERE idempotency_key = 'cancel-sgd-01')`, "3/1");
await expectEq(db, "D3_SEATS_AND_SESSIONS_RELEASED",
  `SELECT (SELECT booked_count FROM scheduled_classes WHERE id='sgd') || '/' || (SELECT SUM(sessions_used) FROM client_memberships WHERE id IN ('mg1','mg2','mg3'))`, "0/0");
const c1b = await runCommand(db, cancelSession(T1, "cancel-sgd-01"));
record("D3_MASS_CANCEL_RETRY_REPLAYS", c1b.kind === "REPLAY" && c1b.operationId === c1.operationId);
record("D3_MASS_CANCEL_NO_EXTRA_EVENTS", (await evCount()) === 6, `eventos sgd=${await evCount()} (3 BOOKED + 3 SESSION_CANCELLED)`);
await expectError(db, "D3_DUPLICATE_EVENT_SAME_OPERATION_BOOKING",
  ev(`dup`, T1, c1.operationId, "bk-sgd-c1", "sgd", "c1"), /class_booking_events_operation_id_booking_id_key/);

// D4 — misma key, contenido distinto.
const conflict = await runCommand(db, cancelSession(T1, "cancel-sgd-01", "Otro motivo"));
record("D4_SAME_KEY_DIFFERENT_CONTENT_CONFLICT", conflict.kind === "CONFLICT" && conflict.code === "IDEMPOTENCY_KEY_REUSED");
const conflict2 = await runCommand(db, bookCommand(T1, "order-0001", "sgd", "c2", "mg2"));
record("D4_SAME_KEY_OTHER_COMMAND_TARGET_CONFLICT", conflict2.kind === "CONFLICT");
record("D4_CONFLICT_HAS_NO_EFFECTS", (await evCount()) === 6);

// D5 — distintos tenants con la misma key.
await db.exec(`
  INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, updated_at)
    VALUES ('sgz', '${T2}', '${T2}', 'b2', 'ct2', 'tr2', 'Grupal Z', '2030-04-01', '07:00', '08:00', 10, 'GROUP', now());
  INSERT INTO client_memberships (id, gym_id, tenant_id, branch_id, client_id, membership_plan_id, start_date, end_date, price_at_sale, final_amount, payment_status, modality, sessions_total, updated_at)
    VALUES ('mgz', '${T2}', '${T2}', 'b2', 'c4', 'p2', '2030-01-01', '2030-12-31', 40, 40, 'paid', 'GROUP', 8, now());`);
const t2 = await runCommand(db, { ...bookCommand(T2, "order-0001", "sgz", "c4", "mgz") });
record("D5_SAME_KEY_OTHER_TENANT_EXECUTES_INDEPENDENTLY", t2.kind === "EXECUTE" && t2.operationId !== r1.operationId);
await expectEq(db, "D5_BOTH_OPERATIONS_EXIST", `SELECT COUNT(*)::int FROM gym_booking_operations WHERE idempotency_key = 'order-0001'`, 2);

// D6 — reintento concurrente real (solo driver pg: dos conexiones).
if (db.extraConnection) {
  const other = await db.extraConnection();
  await db.exec(`INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, updated_at)
                 VALUES ('sgc', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'Grupal C', '2030-05-01', '07:00', '08:00', 10, 'GROUP', now())`);
  const [a, b] = await Promise.all([
    runCommand(db, bookCommand(T1, "order-conc-01", "sgc", "c1", "mg1")),
    runCommand(other, bookCommand(T1, "order-conc-01", "sgc", "c1", "mg1")),
  ]);
  const kinds = [a.kind, b.kind].sort().join("+");
  record("D6_CONCURRENT_SAME_KEY_ONE_EXECUTE_ONE_REPLAY", kinds === "EXECUTE+REPLAY", kinds);
  await expectEq(db, "D6_CONCURRENT_SINGLE_EFFECT",
    `SELECT (SELECT COUNT(*) FROM class_bookings WHERE scheduled_class_id='sgc') || '/' || (SELECT COUNT(*) FROM class_booking_events WHERE scheduled_class_id='sgc')`, "1/1");
} else {
  skips.push("D6_CONCURRENT_SAME_KEY");
  console.log("SKIP  D6_CONCURRENT_SAME_KEY  — pglite es una sola conexión: se certifica con --driver=pg");
}

const postFinal = await runPreflight(db, "post");
record("FINAL_NO_COUNTER_DRIFT", postFinal.POST_BOOKED_COUNT_DRIFT === 0 && postFinal.POST_SESSIONS_USED_DRIFT === 0,
  `booked_count drift=${postFinal.POST_BOOKED_COUNT_DRIFT}, sessions_used drift=${postFinal.POST_SESSIONS_USED_DRIFT}`);
await db.close();

// ═════════════════════════════════════════════════════════════════════
// P — Integridad dinámica: mutación posterior del PADRE
// ═════════════════════════════════════════════════════════════════════
console.log(`\n══ ESCENARIO P (${DRIVER}): mutación posterior del padre ══`);
const dbP = await freshSyntheticDb("P");
await dbP.exec(SEED);
await dbP.exec(targetSql);
const trainer = (id, branch, tenant = T1) =>
  `INSERT INTO trainers (id, gym_id, tenant_id, branch_id, first_name, last_name, updated_at) VALUES ('${id}', '${tenant}', '${tenant}', '${branch}', 'P', '${id}', now());`;
const seriesP = (id, tr, { loc = "b1", status = "active", until = "NULL", kind = "GROUP" } = {}) =>
  `INSERT INTO class_series (id, tenant_id, location_id, class_type_id, trainer_id, session_kind, title, weekday, start_time, end_time, valid_from, valid_until, status, updated_at)
   VALUES ('${id}', '${T1}', '${loc}', 'ct1', '${tr}', '${kind}', 'Serie ${id}', 1, '07:00', '08:00', CURRENT_DATE - 60, ${until}, '${status}', now());`;
const timeOffP = (id, tr, from, to, loc = "b1") =>
  `INSERT INTO trainer_time_off (id, tenant_id, location_id, trainer_id, starts_on, ends_on, updated_at) VALUES ('${id}', '${T1}', '${loc}', '${tr}', ${from}, ${to}, now());`;
const loc = (table, id, col = "location_id") => `SELECT ${col} FROM ${table} WHERE id = '${id}'`;
await dbP.exec([
  trainer("tp-free", "b1"), trainer("tp-series", "b1"), trainer("tp-hist", "b1"), trainer("tp-exp", "b1"),
  trainer("tp-off", "b1"), trainer("tp-xt", "b1"), trainer("tp-mem", "b1"), trainer("tp-memhist", "b1"),
].join("\n"));

// 1. TRAINER → CLASS SERIES
await expectOk(dbP, "P1_TRAINER_MOVE_WITHOUT_DEPENDENTS", `UPDATE trainers SET branch_id = 'b1b' WHERE id = 'tp-free'`);
await dbP.exec(seriesP("ps-active", "tp-series"));
await expectError(dbP, "P1_TRAINER_MOVE_WITH_ACTIVE_SERIES_REJECTED",
  `UPDATE trainers SET branch_id = 'b1b' WHERE id = 'tp-series'`, /GYM_DEPENDENT_LOCATION_CONFLICT: trainer has active class_series/);
await expectEq(dbP, "P1_TRAINER_UNCHANGED_AFTER_REJECTION", loc("trainers", "tp-series", "branch_id"), "b1");
await expectOk(dbP, "P1_LEGACY_TRAINER_UPDATE_SAME_BRANCH_WITH_SERIES",
  `UPDATE trainers SET branch_id = 'b1', first_name = 'Editado', updated_at = now() WHERE id = 'tp-series'`);
await dbP.exec(seriesP("ps-inactive", "tp-hist", { status: "inactive" }));
await expectOk(dbP, "P1_TRAINER_MOVE_WITH_ONLY_INACTIVE_SERIES", `UPDATE trainers SET branch_id = 'b1b' WHERE id = 'tp-hist'`);
await expectEq(dbP, "P1_HISTORICAL_SERIES_KEEPS_LOCATION", loc("class_series", "ps-inactive"), "b1");
await expectOk(dbP, "P1_HISTORICAL_SERIES_EDIT_ALLOWED", `UPDATE class_series SET title = 'Histórica', updated_at = now() WHERE id = 'ps-inactive'`);
await expectError(dbP, "P1_REACTIVATE_INCONSISTENT_HISTORICAL_SERIES_REJECTED",
  `UPDATE class_series SET status = 'active' WHERE id = 'ps-inactive'`, /GYM_LOCATION_MISMATCH/);
await dbP.exec(seriesP("ps-expired", "tp-exp", { until: "CURRENT_DATE - 30" }));
await expectOk(dbP, "P1_TRAINER_MOVE_WITH_ONLY_EXPIRED_SERIES", `UPDATE trainers SET branch_id = 'b1b' WHERE id = 'tp-exp'`);
await expectError(dbP, "P1_EXTEND_INCONSISTENT_EXPIRED_SERIES_REJECTED",
  `UPDATE class_series SET valid_until = NULL WHERE id = 'ps-expired'`, /GYM_LOCATION_MISMATCH/);

// 2. TRAINER → TRAINER TIME OFF
await dbP.exec([
  timeOffP("to-future", "tp-off", "CURRENT_DATE + 5", "CURRENT_DATE + 7"),
  timeOffP("to-ongoing", "tp-off", "CURRENT_DATE - 1", "CURRENT_DATE + 1"),
  timeOffP("to-past", "tp-off", "CURRENT_DATE - 30", "CURRENT_DATE - 28"),
].join("\n"));
await expectOk(dbP, "P2_TRAINER_MOVE_WITH_TIME_OFF_ALLOWED", `UPDATE trainers SET branch_id = 'b1b' WHERE id = 'tp-off'`);
await expectEq(dbP, "P2_FUTURE_AND_ONGOING_TIME_OFF_FOLLOW_TRAINER",
  `SELECT string_agg(id || '=' || location_id, ',' ORDER BY id) FROM trainer_time_off WHERE trainer_id = 'tp-off'`,
  "to-future=b1b,to-ongoing=b1b,to-past=b1");
await expectError(dbP, "P2_EXTEND_HISTORICAL_TIME_OFF_OTHER_LOCATION_REJECTED",
  `UPDATE trainer_time_off SET ends_on = CURRENT_DATE + 3 WHERE id = 'to-past'`, /GYM_LOCATION_MISMATCH/);
await expectOk(dbP, "P2_HISTORICAL_TIME_OFF_EDIT_ALLOWED", `UPDATE trainer_time_off SET reason = 'vacaciones' WHERE id = 'to-past'`);
await dbP.exec(timeOffP("to-xt", "tp-xt", "CURRENT_DATE + 2", "CURRENT_DATE + 3"));
await expectError(dbP, "P2_TWO_TENANTS_TRAINER_MOVE_TO_OTHER_TENANT_BRANCH_REJECTED",
  // Desde H02 lo rechaza primero la FK del entrenador; sin ella, la de la ausencia.
  `UPDATE trainers SET branch_id = 'b2' WHERE id = 'tp-xt'`, /trainers_branch_id_tenant_id_fkey/);
await expectEq(dbP, "P2_TWO_TENANTS_NOTHING_CHANGED",
  `SELECT (${loc("trainers", "tp-xt", "branch_id")}) || '/' || (${loc("trainer_time_off", "to-xt")})`, "b1/b1");

// Membresías PERSONALIZED (R10): mismo patrón que las series.
const memP = (id, tr, end, status = "active") =>
  `INSERT INTO client_memberships (id, gym_id, tenant_id, branch_id, client_id, membership_plan_id, start_date, end_date, price_at_sale, final_amount, payment_status, status, modality, assigned_trainer_id, updated_at)
   VALUES ('${id}', '${T1}', '${T1}', 'b1', 'c1', 'p1', CURRENT_DATE - 90, ${end}, 50, 50, 'paid', '${status}', 'PERSONALIZED', '${tr}', now());`;
await dbP.exec(memP("mp-active", "tp-mem", "CURRENT_DATE + 30"));
await expectError(dbP, "P2_TRAINER_MOVE_WITH_ACTIVE_PERSONALIZED_MEMBERSHIPS_REJECTED",
  `UPDATE trainers SET branch_id = 'b1b' WHERE id = 'tp-mem'`, /GYM_DEPENDENT_LOCATION_CONFLICT: trainer is assigned to active memberships/);
await dbP.exec(memP("mp-expired", "tp-memhist", "CURRENT_DATE - 30"));
await expectOk(dbP, "P2_TRAINER_MOVE_WITH_ONLY_EXPIRED_MEMBERSHIPS", `UPDATE trainers SET branch_id = 'b1b' WHERE id = 'tp-memhist'`);
await expectOk(dbP, "P2_LEGACY_EDIT_HISTORICAL_MEMBERSHIP", `UPDATE client_memberships SET notes = 'x', branch_id = 'b1', updated_at = now() WHERE id = 'mp-expired'`);
await expectError(dbP, "P2_EXTEND_HISTORICAL_MEMBERSHIP_INCONSISTENT_TRAINER_REJECTED",
  `UPDATE client_memberships SET end_date = CURRENT_DATE + 60 WHERE id = 'mp-expired'`, /GYM_LOCATION_MISMATCH/);

// 3. GYM ACTIVITY → SESSION / ATTENDANCE ACTIVITIES
const sessionP = (id, branch, extra = "") =>
  `INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, updated_at${extra ? ", " + extra.split("|")[0] : ""})
   VALUES ('${id}', '${T1}', '${T1}', '${branch}', 'ct1', 'tr1', 'S ${id}', CURRENT_DATE + 3, '07:00', '08:00', 10, now()${extra ? ", " + extra.split("|")[1] : ""});`;
await dbP.exec([
  sessionP("pss-a", "b1"), sessionP("pss-b", "b1b"), sessionP("pss-g", "b1"), sessionP("pss-a2", "b1"),
  `INSERT INTO gym_activities (id, tenant_id, location_id, name, updated_at) VALUES
     ('pa-a', '${T1}', 'b1', 'Sede A', now()), ('pa-att', '${T1}', 'b1', 'Sede A alumno', now()),
     ('pa-free', '${T1}', 'b1', 'Sin uso', now()), ('pa-glob', '${T1}', NULL, 'Global', now());`,
  `INSERT INTO scheduled_class_activities (id, tenant_id, scheduled_class_id, activity_id, activity_name) VALUES
     ('psa1', '${T1}', 'pss-a', 'pa-a', 'Sede A'), ('psa2', '${T1}', 'pss-a', 'pa-glob', 'Global'),
     ('psa3', '${T1}', 'pss-b', 'pa-glob', 'Global'), ('psa4', '${T1}', 'pss-g', 'pa-glob', 'Global');`,
  `INSERT INTO class_attendance (id, scheduled_class_id, client_id, attendance_status, updated_at) VALUES ('pat-a', 'pss-a2', 'c1', 'attended', now());`,
  `INSERT INTO class_attendance_activities (id, tenant_id, attendance_id, activity_id, activity_name) VALUES ('paa1', '${T1}', 'pat-a', 'pa-att', 'Sede A alumno');`,
].join("\n"));
await expectError(dbP, "P3_MOVE_USED_SITE_ACTIVITY_TO_OTHER_SITE_REJECTED",
  `UPDATE gym_activities SET location_id = 'b1b' WHERE id = 'pa-a'`, /GYM_DEPENDENT_LOCATION_CONFLICT: gym_activity is used/);
await expectOk(dbP, "P3_MOVE_SITE_ACTIVITY_TO_GLOBAL_ALLOWED", `UPDATE gym_activities SET location_id = NULL WHERE id = 'pa-a'`);
await expectError(dbP, "P3_GLOBAL_USED_IN_SITE_A_TO_SITE_B_REJECTED",
  `UPDATE gym_activities SET location_id = 'b1b' WHERE id = 'pa-a'`, /GYM_DEPENDENT_LOCATION_CONFLICT/);
await expectOk(dbP, "P3_GLOBAL_BACK_TO_ITS_ONLY_SITE_ALLOWED", `UPDATE gym_activities SET location_id = 'b1' WHERE id = 'pa-a'`);
await expectError(dbP, "P3_GLOBAL_USED_IN_TWO_SITES_TO_ONE_SITE_REJECTED",
  `UPDATE gym_activities SET location_id = 'b1' WHERE id = 'pa-glob'`, /GYM_DEPENDENT_LOCATION_CONFLICT/);
await expectOk(dbP, "P3_GLOBAL_ACTIVITY_RENAME_ALLOWED", `UPDATE gym_activities SET name = 'Global v2', updated_at = now() WHERE id = 'pa-glob'`);
await expectOk(dbP, "P3_MOVE_UNUSED_ACTIVITY_ALLOWED", `UPDATE gym_activities SET location_id = 'b1b' WHERE id = 'pa-free'`);
await expectError(dbP, "P3_MOVE_ACTIVITY_USED_IN_ATTENDANCE_REJECTED",
  `UPDATE gym_activities SET location_id = 'b1b' WHERE id = 'pa-att'`, /GYM_DEPENDENT_LOCATION_CONFLICT/);
await expectError(dbP, "P3_TWO_TENANTS_MOVE_ACTIVITY_TO_OTHER_TENANT_BRANCH",
  `UPDATE gym_activities SET location_id = 'b2' WHERE id = 'pa-free'`, /gym_activities_location_id_tenant_id_fkey/);
await expectError(dbP, "P3_SESSION_WITH_SITE_ACTIVITY_CHANGE_BRANCH_REJECTED",
  `UPDATE scheduled_classes SET branch_id = 'b1b' WHERE id = 'pss-a'`, /GYM_DEPENDENT_LOCATION_CONFLICT: scheduled_class has activities/);
await expectError(dbP, "P3_SESSION_WITH_SITE_ATTENDANCE_ACTIVITY_CHANGE_BRANCH_REJECTED",
  `UPDATE scheduled_classes SET branch_id = 'b1b' WHERE id = 'pss-a2'`, /GYM_DEPENDENT_LOCATION_CONFLICT/);
await expectOk(dbP, "P3_SESSION_WITH_ONLY_GLOBAL_ACTIVITY_CHANGE_BRANCH", `UPDATE scheduled_classes SET branch_id = 'b1b' WHERE id = 'pss-g'`);
await expectError(dbP, "P3_MOVE_ATTENDANCE_TO_OTHER_SITE_SESSION_REJECTED",
  `UPDATE class_attendance SET scheduled_class_id = 'pss-b' WHERE id = 'pat-a'`, /GYM_DEPENDENT_LOCATION_CONFLICT: class_attendance has activities/);

// 4. CLASS SERIES → SCHEDULED CLASS
await dbP.exec([
  seriesP("pse", "tr1"),
  sessionP("pse-future", "b1", `session_kind, series_id, status|'GROUP', 'pse', 'scheduled'`),
  `INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, series_id, status, updated_at) VALUES
     ('pse-past', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'Pasada', CURRENT_DATE - 14, '07:00', '08:00', 10, 'GROUP', 'pse', 'completed', now()),
     ('pse-canc', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'Cancelada', CURRENT_DATE + 14, '07:00', '08:00', 10, 'GROUP', 'pse', 'cancelled', now());`,
].join("\n"));
await expectError(dbP, "P4_SERIES_LOCATION_CHANGE_WITH_FUTURE_SESSIONS_REJECTED",
  `UPDATE class_series SET location_id = 'b1b', trainer_id = 'tr1b' WHERE id = 'pse'`, /GYM_DEPENDENT_SESSIONS_CONFLICT/);
await expectError(dbP, "P4_SERIES_KIND_CHANGE_WITH_FUTURE_SESSIONS_REJECTED",
  `UPDATE class_series SET session_kind = 'PERSONALIZED' WHERE id = 'pse'`, /GYM_DEPENDENT_SESSIONS_CONFLICT/);
await expectOk(dbP, "P4_CANCEL_FUTURE_SESSION", `UPDATE scheduled_classes SET status = 'cancelled', updated_at = now() WHERE id = 'pse-future'`);
await expectOk(dbP, "P4_SERIES_CHANGE_WITH_ONLY_HISTORICAL_SESSIONS_ALLOWED",
  `UPDATE class_series SET location_id = 'b1b', trainer_id = 'tr1b', session_kind = 'PERSONALIZED' WHERE id = 'pse'`);
await expectEq(dbP, "P4_HISTORICAL_SESSIONS_KEEP_ORIGINAL_VALUES",
  `SELECT string_agg(id || '=' || branch_id || ':' || session_kind, ',' ORDER BY id) FROM scheduled_classes WHERE series_id = 'pse'`,
  "pse-canc=b1:GROUP,pse-future=b1:GROUP,pse-past=b1:GROUP");
await expectOk(dbP, "P4_LEGACY_EDIT_HISTORICAL_SESSION_SAME_VALUES",
  `UPDATE scheduled_classes SET title = 'Editada', branch_id = 'b1', capacity = 12, notes = 'x', updated_at = now() WHERE id = 'pse-past'`);
await expectError(dbP, "P4_REACTIVATE_INCONSISTENT_SESSION_REJECTED",
  `UPDATE scheduled_classes SET status = 'scheduled' WHERE id = 'pse-canc'`, /GYM_LOCATION_MISMATCH/);
await expectError(dbP, "P4_TWO_TENANTS_SERIES_LOCATION_OTHER_TENANT",
  `UPDATE class_series SET location_id = 'b2' WHERE id = 'pse'`, /class_series_location_id_tenant_id_fkey|GYM_LOCATION_MISMATCH/);

// 5. CLIENT MEMBERSHIP → BOOKING (tenant / cliente)
await dbP.exec(`
  INSERT INTO client_memberships (id, gym_id, tenant_id, branch_id, client_id, membership_plan_id, start_date, end_date, price_at_sale, final_amount, payment_status, modality, sessions_total, updated_at)
    VALUES ('pm-g', '${T1}', '${T1}', 'b1', 'c2', 'p1', CURRENT_DATE - 10, CURRENT_DATE + 30, 40, 40, 'paid', 'GROUP', 8, now());
  ${sessionP("pss-grp", "b1", `session_kind|'GROUP'`)}
  INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, client_membership_id, consumption, channel, updated_at)
    VALUES ('pb-g', 'pss-grp', 'c2', 'confirmed', 'pm-g', 'CONSUMED', 'STAFF', now());`);
await expectError(dbP, "P5_TWO_TENANTS_MEMBERSHIP_TENANT_CHANGE_WITH_BOOKINGS_REJECTED",
  `UPDATE client_memberships SET tenant_id = '${T2}' WHERE id = 'pm-g'`, /GYM_DEPENDENT_TENANT_CONFLICT: client_memberships/);
await expectError(dbP, "P5_MEMBERSHIP_CLIENT_CHANGE_WITH_BOOKINGS_REJECTED",
  `UPDATE client_memberships SET client_id = 'c3' WHERE id = 'pm-g'`, /class_bookings_client_membership_id_client_id_fkey/);
await expectOk(dbP, "P5_MEMBERSHIP_WITHOUT_BOOKINGS_TENANT_BACKFILL", `UPDATE client_memberships SET tenant_id = '${T1}' WHERE id = 'm-null'`);
await expectOk(dbP, "P5_MEMBERSHIP_WITHOUT_BOOKINGS_CLIENT_CHANGE", `UPDATE client_memberships SET client_id = 'c3' WHERE id = 'm2'`);
await expectError(dbP, "P5_TWO_TENANTS_CLIENT_TENANT_CHANGE_WITH_BOOKINGS_REJECTED",
  `UPDATE clients SET tenant_id = '${T2}' WHERE id = 'c2'`, /GYM_DEPENDENT_TENANT_CONFLICT: clients/);
await expectOk(dbP, "P5_LEGACY_CLIENT_TENANT_BACKFILL_NULL_TO_COHERENT", `UPDATE clients SET tenant_id = '${T1}' WHERE id = 'c-null'`);
await expectError(dbP, "P5_TWO_TENANTS_SESSION_TENANT_CHANGE_WITH_BOOKINGS_REJECTED",
  `UPDATE scheduled_classes SET tenant_id = '${T2}' WHERE id = 's2'`, /GYM_DEPENDENT_TENANT_CONFLICT: scheduled_classes/);
await expectOk(dbP, "P5_LEGACY_SESSION_TENANT_BACKFILL_NULL_TO_COHERENT", `UPDATE scheduled_classes SET tenant_id = '${T1}' WHERE id = 's3'`);
await expectEq(dbP, "P5_BOOKING_CONSISTENT_AFTER_REJECTIONS",
  `SELECT b.tenant_id = m.tenant_id AND b.client_id = m.client_id FROM class_bookings b JOIN client_memberships m ON m.id = b.client_membership_id WHERE b.id = 'pb-g'`, true);

// ═════════════════════════════════════════════════════════════════════
// H02 — tenant de la sede del entrenador (FK compuesta NOT VALID)
// ═════════════════════════════════════════════════════════════════════
console.log("\n── H02: sede del entrenador de otro tenant ──");
await dbP.exec([
  trainer("th-free", "b1"), trainer("th-tenant", "b1"),
  `INSERT INTO branches (id, gym_id, tenant_id, name, updated_at) VALUES ('bh', '${T1}', '${T1}', 'Sede H', now());`,
  trainer("th-bh", "bh"),
  `INSERT INTO trainers (id, gym_id, tenant_id, branch_id, first_name, last_name, updated_at) VALUES ('th-null', '${T1}', NULL, 'b1', 'P', 'th-null', now());`,
].join("\n"));
await expectEq(dbP, "H02_TRAINER_HAS_NO_DEPENDENTS",
  `SELECT ((SELECT COUNT(*) FROM class_series WHERE trainer_id = 'th-free') + (SELECT COUNT(*) FROM trainer_time_off WHERE trainer_id = 'th-free')
        + (SELECT COUNT(*) FROM client_memberships WHERE assigned_trainer_id = 'th-free'))::int`, 0);
await expectError(dbP, "H02_TENANT_A_TRAINER_TO_TENANT_B_BRANCH_WITHOUT_DEPENDENTS_REJECTED",
  `UPDATE trainers SET branch_id = 'b2', updated_at = now() WHERE id = 'th-free'`, /trainers_branch_id_tenant_id_fkey/);
await expectEq(dbP, "H02_TRAINER_UNCHANGED_AFTER_REJECTION", loc("trainers", "th-free", "branch_id"), "b1");
await expectOk(dbP, "H02_SAME_TENANT_MOVE_ALLOWED", `UPDATE trainers SET branch_id = 'b1b', updated_at = now() WHERE id = 'th-free'`);
await expectError(dbP, "H02_INSERT_TRAINER_IN_OTHER_TENANT_BRANCH_REJECTED", trainer("th-x", "b2"), /trainers_branch_id_tenant_id_fkey/);
await expectError(dbP, "H02_TRAINER_TENANT_CHANGE_TO_OTHER_TENANT_REJECTED",
  `UPDATE trainers SET tenant_id = '${T2}' WHERE id = 'th-tenant'`, /trainers_branch_id_tenant_id_fkey/);
await expectError(dbP, "H02_BRANCH_TENANT_CHANGE_WITH_TRAINERS_REJECTED",
  `UPDATE branches SET tenant_id = '${T2}' WHERE id = 'bh'`, /trainers_branch_id_tenant_id_fkey/);
await expectOk(dbP, "H02_LEGACY_NULL_TENANT_TRAINER_NOT_EVALUATED", `UPDATE trainers SET branch_id = 'b2' WHERE id = 'th-null'`);
await expectOk(dbP, "H02_HISTORICAL_INCONSISTENT_TRAINER_EDIT_ALLOWED",
  `UPDATE trainers SET first_name = 'Hist', branch_id = 'b2', updated_at = now() WHERE id = 'tr1-in-b2'`);
await expectOk(dbP, "H02_HISTORICAL_INCONSISTENT_TRAINER_CAN_BE_CORRECTED", `UPDATE trainers SET branch_id = 'b1' WHERE id = 'tr1-in-b2'`);
await expectEq(dbP, "H02_CONSTRAINT_IS_NOT_VALID_UNTIL_CLEANUP",
  `SELECT convalidated FROM pg_constraint WHERE conname = 'trainers_branch_id_tenant_id_fkey'`, false);
await expectEq(dbP, "H02_PREFLIGHT_STILL_REPORTS_REMAINING_HISTORY",
  GYM_BOOKINGS_PREFLIGHT_CHECKS.find((c) => c.id === "POST_TRAINER_BRANCH_TENANT_MISMATCH").countSql, 1);
await expectError(dbP, "H02_VALIDATE_BLOCKED_WHILE_HISTORY_REMAINS",
  `ALTER TABLE trainers VALIDATE CONSTRAINT trainers_branch_id_tenant_id_fkey`, /trainers_branch_id_tenant_id_fkey/);

// ═════════════════════════════════════════════════════════════════════
// H03 — referencias auxiliares: operación → sede, evento → membresía
// ═════════════════════════════════════════════════════════════════════
console.log("\n── H03: referencias auxiliares ──");
const fpH = "b".repeat(64);
const opH = (id, location) =>
  `INSERT INTO gym_booking_operations (id, tenant_id, location_id, command, idempotency_key, request_fingerprint, target_id, result)
   VALUES ('${id}', '${T1}', ${location}, 'BOOK_SESSION', 'h03-${id}-key', '${fpH}', 'pss-grp', '{}')`;
await expectError(dbP, "H03_OPERATION_LOCATION_OF_OTHER_TENANT_REJECTED", opH("oh-x", "'b2'"), /gym_booking_operations_location_id_tenant_id_fkey/);
await expectError(dbP, "H03_OPERATION_UNKNOWN_LOCATION_REJECTED", opH("oh-y", "'no-such-branch'"), /gym_booking_operations_location_id_tenant_id_fkey/);
await expectOk(dbP, "H03_OPERATION_LOCATION_SAME_TENANT", opH("oh-1", "'b1'"));
await expectOk(dbP, "H03_OPERATION_WITHOUT_LOCATION", opH("oh-2", "NULL"));
await dbP.exec(`
  INSERT INTO client_memberships (id, gym_id, tenant_id, branch_id, client_id, membership_plan_id, start_date, end_date, price_at_sale, final_amount, payment_status, modality, sessions_total, updated_at) VALUES
    ('pm-g2',   '${T1}', '${T1}', 'b1', 'c2', 'p1', CURRENT_DATE - 10, CURRENT_DATE + 30, 40, 40, 'paid', 'GROUP', 8, now()),
    ('pm-c1',   '${T1}', '${T1}', 'b1', 'c1', 'p1', CURRENT_DATE - 10, CURRENT_DATE + 30, 40, 40, 'paid', 'GROUP', 8, now()),
    ('pm-null', '${T1}', NULL,    'b1', 'c2', 'p1', CURRENT_DATE - 10, CURRENT_DATE + 30, 40, 40, 'paid', 'GROUP', 8, now());`);
const evH = (id, op, membership) =>
  `INSERT INTO class_booking_events (id, tenant_id, operation_id, booking_id, scheduled_class_id, client_id, client_membership_id, event_type)
   VALUES ('${id}', '${T1}', '${op}', 'pb-g', 'pss-grp', 'c2', ${membership}, 'BOOKED')`;
await expectError(dbP, "H03_EVENT_MEMBERSHIP_OF_OTHER_TENANT_REJECTED", evH("eh-x1", "oh-1", "'m4'"), /class_booking_events_client_membership_id_tenant_id_client_fkey/);
await expectError(dbP, "H03_EVENT_MEMBERSHIP_OF_OTHER_CLIENT_SAME_TENANT_REJECTED", evH("eh-x2", "oh-1", "'pm-c1'"), /class_booking_events_client_membership_id_tenant_id_client_fkey/);
await expectError(dbP, "H03_EVENT_MEMBERSHIP_WITH_NULL_TENANT_REJECTED", evH("eh-x3", "oh-1", "'pm-null'"), /class_booking_events_client_membership_id_tenant_id_client_fkey/);
await expectOk(dbP, "H03_EVENT_MEMBERSHIP_SAME_TENANT_AND_CLIENT", evH("eh-1", "oh-1", "'pm-g'"));
await expectOk(dbP, "H03_EVENT_WITHOUT_MEMBERSHIP", evH("eh-2", "oh-2", "NULL"));
// Historial: el evento es un hecho; la reserva puede cambiar de membresía y el evento conserva la suya.
await expectOk(dbP, "H03_BOOKING_MOVES_TO_OTHER_MEMBERSHIP_EVENT_KEEPS_SNAPSHOT",
  `UPDATE class_bookings SET client_membership_id = 'pm-g2', updated_at = now() WHERE id = 'pb-g'`);
await expectEq(dbP, "H03_EVENT_SNAPSHOT_PRESERVED", `SELECT client_membership_id FROM class_booking_events WHERE id = 'eh-1'`, "pm-g");
await expectEq(dbP, "H03_COUNTERS_FOLLOW_BOOKING",
  `SELECT (SELECT sessions_used FROM client_memberships WHERE id = 'pm-g') || '/' || (SELECT sessions_used FROM client_memberships WHERE id = 'pm-g2')`, "0/1");
await expectError(dbP, "H03_MEMBERSHIP_WITH_EVENTS_CANNOT_BE_DELETED",
  `DELETE FROM client_memberships WHERE id = 'pm-g'`, /class_booking_events_client_membership_id_tenant_id_client_fkey/);
await expectError(dbP, "H03_MEMBERSHIP_WITH_EVENTS_CANNOT_CHANGE_TENANT",
  `UPDATE client_memberships SET tenant_id = '${T2}' WHERE id = 'pm-g'`, /class_booking_events_client_membership_id_tenant_id_client_fkey/);
await expectError(dbP, "H03_MEMBERSHIP_WITH_EVENTS_CANNOT_CHANGE_CLIENT",
  `UPDATE client_memberships SET client_id = 'c3' WHERE id = 'pm-g'`, /class_booking_events_client_membership_id_tenant_id_client_fkey/);
await expectOk(dbP, "H03_MEMBERSHIP_WITH_EVENTS_LEGACY_EDIT_ALLOWED",
  `UPDATE client_memberships SET notes = 'historial', status = 'expired', updated_at = now() WHERE id = 'pm-g'`);

// ═════════════════════════════════════════════════════════════════════
// H04 — límites temporales de VIGENCIA (CURRENT_DATE - 1)
// ═════════════════════════════════════════════════════════════════════
console.log("\n── H04: límites de vigencia ──");
await dbP.exec([
  trainer("t4-s1", "b1"), trainer("t4-s2", "b1"), trainer("t4-o1", "b1"), trainer("t4-o2", "b1"),
  trainer("t4-m1", "b1"), trainer("t4-m2", "b1"),
  seriesP("s4-1", "t4-s1", { until: "CURRENT_DATE - 1" }),
  seriesP("s4-2", "t4-s2", { until: "CURRENT_DATE - 2" }),
  timeOffP("o4-1", "t4-o1", "CURRENT_DATE - 5", "CURRENT_DATE - 1"),
  timeOffP("o4-2", "t4-o2", "CURRENT_DATE - 5", "CURRENT_DATE - 2"),
  memP("m4-1", "t4-m1", "CURRENT_DATE - 1"),
  memP("m4-2", "t4-m2", "CURRENT_DATE - 2"),
].join("\n"));
await expectError(dbP, "H04_SERIES_ENDING_TODAY_MINUS_1_IS_EFFECTIVE",
  `UPDATE trainers SET branch_id = 'b1b' WHERE id = 't4-s1'`, /GYM_DEPENDENT_LOCATION_CONFLICT/);
await expectOk(dbP, "H04_SERIES_ENDING_TODAY_MINUS_2_IS_HISTORY", `UPDATE trainers SET branch_id = 'b1b' WHERE id = 't4-s2'`);
await expectOk(dbP, "H04_TIME_OFF_BOUNDARY_MOVES", `UPDATE trainers SET branch_id = 'b1b' WHERE id IN ('t4-o1', 't4-o2')`);
await expectEq(dbP, "H04_TIME_OFF_ENDING_TODAY_MINUS_1_FOLLOWS_TODAY_MINUS_2_STAYS",
  `SELECT string_agg(id || '=' || location_id, ',' ORDER BY id) FROM trainer_time_off WHERE id IN ('o4-1', 'o4-2')`, "o4-1=b1b,o4-2=b1");
await expectError(dbP, "H04_MEMBERSHIP_ENDING_TODAY_MINUS_1_IS_EFFECTIVE",
  `UPDATE trainers SET branch_id = 'b1b' WHERE id = 't4-m1'`, /GYM_DEPENDENT_LOCATION_CONFLICT/);
await expectOk(dbP, "H04_MEMBERSHIP_ENDING_TODAY_MINUS_2_IS_HISTORY", `UPDATE trainers SET branch_id = 'b1b' WHERE id = 't4-m2'`);
await dbP.exec([
  seriesP("s4-ses1", "tr1"), seriesP("s4-ses2", "tr1"),
  `INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, series_id, status, updated_at) VALUES
     ('ss4-1', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'Ayer', CURRENT_DATE - 1, '07:00', '08:00', 10, 'GROUP', 's4-ses1', 'scheduled', now()),
     ('ss4-2', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'Anteayer', CURRENT_DATE - 2, '07:00', '08:00', 10, 'GROUP', 's4-ses2', 'scheduled', now());`,
].join("\n"));
await expectError(dbP, "H04_SESSION_ON_TODAY_MINUS_1_IS_EFFECTIVE",
  `UPDATE class_series SET session_kind = 'PERSONALIZED' WHERE id = 's4-ses1'`, /GYM_DEPENDENT_SESSIONS_CONFLICT/);
await expectOk(dbP, "H04_SESSION_ON_TODAY_MINUS_2_IS_HISTORY", `UPDATE class_series SET session_kind = 'PERSONALIZED' WHERE id = 's4-ses2'`);
await expectEq(dbP, "H04_CURRENT_DATE_IS_SESSION_TIMEZONE_DATE_AT_TX_START",
  `SELECT CURRENT_DATE = (now() AT TIME ZONE current_setting('TimeZone'))::date`, true);
await expectEq(dbP, "H04_EVERY_IANA_ZONE_LOCAL_DATE_GE_UTC_DATE_MINUS_1",
  `SELECT bool_and((now() AT TIME ZONE name)::date >= (now() AT TIME ZONE 'UTC')::date - 1) FROM pg_timezone_names`, true);
const tzCheck = GYM_BOOKINGS_PREFLIGHT_CHECKS.find((c) => c.id === "PRE_DB_TIMEZONE_MARGIN_UNSAFE").countSql;
for (const [tz, expected] of [["UTC", 0], ["America/El_Salvador", 0], ["Asia/Tokyo", 0], ["Etc/GMT-14", 1]]) {
  await dbP.exec(`BEGIN; SET LOCAL TIME ZONE '${tz}';`);
  const n = await val(dbP, tzCheck);
  await dbP.exec("ROLLBACK");
  record(`H04_PREFLIGHT_TIMEZONE_MARGIN_${tz.replace(/\W/g, "_").toUpperCase()}`, n === expected, `n=${n} (esperado ${expected})`);
}

// ═════════════════════════════════════════════════════════════════════
// H05 — la reserva como padre de class_attendance.booking_id
// ═════════════════════════════════════════════════════════════════════
console.log("\n── H05: reserva ↔ asistencia vinculada ──");
await dbP.exec(`
  INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, updated_at) VALUES
    ('h5-s1', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'H05 S1', CURRENT_DATE + 2, '07:00', '08:00', 10, now()),
    ('h5-s2', '${T1}', '${T1}', 'b1', 'ct1', 'tr1', 'H05 S2', CURRENT_DATE + 3, '07:00', '08:00', 10, now());
  INSERT INTO clients (id, gym_id, tenant_id, branch_id, first_name, last_name, updated_at) VALUES
    ('h5-cA', '${T1}', '${T1}', 'b1', 'H5', 'A', now()), ('h5-cB', '${T1}', '${T1}', 'b1', 'H5', 'B', now()),
    ('h5-cC', '${T1}', '${T1}', 'b1', 'H5', 'C', now()), ('h5-cD', '${T1}', '${T1}', 'b1', 'H5', 'D', now());
  INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, updated_at) VALUES
    ('h5-r1', 'h5-s1', 'h5-cA', 'confirmed', now()),
    ('h5-r2', 'h5-s1', 'h5-cB', 'confirmed', now()),
    ('h5-r3', 'h5-s1', 'h5-cC', 'confirmed', now());
  INSERT INTO class_attendance (id, scheduled_class_id, client_id, booking_id, attendance_status, updated_at) VALUES
    ('h5-a1', 'h5-s1', 'h5-cA', 'h5-r1', 'attended', now()),
    ('h5-a3', 'h5-s1', 'h5-cC', NULL,    'attended', now());`);
const h5Pair = `SELECT string_agg(a.id || '>' || b.id || '@' || b.scheduled_class_id || '/' || b.client_id, ',' ORDER BY a.id)
                  FROM class_attendance a JOIN class_bookings b ON b.id = a.booking_id WHERE a.id LIKE 'h5-%'`;
const h5Seats = `SELECT (SELECT booked_count FROM scheduled_classes WHERE id = 'h5-s1') || '/' || (SELECT booked_count FROM scheduled_classes WHERE id = 'h5-s2')`;
await expectEq(dbP, "H05_INITIAL_LINKS_COHERENT", h5Pair, "h5-a1>h5-r1@h5-s1/h5-cA,h5-a3>h5-r3@h5-s1/h5-cC");
// Sin asistencia: los cambios siguen permitidos (y los contadores se mueven).
await expectOk(dbP, "H05_NO_ATTENDANCE_CLIENT_CHANGE_ALLOWED", `UPDATE class_bookings SET client_id = 'h5-cD', updated_at = now() WHERE id = 'h5-r2'`);
await expectOk(dbP, "H05_NO_ATTENDANCE_SESSION_CHANGE_ALLOWED", `UPDATE class_bookings SET scheduled_class_id = 'h5-s2', updated_at = now() WHERE id = 'h5-r2'`);
await expectEq(dbP, "H05_NO_ATTENDANCE_COUNTERS_FOLLOW", h5Seats, "2/1");
// Con asistencia vinculada (explícita o automática): rechazo.
await expectError(dbP, "H05_LINKED_ATTENDANCE_CLIENT_CHANGE_REJECTED",
  `UPDATE class_bookings SET client_id = 'h5-cB', updated_at = now() WHERE id = 'h5-r1'`, /GYM_DEPENDENT_ATTENDANCE_CONFLICT/);
await expectError(dbP, "H05_LINKED_ATTENDANCE_SESSION_CHANGE_REJECTED",
  `UPDATE class_bookings SET scheduled_class_id = 'h5-s2', updated_at = now() WHERE id = 'h5-r1'`, /GYM_DEPENDENT_ATTENDANCE_CONFLICT/);
await expectError(dbP, "H05_LINKED_ATTENDANCE_CLIENT_AND_SESSION_CHANGE_REJECTED",
  `UPDATE class_bookings SET client_id = 'h5-cB', scheduled_class_id = 'h5-s2', updated_at = now() WHERE id = 'h5-r1'`, /GYM_DEPENDENT_ATTENDANCE_CONFLICT/);
await expectError(dbP, "H05_AUTOLINKED_ATTENDANCE_SESSION_CHANGE_REJECTED",
  `UPDATE class_bookings SET scheduled_class_id = 'h5-s2', updated_at = now() WHERE id = 'h5-r3'`, /GYM_DEPENDENT_ATTENDANCE_CONFLICT/);
await expectError(dbP, "H05_LINKED_ATTENDANCE_CROSS_TENANT_CLIENT_REJECTED",
  `UPDATE class_bookings SET client_id = 'c4', updated_at = now() WHERE id = 'h5-r1'`, /GYM_DEPENDENT_ATTENDANCE_CONFLICT|GYM_TENANT_MISMATCH/);
await expectEq(dbP, "H05_STATE_UNCHANGED_AFTER_REJECTIONS", h5Pair, "h5-a1>h5-r1@h5-s1/h5-cA,h5-a3>h5-r3@h5-s1/h5-cC");
// Integridad tenant sin regresión (reserva sin asistencia).
await expectError(dbP, "H05_NO_ATTENDANCE_CROSS_TENANT_CLIENT_STILL_REJECTED",
  `UPDATE class_bookings SET client_id = 'c4', updated_at = now() WHERE id = 'h5-r2'`, /GYM_TENANT_MISMATCH/);
// Escrituras heredadas y de estado: no cambian sesión/cliente → sin efecto de la guarda.
await expectOk(dbP, "H05_SAME_VALUES_RESEND_ALLOWED",
  `UPDATE class_bookings SET client_id = client_id, scheduled_class_id = scheduled_class_id, updated_at = now() WHERE id = 'h5-r1'`);
await expectOk(dbP, "H05_LEGACY_CANCEL_ALLOWED", `UPDATE class_bookings SET booking_status = 'cancelled' WHERE id = 'h5-r1'`);
await expectEq(dbP, "H05_CANCEL_RELEASES_SEAT", h5Seats, "1/1");
await expectOk(dbP, "H05_LEGACY_REACTIVATION_ALLOWED", `UPDATE class_bookings SET booking_status = 'confirmed', booked_at = now() WHERE id = 'h5-r1'`);
await expectOk(dbP, "H05_STAFF_CANCEL_WITH_NEW_COLUMNS_ALLOWED",
  `UPDATE class_bookings SET booking_status = 'cancelled', cancellation_type = 'STAFF', cancelled_at = now(), cancel_reason = 'x', channel = 'STAFF' WHERE id = 'h5-r3'`);
await expectEq(dbP, "H05_STATUS_CHANGES_COUNTERS", h5Seats, "1/1");
// Fuera de READ COMMITTED el cambio estructural se rechaza (protocolo 2.0 (3)).
await expectError(dbP, "H05_STRUCTURAL_CHANGE_UNDER_REPEATABLE_READ_REJECTED",
  `BEGIN ISOLATION LEVEL REPEATABLE READ; UPDATE class_bookings SET client_id = 'h5-cB' WHERE id = 'h5-r2'; COMMIT;`, /GYM_ISOLATION_UNSUPPORTED/);
// Una reserva con eventos ya era inmutable en sesión/cliente por la FK compuesta del evento.
await expectError(dbP, "H05_BOOKING_WITH_EVENTS_SESSION_CHANGE_REJECTED_BY_EVENT_FK",
  `UPDATE class_bookings SET scheduled_class_id = 'h5-s2', updated_at = now() WHERE id = 'pb-g'`, /class_booking_events_booking_id_tenant_id_scheduled_class__fkey/);
// Purga heredada (purge-class-by-id: reservas → asistencias → clase) en una transacción.
await expectOk(dbP, "H05_LEGACY_PURGE_PRESERVED",
  `BEGIN; DELETE FROM class_bookings WHERE scheduled_class_id = 'h5-s1'; DELETE FROM class_attendance WHERE scheduled_class_id = 'h5-s1'; DELETE FROM scheduled_classes WHERE id = 'h5-s1'; COMMIT;`);
await expectEq(dbP, "H05_PURGE_LEFT_NO_ROWS",
  `SELECT ((SELECT COUNT(*) FROM class_bookings WHERE scheduled_class_id = 'h5-s1') + (SELECT COUNT(*) FROM class_attendance WHERE scheduled_class_id = 'h5-s1'))::int`, 0);
// ON DELETE SET NULL de booking_id sigue vigente: borrar sola la reserva deja la asistencia sin vincular.
await dbP.exec(`
  INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, updated_at) VALUES ('h5-r4', 'h5-s2', 'h5-cA', 'confirmed', now());
  INSERT INTO class_attendance (id, scheduled_class_id, client_id, attendance_status, updated_at) VALUES ('h5-a4', 'h5-s2', 'h5-cA', 'attended', now());`);
await expectOk(dbP, "H05_BOOKING_DELETE_WITH_ATTENDANCE_ALLOWED", `DELETE FROM class_bookings WHERE id = 'h5-r4'`);
await expectEq(dbP, "H05_ATTENDANCE_BOOKING_SET_NULL", `SELECT booking_id FROM class_attendance WHERE id = 'h5-a4'`, null);
await expectEq(dbP, "H05_NO_INCOHERENT_ATTENDANCE_LINKS",
  `SELECT COUNT(*)::int FROM class_attendance a JOIN class_bookings b ON b.id = a.booking_id
    WHERE a.scheduled_class_id IS DISTINCT FROM b.scheduled_class_id OR a.client_id IS DISTINCT FROM b.client_id`, 0);

const postP = await runPreflight(dbP, "post");
record("P_NO_COUNTER_DRIFT_AND_ALL_TRIGGERS", postP.POST_BOOKED_COUNT_DRIFT === 0 && postP.POST_SESSIONS_USED_DRIFT === 0 && postP.POST_MISSING_TRIGGERS === 0,
  JSON.stringify({ drift: postP.POST_BOOKED_COUNT_DRIFT, used: postP.POST_SESSIONS_USED_DRIFT, missing: postP.POST_MISSING_TRIGGERS }));
await dbP.close();

// ═════════════════════════════════════════════════════════════════════
// C — Rollback: rechazo independiente por cada motivo de la guarda
// ═════════════════════════════════════════════════════════════════════
console.log(`\n══ ESCENARIO C (${DRIVER}): guarda del rollback ══`);
const dbC = await freshSyntheticDb("C");
await dbC.exec(SEED);
await dbC.exec(targetSql);

const guardBlock = rollbackSql.slice(rollbackSql.indexOf("DO $$"), rollbackSql.indexOf("$$;", rollbackSql.indexOf("DO $$")) + 3);
const guardLabels = [...guardBlock.matchAll(/^\s*\('([a-z_.]+)',\s*'SELECT/gm)].map((m) => m[1]);
const OP = `INSERT INTO gym_booking_operations (id, tenant_id, command, idempotency_key, request_fingerprint, target_id, result) VALUES ('opc', '${T1}', 'BOOK_SESSION', 'rollback-0001', '${fp}', 's2', '{}');`;
const ACT = `INSERT INTO gym_activities (id, tenant_id, name, updated_at) VALUES ('actc', '${T1}', 'Act C', now());`;
const SERIES = `INSERT INTO class_series (id, tenant_id, location_id, class_type_id, trainer_id, session_kind, title, weekday, start_time, end_time, valid_from, updated_at) VALUES ('sec', '${T1}', 'b1', 'ct1', 'tr1', 'OPEN', 'S', 1, '07:00', '08:00', '2030-01-01', now());`;
const RECONCILE = `SELECT set_config('zolvi.gym_counters_reconcile', 'on', true);`;
const INJECT = {
  gym_booking_operations: OP,
  class_booking_events: `${OP} INSERT INTO class_booking_events (id, tenant_id, operation_id, booking_id, scheduled_class_id, client_id, event_type) VALUES ('evc', '${T1}', 'opc', 'bk-s2-c1', 's2', 'c1', 'BOOKED');`,
  client_modality_changes: `INSERT INTO client_modality_changes (id, tenant_id, client_id, from_modality, to_modality, reason) VALUES ('mcc', '${T1}', 'c1', 'NORMAL', 'GROUP', 'x');`,
  scheduled_class_activities: `${ACT} INSERT INTO scheduled_class_activities (id, tenant_id, scheduled_class_id, activity_id, activity_name) VALUES ('scac', '${T1}', 's2', 'actc', 'x');`,
  class_attendance_activities: `${ACT} INSERT INTO class_attendance_activities (id, tenant_id, attendance_id, activity_id, activity_name) VALUES ('caac', '${T1}', 'at-s1-c1', 'actc', 'x');`,
  gym_activities: ACT,
  class_series: SERIES,
  trainer_time_off: `INSERT INTO trainer_time_off (id, tenant_id, location_id, trainer_id, starts_on, ends_on, updated_at) VALUES ('toc', '${T1}', 'b1', 'tr1', '2030-01-01', '2030-01-01', now());`,
  "gym_settings.timezone": `UPDATE gym_settings SET timezone = 'America/El_Salvador';`,
  "gym_settings.personalized_booking_enabled": `UPDATE gym_settings SET personalized_booking_enabled = true;`,
  "gym_settings.group_booking_enabled": `UPDATE gym_settings SET group_booking_enabled = true;`,
  "gym_settings.personalized_default_capacity": `UPDATE gym_settings SET personalized_default_capacity = 3;`,
  "gym_settings.booking_horizon_days": `UPDATE gym_settings SET booking_horizon_days = 7;`,
  "gym_settings.booking_min_lead_minutes": `UPDATE gym_settings SET booking_min_lead_minutes = 30;`,
  "gym_settings.cancel_min_lead_minutes": `UPDATE gym_settings SET cancel_min_lead_minutes = 60;`,
  "gym_settings.late_cancel_consumes_session": `UPDATE gym_settings SET late_cancel_consumes_session = false;`,
  "gym_settings.apply_policy_to_open": `UPDATE gym_settings SET apply_policy_to_open = true;`,
  "gym_settings.attendance_edit_window_hours": `UPDATE gym_settings SET attendance_edit_window_hours = 24;`,
  "gym_settings.series_generation_weeks": `UPDATE gym_settings SET series_generation_weeks = 8;`,
  "trainers.personalized_capacity": `UPDATE trainers SET personalized_capacity = 2 WHERE id = 'tr1';`,
  "clients.modality": `UPDATE clients SET modality = 'GROUP' WHERE id = 'c1';`,
  "clients.modality_changed_at": `UPDATE clients SET modality_changed_at = now() WHERE id = 'c1';`,
  "membership_plans.modality": `UPDATE membership_plans SET modality = 'GROUP' WHERE id = 'p1';`,
  "client_memberships.modality": `UPDATE client_memberships SET modality = 'GROUP' WHERE id = 'm1';`,
  "client_memberships.sessions_total": `UPDATE client_memberships SET sessions_total = 10 WHERE id = 'm1';`,
  "client_memberships.sessions_used": `${RECONCILE} UPDATE client_memberships SET sessions_used = 1 WHERE id = 'm1';`,
  "client_memberships.assigned_trainer_id": `UPDATE client_memberships SET assigned_trainer_id = 'tr1' WHERE id = 'm1';`,
  "scheduled_classes.session_kind": `UPDATE scheduled_classes SET session_kind = 'GROUP' WHERE id = 's2';`,
  "scheduled_classes.series_id": `${SERIES} UPDATE scheduled_classes SET series_id = 'sec' WHERE id = 's2';`,
  "scheduled_classes.starts_at": `UPDATE scheduled_classes SET starts_at = now() WHERE id = 's2';`,
  "scheduled_classes.ends_at": `UPDATE scheduled_classes SET ends_at = now() WHERE id = 's2';`,
  "scheduled_classes.cancelled_at": `UPDATE scheduled_classes SET cancelled_at = now() WHERE id = 's2';`,
  "scheduled_classes.cancelled_by_user_id": `UPDATE scheduled_classes SET cancelled_by_user_id = 'u-rc1' WHERE id = 's2';`,
  "scheduled_classes.cancel_reason": `UPDATE scheduled_classes SET cancel_reason = 'x' WHERE id = 's2';`,
  "scheduled_classes.completed_at": `UPDATE scheduled_classes SET completed_at = now() WHERE id = 's2';`,
  "scheduled_classes.completed_by_user_id": `UPDATE scheduled_classes SET completed_by_user_id = 'u-tr1' WHERE id = 's2';`,
  "class_bookings.client_membership_id": `UPDATE class_bookings SET client_membership_id = 'm1' WHERE id = 'bk-s2-c1';`,
  "class_bookings.channel": `UPDATE class_bookings SET channel = 'STAFF' WHERE id = 'bk-s2-c1';`,
  "class_bookings.booked_by_user_id": `UPDATE class_bookings SET booked_by_user_id = 'u-rc1' WHERE id = 'bk-s2-c1';`,
  "class_bookings.consumption": `UPDATE class_bookings SET client_membership_id = 'm1', consumption = 'RELEASED' WHERE id = 'bk-s2-c1';`,
  "class_bookings.cancelled_at": `UPDATE class_bookings SET cancelled_at = now() WHERE id = 'bk-s2-c1';`,
  "class_bookings.cancelled_by_user_id": `UPDATE class_bookings SET cancelled_by_user_id = 'u-rc1' WHERE id = 'bk-s2-c1';`,
  "class_bookings.cancellation_type": `UPDATE class_bookings SET cancellation_type = 'STAFF' WHERE id = 'bk-s2-c1';`,
  "class_bookings.cancel_reason": `UPDATE class_bookings SET cancel_reason = 'x' WHERE id = 'bk-s2-c1';`,
  "class_attendance.recorded_by_user_id": `UPDATE class_attendance SET recorded_by_user_id = 'u-tr1' WHERE id = 'at-s1-c1';`,
  "class_attendance.recorded_at": `UPDATE class_attendance SET recorded_at = now() WHERE id = 'at-s1-c1';`,
  "class_attendance.training_notes": `UPDATE class_attendance SET training_notes = 'interna' WHERE id = 'at-s1-c1';`,
};
const missing = guardLabels.filter((l) => !INJECT[l]);
record("C_GUARD_EVERY_LABEL_HAS_INDEPENDENT_TEST", missing.length === 0 && guardLabels.length >= 40, `${guardLabels.length} motivos${missing.length ? `; sin prueba: ${missing.join(", ")}` : ""}`);

const schemaMigratedC = await schemaSnapshot(dbC);
await expectOk(dbC, "C_GUARD_PASSES_ON_DEFAULTS", `BEGIN; ${guardBlock} ROLLBACK;`);
let independentOk = 0;
for (const label of guardLabels) {
  try {
    await dbC.exec(`BEGIN; ${INJECT[label]} ${guardBlock} COMMIT;`);
    await dbC.exec("ROLLBACK").catch(() => {});
    record(`C_REJECTS_${label}`, false, "la guarda no bloqueó");
  } catch (e) {
    await dbC.exec("ROLLBACK").catch(() => {});
    const listed = (e.message.match(/datos nuevos presentes en: (.*)$/m)?.[1] ?? "").split(", ");
    const ok = /GYM_ROLLBACK_BLOCKED/.test(e.message) && listed.includes(label);
    if (ok) independentOk++;
    record(`C_REJECTS_${label}`, ok, ok ? `motivos: ${listed.join(", ")}` : e.message.split("\n")[0]);
  }
}
record("C_INDEPENDENT_REJECTIONS", independentOk === guardLabels.length, `${independentOk}/${guardLabels.length}`);
record("C_STATE_UNCHANGED_AFTER_GUARD_TESTS", sameSchema(schemaMigratedC, await schemaSnapshot(dbC)));
await dbC.exec(`UPDATE gym_settings SET timezone = 'America/El_Salvador'`);
await expectError(dbC, "C_FULL_ROLLBACK_BLOCKED_IS_ATOMIC", rollbackSql, /GYM_ROLLBACK_BLOCKED: datos nuevos presentes en: gym_settings.timezone/);
record("C_FULL_ROLLBACK_BLOCKED_LEAVES_SCHEMA_INTACT", sameSchema(schemaMigratedC, await schemaSnapshot(dbC)));
await dbC.close();

// ═════════════════════════════════════════════════════════════════════
// R — rollback limpio y re-aplicación
// ═════════════════════════════════════════════════════════════════════
console.log(`\n══ ESCENARIO R (${DRIVER}): rollback limpio ══`);
const dbR = await freshSyntheticDb("R");
await dbR.exec(SEED);
const schemaBefore = await schemaSnapshot(dbR);
const dataBefore = await dataSnapshot(dbR);
await expectOk(dbR, "R_MIGRATION_APPLIES", targetSql);
await expectOk(dbR, "R_LEGACY_WRITES_AFTER_MIGRATION",
  `UPDATE class_bookings SET booking_status = 'cancelled', updated_at = '2031-01-01' WHERE id = 'bk-s2-c2';
   UPDATE class_bookings SET booking_status = 'confirmed', updated_at = '2031-01-02' WHERE id = 'bk-s2-c2';`);
await expectOk(dbR, "R_ROLLBACK_APPLIES_WITH_DERIVED_COLUMNS_ONLY", rollbackSql);
const schemaAfter = await schemaSnapshot(dbR);
for (const k of Object.keys(schemaBefore)) record(`R_ROLLBACK_SCHEMA_IDENTICAL_${k.toUpperCase()}`, schemaBefore[k] === schemaAfter[k]);
const dataAfter = await dataSnapshot(dbR);
const dataDiff = [];
for (const t of LEGACY_TABLES) {
  dataBefore[t].forEach((row, i) => {
    for (const k of Object.keys(row)) {
      if (k === "updated_at" && row.id === "bk-s2-c2") continue;
      if (JSON.stringify(row[k]) !== JSON.stringify(dataAfter[t][i][k])) dataDiff.push(`${t}.${row.id}.${k}`);
    }
  });
}
record("R_ROLLBACK_LEGACY_DATA_PRESERVED", dataDiff.length === 0, dataDiff.join(", "));
await expectOk(dbR, "R_REAPPLY_AFTER_ROLLBACK", targetSql);
const postR = await runPreflight(dbR, "post");
record("R_REAPPLY_POSTFLIGHT_CLEAN", postR.POST_BOOKED_COUNT_DRIFT === 0 && postR.POST_MISSING_TRIGGERS === 0 && postR.POST_MISSING_CHECKS === 0, JSON.stringify(postR));
await dbR.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n══ RESULTADO (${DRIVER}): ${results.length - failed.length}/${results.length} PASS · ${skips.length} SKIP ══`);
if (failed.length) {
  for (const f of failed) console.log(`  FAIL ${f.id}: ${f.detail}`);
  process.exitCode = 1;
}
process.exit();
