/**
 * certify-gym-bookings-concurrency.mjs
 *
 * GYM-BOOKINGS 2A — H01: integridad padre↔hijo bajo concurrencia REAL.
 *
 * PostgreSQL real, desechable y aislado (mismas reglas que el resto de la
 * certificación: 127.0.0.1, puerto ≠ 5432, data_directory = CERT_PG_DATA_DIR;
 * crea y borra sus propias bases zolvi_cert_cc_*). Nunca lee .env,
 * DATABASE_URL ni DIRECT_URL.
 *
 * Sincronización determinista, sin sleeps: cada escenario usa DOS conexiones
 * independientes en READ COMMITTED.
 *   1. La PRIMERA transacción ejecuta su escritura y queda abierta.
 *   2. La SEGUNDA lanza la suya; el arnés espera a observar en
 *      pg_stat_activity que su backend está bloqueado (wait_event_type =
 *      'Lock') — o a que termine si no debía bloquearse.
 *   3. COMMIT de la primera; se recoge el resultado de la segunda.
 *   4. Se verifica que la base quedó consistente (consulta de invariantes
 *      independiente de los triggers) y sin deriva de contadores.
 * Cada conflicto se ejecuta en ambos órdenes: A = padre primero, B = hijo
 * primero.
 *
 *   $env:PG_MODULE_DIR     = "<carpeta con node_modules/pg>"
 *   $env:CERT_PG_ADMIN_URL = "postgresql://<user>:<pwd>@127.0.0.1:<port>/postgres"
 *   $env:CERT_PG_DATA_DIR  = "<data_directory del servidor desechable>"
 *   node --no-warnings prisma/scripts/gym-bookings/certify-gym-bookings-concurrency.mjs
 *
 * Contrafactual (demuestra la causa raíz con la migración ANTERIOR al fix):
 *   ... certify-gym-bookings-concurrency.mjs --migration=<ruta a migration.sql previo> --counterfactual
 *   Solo reporta (INFO) qué carreras dejan datos inconsistentes; no falla.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const migrationsDir = path.join(repoRoot, "prisma/migrations");
const TARGET = "20261019000000_gym_bookings_foundation";
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const COUNTERFACTUAL = process.argv.includes("--counterfactual");
const migrationPath = arg("migration") ?? path.join(migrationsDir, TARGET, "migration.sql");
const targetSql = readFileSync(migrationPath, "utf8");
const { mapGymBookingDbError } = await import(pathToFileURL(path.join(repoRoot, "src/modules/classes/booking/booking-db-errors.ts")).href);

const { Client } = createRequire(path.join(process.env.PG_MODULE_DIR ?? "", "noop.js"))("pg");
const adminUrl = process.env.CERT_PG_ADMIN_URL;
const dataDir = process.env.CERT_PG_DATA_DIR;
if (!adminUrl || !dataDir) throw new Error("Faltan CERT_PG_ADMIN_URL / CERT_PG_DATA_DIR");
const au = new URL(adminUrl);
if (au.hostname !== "127.0.0.1" || (au.port || "5432") === "5432") throw new Error("Rechazado: solo 127.0.0.1 y puerto ≠ 5432");
const norm = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const admin = new Client({ connectionString: adminUrl });
await admin.connect();
const { rows: dd } = await admin.query(
  "SELECT current_setting('data_directory') AS d, current_setting('server_version') AS v, current_setting('deadlock_timeout') AS dt"
);
if (norm(dd[0].d) !== norm(dataDir)) throw new Error(`Rechazado: data_directory=${dd[0].d}`);

const results = [];
const record = (id, ok, detail = "") => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? `  — ${detail}` : ""}`);
};
const info = (id, detail) => console.log(`INFO  ${id}  — ${detail}`);
record("ISOLATION", true, `PostgreSQL ${dd[0].v} en ${au.hostname}:${au.port}, deadlock_timeout=${dd[0].dt}, migración=${path.basename(path.dirname(migrationPath))}/${path.basename(migrationPath)}${COUNTERFACTUAL ? " (CONTRAFACTUAL)" : ""}`);

const urlFor = (name) => {
  const u = new URL(adminUrl);
  u.pathname = `/${name}`;
  return u.toString();
};
async function connect(name) {
  const c = new Client({ connectionString: urlFor(name) });
  c.on("notice", () => {});
  c.on("error", () => {});
  await c.connect();
  return c;
}

// ── Plantilla: cadena heredada + seed + migración 2A ─────────────────
const T1 = "00000000-0000-0000-0000-0000000000t1";
const T2 = "00000000-0000-0000-0000-0000000000t2";
const SEED = `
INSERT INTO runtime_tenants (id, name, slug, updated_at) VALUES ('${T1}', 'Cc One', 'cc-one', now()), ('${T2}', 'Cc Two', 'cc-two', now());
INSERT INTO gyms (id, tenant_id, name, slug, updated_at) VALUES ('${T1}', '${T1}', 'Cc One', 'cc-one', now()), ('${T2}', '${T2}', 'Cc Two', 'cc-two', now());
INSERT INTO branches (id, gym_id, tenant_id, name, updated_at) VALUES
  ('b1', '${T1}', '${T1}', 'Sede A', now()), ('b1b', '${T1}', '${T1}', 'Sede A2', now()), ('b2', '${T2}', '${T2}', 'Sede Z', now());
INSERT INTO trainers (id, gym_id, tenant_id, branch_id, first_name, last_name, updated_at) VALUES
  ('tA', '${T1}', '${T1}', 'b1', 'T', 'A', now()), ('tB', '${T1}', '${T1}', 'b1b', 'T', 'B', now()), ('tC', '${T1}', '${T1}', 'b1', 'T', 'C', now());
INSERT INTO class_types (id, gym_id, tenant_id, name, updated_at) VALUES ('ct1', '${T1}', '${T1}', 'Funcional', now());
INSERT INTO clients (id, gym_id, tenant_id, branch_id, first_name, last_name, updated_at) VALUES
  ('c1', '${T1}', '${T1}', 'b1', 'A', 'A', now()), ('c2', '${T1}', '${T1}', 'b1', 'B', 'B', now()), ('cz', '${T1}', '${T1}', 'b1', 'Z', 'Z', now());
INSERT INTO membership_plans (id, gym_id, tenant_id, name, duration_days, sessions_limit, price, updated_at) VALUES
  ('p1', '${T1}', '${T1}', 'Plan', 30, 8, 30.00, now());
INSERT INTO client_memberships (id, gym_id, tenant_id, branch_id, client_id, membership_plan_id, start_date, end_date, price_at_sale, final_amount, payment_status, modality, sessions_total, updated_at) VALUES
  ('mz', '${T1}', '${T1}', 'b1', 'c1', 'p1', CURRENT_DATE - 5, CURRENT_DATE + 30, 30, 30, 'paid', 'GROUP', 8, now());
INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, updated_at) VALUES
  ('ses',  '${T1}', '${T1}', 'b1',  'ct1', 'tA', 'Sesión',   CURRENT_DATE + 3, '07:00', '08:00', 10, 'OPEN',  now()),
  ('ses2', '${T1}', '${T1}', 'b1b', 'ct1', 'tB', 'Sesión 2', CURRENT_DATE + 3, '09:00', '10:00', 10, 'OPEN',  now()),
  ('ses3', '${T1}', '${T1}', 'b1',  'ct1', 'tA', 'Sesión 3', CURRENT_DATE + 4, '07:00', '08:00', 10, 'OPEN',  now()),
  ('sg1',  '${T1}', '${T1}', 'b1',  'ct1', 'tA', 'Grupal 1', CURRENT_DATE + 5, '07:00', '08:00', 10, 'GROUP', now()),
  ('sg2',  '${T1}', '${T1}', 'b1',  'ct1', 'tA', 'Grupal 2', CURRENT_DATE + 6, '07:00', '08:00', 10, 'GROUP', now());
INSERT INTO class_attendance (id, scheduled_class_id, client_id, attendance_status, updated_at) VALUES
  ('att', 'ses', 'c1', 'attended', now()), ('att3', 'ses3', 'c2', 'attended', now());
INSERT INTO gym_activities (id, tenant_id, location_id, name, updated_at) VALUES
  ('actG', '${T1}', NULL, 'Global', now()), ('actA', '${T1}', 'b1', 'Sede A', now());
INSERT INTO class_series (id, tenant_id, location_id, class_type_id, trainer_id, session_kind, title, weekday, start_time, end_time, valid_from, updated_at) VALUES
  ('sr', '${T1}', 'b1', 'ct1', 'tA', 'GROUP', 'Serie', 1, '07:00', '08:00', CURRENT_DATE - 30, now());
`;

const TEMPLATE = `zolvi_cert_cc_tpl_${process.pid}`;
await admin.query(`CREATE DATABASE "${TEMPLATE}" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
{
  const c = await connect(TEMPLATE);
  const legacy = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name < TARGET)
    .map((d) => d.name)
    .sort();
  for (const name of legacy) await c.query(readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8"));
  await c.query(targetSql);
  await c.query(SEED);
  await c.end();
  record("TEMPLATE_READY", true, `${legacy.length} migraciones heredadas + 2A + seed`);
}

let seq = 0;
async function freshDb() {
  const name = `zolvi_cert_cc_${process.pid}_${seq++}`;
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE}"`);
  return name;
}
const dropDb = (name) => admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);

// ── Invariantes (consulta independiente de los triggers) ─────────────
const EFFECTIVE_FLOOR = "CURRENT_DATE - 1";
const INVARIANTS = {
  series_vs_trainer: `SELECT COUNT(*)::int FROM class_series s JOIN trainers t ON t.id = s.trainer_id
     WHERE s.status = 'active' AND (s.valid_until IS NULL OR s.valid_until >= ${EFFECTIVE_FLOOR}) AND s.location_id IS DISTINCT FROM t.branch_id`,
  time_off_vs_trainer: `SELECT COUNT(*)::int FROM trainer_time_off o JOIN trainers t ON t.id = o.trainer_id
     WHERE o.status = 'active' AND o.ends_on >= ${EFFECTIVE_FLOOR} AND o.location_id IS DISTINCT FROM t.branch_id`,
  membership_vs_trainer: `SELECT COUNT(*)::int FROM client_memberships m JOIN trainers t ON t.id = m.assigned_trainer_id
     WHERE m.status IN ('active', 'suspended') AND m.end_date >= ${EFFECTIVE_FLOOR}
       AND (m.branch_id IS DISTINCT FROM t.branch_id OR m.tenant_id IS DISTINCT FROM t.tenant_id)`,
  session_vs_series: `SELECT COUNT(*)::int FROM scheduled_classes c JOIN class_series s ON s.id = c.series_id
     WHERE c.status IN ('scheduled', 'in_progress') AND c.class_date >= ${EFFECTIVE_FLOOR}
       AND (c.branch_id IS DISTINCT FROM s.location_id OR c.session_kind IS DISTINCT FROM s.session_kind)`,
  session_activity_location: `SELECT COUNT(*)::int FROM scheduled_class_activities sa JOIN gym_activities g ON g.id = sa.activity_id
     JOIN scheduled_classes c ON c.id = sa.scheduled_class_id WHERE g.location_id IS NOT NULL AND g.location_id IS DISTINCT FROM c.branch_id`,
  attendance_activity_location: `SELECT COUNT(*)::int FROM class_attendance_activities aa JOIN gym_activities g ON g.id = aa.activity_id
     JOIN class_attendance a ON a.id = aa.attendance_id JOIN scheduled_classes c ON c.id = a.scheduled_class_id
     WHERE g.location_id IS NOT NULL AND g.location_id IS DISTINCT FROM c.branch_id`,
  booking_tenant: `SELECT COUNT(*)::int FROM class_bookings b JOIN scheduled_classes c ON c.id = b.scheduled_class_id JOIN clients k ON k.id = b.client_id
     LEFT JOIN client_memberships m ON m.id = b.client_membership_id
     WHERE b.tenant_id IS DISTINCT FROM c.tenant_id OR b.tenant_id IS DISTINCT FROM k.tenant_id
        OR (m.id IS NOT NULL AND b.tenant_id IS DISTINCT FROM m.tenant_id)`,
  attendance_tenant: `SELECT COUNT(*)::int FROM class_attendance a JOIN scheduled_classes c ON c.id = a.scheduled_class_id JOIN clients k ON k.id = a.client_id
     WHERE a.tenant_id IS DISTINCT FROM c.tenant_id OR a.tenant_id IS DISTINCT FROM k.tenant_id`,
  attendance_vs_booking: `SELECT COUNT(*)::int FROM class_attendance a JOIN class_bookings b ON b.id = a.booking_id
     WHERE a.scheduled_class_id IS DISTINCT FROM b.scheduled_class_id OR a.client_id IS DISTINCT FROM b.client_id`,
  trainer_branch_tenant: `SELECT COUNT(*)::int FROM trainers t JOIN branches br ON br.id = t.branch_id
     WHERE t.tenant_id IS NOT NULL AND br.tenant_id IS DISTINCT FROM t.tenant_id`,
  booked_count_drift: `SELECT COUNT(*)::int FROM scheduled_classes s
     WHERE s.booked_count <> (SELECT COUNT(*) FROM class_bookings b WHERE b.scheduled_class_id = s.id AND b.booking_status = 'confirmed')`,
  sessions_used_drift: `SELECT COUNT(*)::int FROM client_memberships m
     WHERE m.sessions_used <> (SELECT COUNT(*) FROM class_bookings b WHERE b.client_membership_id = m.id AND b.consumption = 'CONSUMED')`,
};
async function violations(c) {
  const out = {};
  for (const [k, sql] of Object.entries(INVARIANTS)) {
    const n = Object.values((await c.query(sql)).rows[0])[0];
    if (n) out[k] = n;
  }
  return out;
}

// ── Motor de dos transacciones ───────────────────────────────────────
const errText = (e) => `${e.code ?? ""} ${e.message.split("\n")[0]}`;
async function runStatements(c, sql) {
  for (const s of [].concat(sql)) await c.query(s);
}
async function waitBlockedOrDone(pid, promise, timeoutMs = 8000) {
  let done = false;
  promise.then(() => (done = true), () => (done = true));
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (done) return "done";
    const { rows } = await admin.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [pid]);
    if (rows[0]?.wait_event_type === "Lock") return "blocked";
    await new Promise((r) => setImmediate(r));
  }
  return "timeout";
}

/**
 * Ejecuta first (queda abierta) → second (se observa bloqueado) → COMMIT first → resultado second.
 * Devuelve { firstErr, secondErr, secondState, final } donde final son las violaciones de invariantes.
 */
async function race({ setup, first, second, firstIso = "READ COMMITTED", secondIso = "READ COMMITTED", secondPre }) {
  const db = await freshDb();
  const c1 = await connect(db);
  const c2 = await connect(db);
  const out = {};
  try {
    if (setup) await c1.query(setup);
    const pid2 = (await c2.query("SELECT pg_backend_pid() AS p")).rows[0].p;
    await c1.query(`BEGIN ISOLATION LEVEL ${firstIso}`);
    await c2.query(`BEGIN ISOLATION LEVEL ${secondIso}`);
    if (secondPre) await c2.query(secondPre); // fija la instantánea de la segunda (REPEATABLE READ)
    try {
      await runStatements(c1, first);
    } catch (e) {
      out.firstErr = e;
    }
    const p2 = runStatements(c2, second).then(
      () => null,
      (e) => e
    );
    out.secondState = out.firstErr ? "skipped" : await waitBlockedOrDone(pid2, p2);
    await c1.query(out.firstErr ? "ROLLBACK" : "COMMIT");
    out.secondErr = await p2;
    await c2.query(out.secondErr ? "ROLLBACK" : "COMMIT");
    out.final = await violations(c1);
    out.db = db;
    out.c1 = c1;
  } catch (e) {
    out.harnessErr = e;
  } finally {
    if (!out.c1) await c1.end().catch(() => {});
    await c2.end().catch(() => {});
  }
  return out;
}
async function closeRace(r) {
  if (r.c1) await r.c1.end().catch(() => {});
  if (r.db) await dropDb(r.db);
}

const summary = [];
/**
 * Conflicto padre↔hijo en ambos órdenes. expectA/expectB = regex del rechazo
 * de la SEGUNDA transacción, o null si ambas deben confirmar (cambio legítimo).
 */
async function conflict(id, { setup, parent, child, expectA, expectB, checkA, checkB }) {
  for (const [order, first, second, expect, check] of [
    ["A_PARENT_FIRST", parent, child, expectA, checkA],
    ["B_CHILD_FIRST", child, parent, expectB, checkB],
  ]) {
    const r = await race({ setup, first, second });
    const tag = `${id}_${order}`;
    if (r.harnessErr) {
      record(tag, false, `error del arnés: ${r.harnessErr.message}`);
      continue;
    }
    const consistent = Object.keys(r.final).length === 0;
    const bothCommitted = !r.firstErr && !r.secondErr;
    const detail = `${r.secondState}; 1ª=${r.firstErr ? errText(r.firstErr) : "COMMIT"}; 2ª=${r.secondErr ? errText(r.secondErr) : "COMMIT"}; violaciones=${JSON.stringify(r.final)}`;
    if (COUNTERFACTUAL) {
      info(`CF_${tag}`, `${!consistent ? "CARRERA REPRODUCIDA: ambas confirmaron con datos inconsistentes" : "sin inconsistencia"} · ${detail}`);
      summary.push({ id: tag, raced: !consistent });
    } else {
      record(`${tag}_FIRST_COMMITS`, !r.firstErr, r.firstErr ? errText(r.firstErr) : "");
      record(`${tag}_SECOND_WAITED_ON_ROW_LOCK`, r.secondState === "blocked", r.secondState);
      if (expect) {
        record(`${tag}_SECOND_REJECTED`, !!r.secondErr && expect.test(r.secondErr.message), r.secondErr ? errText(r.secondErr) : "confirmó (no debía)");
      } else {
        record(`${tag}_BOTH_COMMIT`, bothCommitted, r.secondErr ? errText(r.secondErr) : "");
      }
      record(`${tag}_CONSISTENT`, consistent, JSON.stringify(r.final));
      if (check) {
        const got = Object.values((await r.c1.query(check.sql)).rows[0])[0];
        record(`${tag}_${check.id}`, JSON.stringify(got) === JSON.stringify(check.expected), `= ${JSON.stringify(got)}`);
      }
    }
    await closeRace(r);
  }
}

// ═════════════════════════════════════════════════════════════════════
// H01 — conflictos padre↔hijo (ambos órdenes)
// ═════════════════════════════════════════════════════════════════════
console.log("\n══ H01: conflictos padre↔hijo ══");
const futureSeries = (id, tr, loc, status = "active") =>
  `INSERT INTO class_series (id, tenant_id, location_id, class_type_id, trainer_id, session_kind, title, weekday, start_time, end_time, valid_from, status, updated_at)
   VALUES ('${id}', '${T1}', '${loc}', 'ct1', '${tr}', 'GROUP', 'S ${id}', 2, '07:00', '08:00', CURRENT_DATE - 10, '${status}', now())`;
const seriesSession = (id, status = "scheduled") =>
  `INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, series_id, status, updated_at)
   VALUES ('${id}', '${T1}', '${T1}', 'b1', 'ct1', 'tA', 'Generada', CURRENT_DATE + 7, '07:00', '08:00', 10, 'GROUP', 'sr', '${status}', now())`;
const sca = (id, ses, act) => `INSERT INTO scheduled_class_activities (id, tenant_id, scheduled_class_id, activity_id, activity_name) VALUES ('${id}', '${T1}', '${ses}', '${act}', 'x')`;
const caa = (id, att, act) => `INSERT INTO class_attendance_activities (id, tenant_id, attendance_id, activity_id, activity_name) VALUES ('${id}', '${T1}', '${att}', '${act}', 'x')`;
// tA tiene la serie 'sr' vigente en b1 en la plantilla; los escenarios del
// entrenador usan tC (sin hijos) para aislar cada relación.
const MOVE_TC = `UPDATE trainers SET branch_id = 'b1b', updated_at = now() WHERE id = 'tC'`;

await conflict("C01_TRAINER_BRANCH_VS_SERIES_INSERT", {
  parent: MOVE_TC,
  child: futureSeries("s-new", "tC", "b1"),
  expectA: /GYM_LOCATION_MISMATCH/,
  expectB: /GYM_DEPENDENT_LOCATION_CONFLICT/,
});
await conflict("C02_TRAINER_BRANCH_VS_TIME_OFF_INSERT", {
  parent: MOVE_TC,
  child: `INSERT INTO trainer_time_off (id, tenant_id, location_id, trainer_id, starts_on, ends_on, updated_at) VALUES ('o-new', '${T1}', 'b1', 'tC', CURRENT_DATE + 2, CURRENT_DATE + 3, now())`,
  expectA: /GYM_LOCATION_MISMATCH/,
  expectB: null, // legítimo: la ausencia sigue al entrenador (cascada)
  checkB: { id: "TIME_OFF_CASCADED_TO_NEW_BRANCH", sql: `SELECT location_id FROM trainer_time_off WHERE id = 'o-new'`, expected: "b1b" },
});
await conflict("C03_TRAINER_BRANCH_VS_PERSONALIZED_MEMBERSHIP_INSERT", {
  parent: MOVE_TC,
  child: `INSERT INTO client_memberships (id, gym_id, tenant_id, branch_id, client_id, membership_plan_id, start_date, end_date, price_at_sale, final_amount, payment_status, modality, assigned_trainer_id, updated_at)
          VALUES ('m-new', '${T1}', '${T1}', 'b1', 'c2', 'p1', CURRENT_DATE, CURRENT_DATE + 30, 50, 50, 'paid', 'PERSONALIZED', 'tC', now())`,
  expectA: /GYM_LOCATION_MISMATCH/,
  expectB: /GYM_DEPENDENT_LOCATION_CONFLICT/,
});
await conflict("C04_TRAINER_BRANCH_VS_MEMBERSHIP_TRAINER_ASSIGNMENT", {
  parent: MOVE_TC,
  child: `UPDATE client_memberships SET assigned_trainer_id = 'tC', updated_at = now() WHERE id = 'mz'`,
  expectA: /GYM_LOCATION_MISMATCH/,
  expectB: /GYM_DEPENDENT_LOCATION_CONFLICT/,
});
await conflict("C05_TRAINER_BRANCH_VS_SERIES_REACTIVATION", {
  setup: futureSeries("s-old", "tC", "b1", "inactive"),
  parent: MOVE_TC,
  child: `UPDATE class_series SET status = 'active', updated_at = now() WHERE id = 's-old'`,
  expectA: /GYM_LOCATION_MISMATCH/,
  expectB: /GYM_DEPENDENT_LOCATION_CONFLICT/,
});
await conflict("C06_SERIES_LOCATION_VS_SESSION_GENERATION", {
  parent: `UPDATE class_series SET location_id = 'b1b', trainer_id = 'tB', updated_at = now() WHERE id = 'sr'`,
  child: seriesSession("gen1"),
  expectA: /GYM_LOCATION_MISMATCH/,
  expectB: /GYM_DEPENDENT_SESSIONS_CONFLICT/,
});
await conflict("C07_SERIES_KIND_VS_SESSION_GENERATION", {
  parent: `UPDATE class_series SET session_kind = 'PERSONALIZED', updated_at = now() WHERE id = 'sr'`,
  child: seriesSession("gen1"),
  expectA: /GYM_SERIES_KIND_MISMATCH/,
  expectB: /GYM_DEPENDENT_SESSIONS_CONFLICT/,
});
await conflict("C08_SERIES_LOCATION_VS_SESSION_REACTIVATION", {
  setup: seriesSession("gen-c", "cancelled"),
  parent: `UPDATE class_series SET location_id = 'b1b', trainer_id = 'tB', updated_at = now() WHERE id = 'sr'`,
  child: `UPDATE scheduled_classes SET status = 'scheduled', updated_at = now() WHERE id = 'gen-c'`,
  expectA: /GYM_LOCATION_MISMATCH/,
  expectB: /GYM_DEPENDENT_SESSIONS_CONFLICT/,
});
await conflict("C09_ACTIVITY_LOCATION_VS_SESSION_ACTIVITY_INSERT", {
  parent: `UPDATE gym_activities SET location_id = 'b1b', updated_at = now() WHERE id = 'actG'`,
  child: sca("sa-new", "ses", "actG"),
  expectA: /GYM_LOCATION_MISMATCH/,
  expectB: /GYM_DEPENDENT_LOCATION_CONFLICT/,
});
await conflict("C10_ACTIVITY_LOCATION_VS_ATTENDANCE_ACTIVITY_INSERT", {
  parent: `UPDATE gym_activities SET location_id = 'b1b', updated_at = now() WHERE id = 'actG'`,
  child: caa("aa-new", "att", "actG"),
  expectA: /GYM_LOCATION_MISMATCH/,
  expectB: /GYM_DEPENDENT_LOCATION_CONFLICT/,
});
await conflict("C11_SESSION_BRANCH_VS_SESSION_ACTIVITY_INSERT", {
  parent: `UPDATE scheduled_classes SET branch_id = 'b1b', updated_at = now() WHERE id = 'ses'`,
  child: sca("sa-new", "ses", "actA"),
  expectA: /GYM_LOCATION_MISMATCH/,
  expectB: /GYM_DEPENDENT_LOCATION_CONFLICT/,
});
await conflict("C12_SESSION_BRANCH_VS_ATTENDANCE_ACTIVITY_INSERT", {
  parent: `UPDATE scheduled_classes SET branch_id = 'b1b', updated_at = now() WHERE id = 'ses'`,
  child: caa("aa-new", "att", "actA"),
  expectA: /GYM_LOCATION_MISMATCH/,
  expectB: /GYM_DEPENDENT_LOCATION_CONFLICT/,
});
// Dos PADRES de la misma fila hoja (sin insertar hijos): actividad global
// usada en 'ses' pasa a la sede b1 mientras 'ses' pasa a b1b.
await conflict("C13_DIAMOND_ACTIVITY_VS_SESSION_VIA_SESSION_ACTIVITY", {
  setup: sca("sa-g", "ses", "actG"),
  parent: `UPDATE gym_activities SET location_id = 'b1', updated_at = now() WHERE id = 'actG'`,
  child: `UPDATE scheduled_classes SET branch_id = 'b1b', updated_at = now() WHERE id = 'ses'`,
  expectA: /GYM_DEPENDENT_LOCATION_CONFLICT/,
  expectB: /GYM_DEPENDENT_LOCATION_CONFLICT/,
});
await conflict("C14_DIAMOND_ACTIVITY_VS_SESSION_VIA_ATTENDANCE_ACTIVITY", {
  setup: caa("aa-g", "att", "actG"),
  parent: `UPDATE gym_activities SET location_id = 'b1', updated_at = now() WHERE id = 'actG'`,
  child: `UPDATE scheduled_classes SET branch_id = 'b1b', updated_at = now() WHERE id = 'ses'`,
  expectA: /GYM_DEPENDENT_LOCATION_CONFLICT/,
  expectB: /GYM_DEPENDENT_LOCATION_CONFLICT/,
});
await conflict("C15_DIAMOND_ACTIVITY_VS_ATTENDANCE_MOVE", {
  setup: caa("aa-g", "att", "actG"),
  parent: `UPDATE gym_activities SET location_id = 'b1', updated_at = now() WHERE id = 'actG'`,
  child: `UPDATE class_attendance SET scheduled_class_id = 'ses2', updated_at = now() WHERE id = 'att'`,
  expectA: /GYM_DEPENDENT_LOCATION_CONFLICT/,
  expectB: /GYM_DEPENDENT_LOCATION_CONFLICT/,
});
await conflict("C16_SESSION_BRANCH_VS_ATTENDANCE_MOVE_IN", {
  setup: caa("aa-a", "att3", "actA"),
  parent: `UPDATE scheduled_classes SET branch_id = 'b1b', updated_at = now() WHERE id = 'ses'`,
  child: `UPDATE class_attendance SET scheduled_class_id = 'ses', updated_at = now() WHERE id = 'att3'`,
  expectA: /GYM_DEPENDENT_LOCATION_CONFLICT/,
  expectB: /GYM_DEPENDENT_LOCATION_CONFLICT/,
});
await conflict("C17_CLIENT_TENANT_VS_BOOKING_INSERT", {
  parent: `UPDATE clients SET tenant_id = '${T2}', updated_at = now() WHERE id = 'cz'`,
  child: `INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, updated_at) VALUES ('bk-new', 'ses', 'cz', 'confirmed', now())`,
  expectA: /GYM_TENANT_MISMATCH/,
  expectB: /GYM_DEPENDENT_TENANT_CONFLICT/,
});
await conflict("C18_CLIENT_TENANT_VS_ATTENDANCE_INSERT", {
  parent: `UPDATE clients SET tenant_id = '${T2}', updated_at = now() WHERE id = 'cz'`,
  child: `INSERT INTO class_attendance (id, scheduled_class_id, client_id, attendance_status, updated_at) VALUES ('at-new', 'ses', 'cz', 'attended', now())`,
  expectA: /GYM_TENANT_MISMATCH/,
  expectB: /GYM_DEPENDENT_TENANT_CONFLICT/,
});
await conflict("C19_SESSION_TENANT_VS_BOOKING_INSERT", {
  parent: `UPDATE scheduled_classes SET tenant_id = '${T2}', updated_at = now() WHERE id = 'ses2'`,
  child: `INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, updated_at) VALUES ('bk-new', 'ses2', 'c1', 'confirmed', now())`,
  expectA: /GYM_TENANT_MISMATCH/,
  expectB: /GYM_DEPENDENT_TENANT_CONFLICT/,
});
await conflict("C20_MEMBERSHIP_TENANT_VS_CONSUMING_BOOKING_INSERT", {
  parent: `UPDATE client_memberships SET tenant_id = '${T2}', updated_at = now() WHERE id = 'mz'`,
  child: `INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, client_membership_id, consumption, channel, updated_at)
          VALUES ('bk-new', 'sg1', 'c1', 'confirmed', 'mz', 'CONSUMED', 'STAFF', now())`,
  expectA: /GYM_TENANT_MISMATCH/,
  expectB: /GYM_DEPENDENT_TENANT_CONFLICT/,
});

// H05 — la reserva es el padre de class_attendance.booking_id: cambiar su
// cliente o sesión frente a vincular una asistencia a esa misma reserva.
const H05_BOOKING = `INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, updated_at) VALUES ('bk5', 'ses', 'c2', 'confirmed', now())`;
const linkAtt = (bookingId) =>
  `INSERT INTO class_attendance (id, scheduled_class_id, client_id, booking_id, attendance_status, updated_at) VALUES ('at5', 'ses', 'c2', ${bookingId}, 'attended', now())`;
await conflict("C21_BOOKING_CLIENT_VS_ATTENDANCE_LINK", {
  setup: H05_BOOKING,
  parent: `UPDATE class_bookings SET client_id = 'cz', updated_at = now() WHERE id = 'bk5'`,
  child: linkAtt("'bk5'"),
  expectA: /GYM_ATTENDANCE_BOOKING_MISMATCH/,
  expectB: /GYM_DEPENDENT_ATTENDANCE_CONFLICT/,
});
await conflict("C22_BOOKING_SESSION_VS_ATTENDANCE_LINK", {
  setup: H05_BOOKING,
  parent: `UPDATE class_bookings SET scheduled_class_id = 'ses3', updated_at = now() WHERE id = 'bk5'`,
  child: linkAtt("'bk5'"),
  expectA: /GYM_ATTENDANCE_BOOKING_MISMATCH/,
  expectB: /GYM_DEPENDENT_ATTENDANCE_CONFLICT/,
});
// Vínculo automático (booking_id NULL): con la reserva ya movida la asistencia
// queda sin vincular (coherente); con la asistencia primero, la reserva se rechaza.
await conflict("C23_BOOKING_CLIENT_VS_ATTENDANCE_AUTOLINK", {
  setup: H05_BOOKING,
  parent: `UPDATE class_bookings SET client_id = 'cz', updated_at = now() WHERE id = 'bk5'`,
  child: linkAtt("NULL"),
  expectA: null,
  expectB: /GYM_DEPENDENT_ATTENDANCE_CONFLICT/,
  checkA: { id: "ATTENDANCE_LEFT_UNLINKED", sql: `SELECT booking_id FROM class_attendance WHERE id = 'at5'`, expected: null },
});
// Vincular una asistencia existente (UPDATE de booking_id) mientras la reserva cambia de sesión.
// La asistencia se crea antes que la reserva, así queda sin vincular.
await conflict("C24_BOOKING_SESSION_VS_EXISTING_ATTENDANCE_LINK", {
  setup: `${linkAtt("NULL")}; ${H05_BOOKING}`,
  parent: `UPDATE class_bookings SET scheduled_class_id = 'ses3', updated_at = now() WHERE id = 'bk5'`,
  child: `UPDATE class_attendance SET booking_id = 'bk5', updated_at = now() WHERE id = 'at5'`,
  expectA: /GYM_ATTENDANCE_BOOKING_MISMATCH/,
  expectB: /GYM_DEPENDENT_ATTENDANCE_CONFLICT/,
});

if (!COUNTERFACTUAL) {
  // ═══════════════════════════════════════════════════════════════════
  // L — concurrencia legítima: sin rechazos, sin interbloqueos, sin deriva
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n══ L: concurrencia legítima ══");
  async function legit(id, { setup, first, second, blocks, check }) {
    const r = await race({ setup, first, second });
    if (r.harnessErr) return record(id, false, `error del arnés: ${r.harnessErr.message}`);
    record(`${id}_BOTH_COMMIT`, !r.firstErr && !r.secondErr,
      `1ª=${r.firstErr ? errText(r.firstErr) : "COMMIT"}; 2ª=${r.secondErr ? errText(r.secondErr) : "COMMIT"}`);
    record(`${id}_${blocks ? "SERIALIZED_ON_ROW_LOCK" : "NO_BLOCKING"}`, r.secondState === (blocks ? "blocked" : "done"), r.secondState);
    record(`${id}_CONSISTENT_NO_DRIFT`, Object.keys(r.final).length === 0, JSON.stringify(r.final));
    if (check) {
      const got = Object.values((await r.c1.query(check.sql)).rows[0])[0];
      record(`${id}_${check.id}`, JSON.stringify(got) === JSON.stringify(check.expected), `= ${JSON.stringify(got)}`);
    }
    await closeRace(r);
  }
  const bookOpen = (id, ses, client) =>
    `INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, updated_at) VALUES ('${id}', '${ses}', '${client}', 'confirmed', now())`;
  await legit("L01_TWO_LEGACY_BOOKINGS_SAME_SESSION", {
    first: bookOpen("bk-1", "ses", "c1"),
    second: bookOpen("bk-2", "ses", "c2"),
    blocks: true, // el UPDATE de booked_count (trigger) los serializa; KEY SHARE no provoca interbloqueo
    check: { id: "BOOKED_COUNT_2", sql: `SELECT booked_count FROM scheduled_classes WHERE id = 'ses'`, expected: 2 },
  });
  const bookConsuming = (id, ses) =>
    `INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, client_membership_id, consumption, channel, updated_at)
     VALUES ('${id}', '${ses}', 'c1', 'confirmed', 'mz', 'CONSUMED', 'STAFF', now())`;
  await legit("L02_TWO_CONSUMING_BOOKINGS_SAME_MEMBERSHIP", {
    first: bookConsuming("bk-1", "sg1"),
    second: bookConsuming("bk-2", "sg2"),
    blocks: true,
    check: { id: "SESSIONS_USED_2", sql: `SELECT sessions_used FROM client_memberships WHERE id = 'mz'`, expected: 2 },
  });
  await legit("L03_TWO_SERIES_SAME_TRAINER", {
    first: futureSeries("s-x", "tA", "b1"),
    second: futureSeries("s-y", "tA", "b1"),
    blocks: false, // FOR SHARE + FOR SHARE son compatibles
  });
  await legit("L04_TRAINER_MOVE_VS_SERIES_OF_ANOTHER_TRAINER", {
    first: MOVE_TC,
    second: futureSeries("s-x", "tB", "b1b"),
    blocks: false,
  });
  await legit("L05_TRAINER_MOVE_VS_HISTORICAL_SERIES_EDIT", {
    setup: futureSeries("s-old", "tC", "b1", "inactive"),
    first: MOVE_TC,
    second: `UPDATE class_series SET title = 'Histórica', updated_at = now() WHERE id = 's-old'`,
    blocks: false,
    check: { id: "HISTORY_KEEPS_LOCATION", sql: `SELECT location_id FROM class_series WHERE id = 's-old'`, expected: "b1" },
  });
  await legit("L06_SAME_TENANT_TRAINER_MOVE_AND_TIME_OFF_IN_NEW_BRANCH", {
    first: MOVE_TC,
    second: `INSERT INTO trainer_time_off (id, tenant_id, location_id, trainer_id, starts_on, ends_on, updated_at) VALUES ('o-new', '${T1}', 'b1b', 'tC', CURRENT_DATE + 2, CURRENT_DATE + 3, now())`,
    blocks: true,
  });
  const generate = (id, offset) => [
    `SELECT 1 FROM class_series WHERE id = 'sr' FOR NO KEY UPDATE`,
    `INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, series_id, updated_at)
     VALUES ('${id}', '${T1}', '${T1}', 'b1', 'ct1', 'tA', 'Gen', CURRENT_DATE + ${offset}, '07:00', '08:00', 10, 'GROUP', 'sr', now())`,
    `UPDATE class_series SET generated_until = GREATEST(COALESCE(generated_until, CURRENT_DATE), CURRENT_DATE + ${offset}), updated_at = now() WHERE id = 'sr'`,
  ];
  await legit("L07_SERIES_GENERATOR_LOCKS_SERIES_FIRST_NO_DEADLOCK", {
    first: generate("g1", 7),
    second: generate("g2", 14),
    blocks: true,
    check: { id: "GENERATED_UNTIL", sql: `SELECT generated_until - CURRENT_DATE FROM class_series WHERE id = 'sr'`, expected: 14 },
  });
  // H05: cancelar la reserva (solo booking_status, FOR NO KEY UPDATE) no choca
  // con vincular su asistencia (FOR KEY SHARE): sin bloqueo, sin deriva.
  await legit("L08_BOOKING_CANCEL_VS_ATTENDANCE_LINK", {
    setup: H05_BOOKING,
    first: `UPDATE class_bookings SET booking_status = 'cancelled', updated_at = now() WHERE id = 'bk5'`,
    second: linkAtt("'bk5'"),
    blocks: false,
    check: { id: "LINKED_AND_SEAT_RELEASED", sql: `SELECT (SELECT booking_id FROM class_attendance WHERE id = 'at5') || '/' || (SELECT booked_count FROM scheduled_classes WHERE id = 'ses')`, expected: "bk5/0" },
  });

  // ═══════════════════════════════════════════════════════════════════
  // D — interbloqueo evitable: detectado, sin efectos, reintentable
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n══ D: interbloqueo detectado (40P01) ══");
  {
    // Generador que NO sigue el protocolo (no bloquea la serie antes):
    // ambos toman FOR SHARE en el trigger y luego suben a NO KEY UPDATE.
    const db = await freshDb();
    const a = await connect(db);
    const b = await connect(db);
    const pidA = (await a.query("SELECT pg_backend_pid() AS p")).rows[0].p;
    const pidB = (await b.query("SELECT pg_backend_pid() AS p")).rows[0].p;
    const gen = (id, offset) =>
      `INSERT INTO scheduled_classes (id, gym_id, tenant_id, branch_id, class_type_id, trainer_id, title, class_date, start_time, end_time, capacity, session_kind, series_id, updated_at)
       VALUES ('${id}', '${T1}', '${T1}', 'b1', 'ct1', 'tA', 'Gen', CURRENT_DATE + ${offset}, '07:00', '08:00', 10, 'GROUP', 'sr', now())`;
    const bump = (offset) => `UPDATE class_series SET generated_until = CURRENT_DATE + ${offset}, updated_at = now() WHERE id = 'sr'`;
    await a.query("BEGIN");
    await b.query("BEGIN");
    await a.query(gen("d1", 7));
    await b.query(gen("d2", 14));
    const pa = a.query(bump(7)).then(() => null, (e) => e);
    const sa = await waitBlockedOrDone(pidA, pa);
    const pb = b.query(bump(14)).then(() => null, (e) => e);
    const [ea, eb] = await Promise.all([pa, pb]);
    const victim = ea ?? eb;
    const survivor = ea ? b : a;
    const victimConn = ea ? a : b;
    record("D01_UPGRADE_DEADLOCK_IS_DETECTED_NOT_PERMANENT", sa === "blocked" && !!victim && victim.code === "40P01" && !(ea && eb),
      `1ª esperó=${sa}; ${victim ? errText(victim) : "sin víctima"}; pids=${pidA},${pidB}`);
    record("D01_ERROR_MAPS_TO_CONCURRENT_UPDATE_RETRY", mapGymBookingDbError(victim) === "CONCURRENT_UPDATE_RETRY", String(mapGymBookingDbError(victim)));
    await victimConn.query("ROLLBACK");
    await survivor.query("COMMIT");
    const after = await violations(a);
    record("D01_VICTIM_LEFT_NO_EFFECTS_AND_DB_CONSISTENT", Object.keys(after).length === 0
      && (await a.query(`SELECT COUNT(*)::int AS n FROM scheduled_classes WHERE id IN ('d1','d2')`)).rows[0].n === 1, JSON.stringify(after));
    // Reintento acotado de la víctima, ahora siguiendo el protocolo.
    const victimId = ea ? "d1" : "d2";
    const offset = ea ? 7 : 14;
    await victimConn.query("BEGIN");
    await victimConn.query(`SELECT 1 FROM class_series WHERE id = 'sr' FOR NO KEY UPDATE`);
    await victimConn.query(gen(victimId, offset));
    await victimConn.query(`UPDATE class_series SET generated_until = GREATEST(generated_until, CURRENT_DATE + ${offset}) WHERE id = 'sr'`);
    await victimConn.query("COMMIT");
    record("D01_RETRY_SUCCEEDS", (await a.query(`SELECT COUNT(*)::int AS n FROM scheduled_classes WHERE id IN ('d1','d2')`)).rows[0].n === 2);
    await a.end();
    await b.end();
    await dropDb(db);
  }

  // ═══════════════════════════════════════════════════════════════════
  // I — aislamiento: fallo cerrado fuera de READ COMMITTED
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n══ I: aislamiento ══");
  {
    const db = await freshDb();
    const c = await connect(db);
    for (const iso of ["REPEATABLE READ", "SERIALIZABLE"]) {
      await c.query(`BEGIN ISOLATION LEVEL ${iso}`);
      try {
        await c.query(MOVE_TC);
        record(`I01_STRUCTURAL_PARENT_CHANGE_${iso.replace(" ", "_")}_REJECTED`, false, "pasó");
      } catch (e) {
        record(`I01_STRUCTURAL_PARENT_CHANGE_${iso.replace(" ", "_")}_REJECTED`, /GYM_ISOLATION_UNSUPPORTED/.test(e.message)
          && mapGymBookingDbError(e) === "ISOLATION_UNSUPPORTED", errText(e));
      }
      await c.query("ROLLBACK");
      await c.query(`BEGIN ISOLATION LEVEL ${iso}`);
      try {
        await c.query(`UPDATE trainers SET first_name = 'Editado', branch_id = 'b1', updated_at = now() WHERE id = 'tC'`);
        record(`I02_NON_STRUCTURAL_EDIT_${iso.replace(" ", "_")}_ALLOWED`, true);
      } catch (e) {
        record(`I02_NON_STRUCTURAL_EDIT_${iso.replace(" ", "_")}_ALLOWED`, false, errText(e));
      }
      await c.query("ROLLBACK");
    }
    await c.end();
    await dropDb(db);
  }
  {
    // Hijo en REPEATABLE READ con instantánea previa; el padre (RC) cambia y confirma mientras el hijo espera.
    const r = await race({
      first: MOVE_TC,
      second: futureSeries("s-new", "tC", "b1"),
      secondIso: "REPEATABLE READ",
      secondPre: "SELECT 1",
    });
    record("I03_CHILD_REPEATABLE_READ_GETS_40001", r.secondState === "blocked" && r.secondErr?.code === "40001"
      && mapGymBookingDbError(r.secondErr) === "CONCURRENT_UPDATE_RETRY", `${r.secondState}; ${r.secondErr ? errText(r.secondErr) : "confirmó"}`);
    record("I03_CONSISTENT", r.final && Object.keys(r.final).length === 0, JSON.stringify(r.final));
    await closeRace(r);
  }

  // ═══════════════════════════════════════════════════════════════════
  // R — sin recursividad ni efectos duplicados (llamadas por transacción)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n══ R: llamadas a funciones de trigger ══");
  {
    const db = await freshDb();
    let c = await connect(db);
    await c.query(`INSERT INTO trainer_time_off (id, tenant_id, location_id, trainer_id, starts_on, ends_on, updated_at) VALUES
      ('o1', '${T1}', 'b1', 'tC', CURRENT_DATE + 1, CURRENT_DATE + 2, now()), ('o2', '${T1}', 'b1', 'tC', CURRENT_DATE + 5, CURRENT_DATE + 6, now()),
      ('o-past', '${T1}', 'b1', 'tC', CURRENT_DATE - 9, CURRENT_DATE - 8, now())`);
    await c.query("SET track_functions = 'pl'");
    await c.query("BEGIN");
    await c.query(MOVE_TC);
    const calls = Object.fromEntries((await c.query(
      `SELECT funcname, calls::int FROM pg_stat_xact_user_functions WHERE funcname LIKE 'gym_%' ORDER BY 1`)).rows.map((x) => [x.funcname, x.calls]));
    await c.query("COMMIT");
    const expected = { gym_require_read_committed: 1, gym_trainer_location_matches: 2, gym_trainers_branch_cascade_time_off: 1, gym_trainers_branch_guard: 1 };
    record("R01_TRAINER_MOVE_EACH_TRIGGER_ONCE_CASCADE_ONCE_PER_ROW", JSON.stringify(calls) === JSON.stringify(expected), JSON.stringify(calls));
    // Conexión nueva: las estadísticas pendientes de la transacción anterior
    // siguen visibles en pg_stat_xact_* de la misma sesión hasta su flush.
    await c.end();
    c = await connect(db);
    await c.query("SET track_functions = 'pl'");
    await c.query("BEGIN");
    await c.query(`INSERT INTO class_bookings (id, scheduled_class_id, client_id, booking_status, client_membership_id, consumption, channel, updated_at)
                   VALUES ('bk-r', 'sg1', 'c1', 'confirmed', 'mz', 'CONSUMED', 'STAFF', now())`);
    const calls2 = Object.fromEntries((await c.query(
      `SELECT funcname, calls::int FROM pg_stat_xact_user_functions WHERE funcname LIKE 'gym_%' ORDER BY 1`)).rows.map((x) => [x.funcname, x.calls]));
    const counters = (await c.query(`SELECT (SELECT booked_count FROM scheduled_classes WHERE id='sg1') || '/' || (SELECT sessions_used FROM client_memberships WHERE id='mz') AS v`)).rows[0].v;
    await c.query("COMMIT");
    const expected2 = { gym_class_bookings_counters: 1, gym_class_bookings_integrity: 1, gym_guard_booking_counters: 2 };
    record("R02_CONSUMING_BOOKING_EACH_TRIGGER_ONCE", JSON.stringify(calls2) === JSON.stringify(expected2) && counters === "1/1", `${JSON.stringify(calls2)} contadores=${counters}`);
    await c.end();
    await dropDb(db);
  }
}

await dropDb(TEMPLATE);
await admin.end();

if (COUNTERFACTUAL) {
  const raced = summary.filter((s) => s.raced);
  console.log(`\n══ CONTRAFACTUAL: ${raced.length}/${summary.length} órdenes dejaron datos inconsistentes con la migración previa ══`);
  for (const s of raced) console.log(`  RACE ${s.id}`);
} else {
  const failed = results.filter((x) => !x.ok);
  console.log(`\n══ RESULTADO concurrencia: ${results.length - failed.length}/${results.length} PASS ══`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.id}: ${f.detail}`);
    process.exitCode = 1;
  }
}
