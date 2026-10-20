/**
 * certify-gym-bookings-prisma-migrate.mjs
 *
 * GYM-BOOKINGS 2A — certifica el mecanismo REAL de Prisma Migrate (CLI del
 * repo) sobre un PostgreSQL desechable y aislado:
 *
 *  M1  migrate deploy limpio + migrate status + migrate diff sin drift.
 *  M2  falla inyectada al FINAL de la migración (después de todo el DDL y
 *      los triggers): deploy falla y no queda esquema parcial.
 *  M3  recuperación Prisma 6 tras M2: migrate resolve --rolled-back →
 *      deploy de la migración correcta → status limpio, sin drift.
 *  M4  falla inyectada a MITAD (después del DDL de Prisma): sin esquema parcial.
 *  M5  `prisma db execute --file` con la migración fallida: sin esquema parcial.
 *  M6  reversión de una migración YA aplicada: `resolve --rolled-back` no
 *      aplica (se registra el error real) → roll-forward con una migración de
 *      reversión (cuerpo = rollback-gym-bookings-foundation.sql) + schema
 *      previo → status limpio, sin drift contra el schema previo.
 *  M7  reversión bloqueada por datos nuevos: deploy falla atómicamente,
 *      el esquema 2A queda intacto, y se recupera con resolve --rolled-back.
 *
 * Aislamiento: rechaza servidores que no sean 127.0.0.1, puerto 5432, o
 * cuyo data_directory no sea CERT_PG_DATA_DIR. Crea/borra bases zolvi_cert_*.
 * Los proyectos Prisma temporales usan URL literal en el datasource y viven
 * en CERT_WORK_DIR (sin .env ni prisma.config.ts) → no puede tocar
 * DATABASE_URL / DIRECT_URL del repo.
 *
 *   $env:PG_MODULE_DIR     = "<carpeta con node_modules/pg>"
 *   $env:CERT_PG_ADMIN_URL = "postgresql://<user>:<pwd>@127.0.0.1:<port>/postgres"
 *   $env:CERT_PG_DATA_DIR  = "<data_directory del servidor desechable>"
 *   $env:CERT_WORK_DIR     = "<carpeta temporal vacía>"
 *   node prisma/scripts/gym-bookings/certify-gym-bookings-prisma-migrate.mjs
 */

import { spawnSync, execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const prismaCli = path.join(repoRoot, "node_modules/prisma/build/index.js");
const TARGET = "20261019000000_gym_bookings_foundation";
const REVERT = "20261019000001_revert_gym_bookings_foundation";
const migrationsDir = path.join(repoRoot, "prisma/migrations");
const targetSql = readFileSync(path.join(migrationsDir, TARGET, "migration.sql"), "utf8");
const rollbackSql = readFileSync(path.join(here, "rollback-gym-bookings-foundation.sql"), "utf8");
const schemaNew = readFileSync(path.join(repoRoot, "prisma/schema.prisma"), "utf8");
const baseRef = process.env.CERT_BASE_REF ?? "origin/main";
const schemaOld = execFileSync("git", ["show", `${baseRef}:prisma/schema.prisma`], { cwd: repoRoot, encoding: "utf8" });

const { Client } = createRequire(path.join(process.env.PG_MODULE_DIR ?? "", "noop.js"))("pg");
const adminUrl = process.env.CERT_PG_ADMIN_URL;
const dataDir = process.env.CERT_PG_DATA_DIR;
const workDir = process.env.CERT_WORK_DIR;
if (!adminUrl || !dataDir || !workDir) throw new Error("Faltan CERT_PG_ADMIN_URL / CERT_PG_DATA_DIR / CERT_WORK_DIR");
const au = new URL(adminUrl);
if (au.hostname !== "127.0.0.1" || (au.port || "5432") === "5432") throw new Error("Rechazado: solo 127.0.0.1 y puerto ≠ 5432");
const norm = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const admin = new Client({ connectionString: adminUrl });
await admin.connect();
const { rows: dd } = await admin.query("SELECT current_setting('data_directory') AS d, current_setting('server_version') AS v");
if (norm(dd[0].d) !== norm(dataDir)) throw new Error(`Rechazado: data_directory=${dd[0].d}`);

const results = [];
const record = (id, ok, detail = "") => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? `  — ${detail}` : ""}`);
};
record("ISOLATION", true, `PostgreSQL ${dd[0].v} en ${au.hostname}:${au.port}, data_directory = CERT_PG_DATA_DIR`);

let seq = 0;
async function freshDb(tag) {
  const name = `zolvi_cert_prisma_${tag}_${process.pid}_${seq++}`;
  await admin.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
  const u = new URL(adminUrl);
  u.pathname = `/${name}`;
  return { name, url: u.toString() };
}
async function withClient(url, fn) {
  const c = new Client({ connectionString: url });
  c.on("notice", () => {});
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}
async function snapshot(url) {
  return withClient(url, async (c) => {
    const q = async (sql) => (await c.query(sql)).rows.map((r) => JSON.stringify(r)).join("\n");
    return [
      await q(`SELECT table_name, column_name, udt_name, is_nullable, column_default FROM information_schema.columns
                WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY 1,2`),
      await q(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY 1`),
      await q(`SELECT conname, pg_get_constraintdef(oid) d FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1`),
      await q(`SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace AND typtype='e' ORDER BY 1`),
      await q(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1`),
      await q(`SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY 1`),
    ].join("\n##\n");
  });
}
const migrationRow = (url, name) =>
  withClient(url, async (c) =>
    (await c.query(`SELECT finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back, applied_steps_count,
                           COALESCE(logs, '') AS logs
                      FROM _prisma_migrations WHERE migration_name = $1 ORDER BY started_at DESC LIMIT 1`, [name])).rows[0]);

/** Proyecto Prisma temporal con URL literal y un subconjunto de migraciones. */
function project(tag, url, { include = (n) => n <= TARGET, overrides = {}, extra = {}, schema = schemaNew } = {}) {
  const dir = path.join(workDir, `${tag}-${seq++}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "prisma/migrations"), { recursive: true });
  cpSync(path.join(migrationsDir, "migration_lock.toml"), path.join(dir, "prisma/migrations/migration_lock.toml"));
  for (const name of readdirSync(migrationsDir).filter((n) => /^\d{14}_/.test(n) && include(n))) {
    const dest = path.join(dir, "prisma/migrations", name);
    mkdirSync(dest);
    writeFileSync(path.join(dest, "migration.sql"), overrides[name] ?? readFileSync(path.join(migrationsDir, name, "migration.sql")));
  }
  for (const [name, sql] of Object.entries(extra)) {
    mkdirSync(path.join(dir, "prisma/migrations", name));
    writeFileSync(path.join(dir, "prisma/migrations", name, "migration.sql"), sql);
  }
  const literal = schema
    .replace(/^\s*url\s*=\s*env\("DATABASE_URL"\)/m, `  url       = "${url}"`)
    .replace(/^\s*directUrl\s*=\s*env\("DIRECT_URL"\)/m, `  directUrl = "${url}"`);
  if (!literal.includes(`"${url}"`)) throw new Error("no se pudo fijar la URL literal del datasource");
  writeFileSync(path.join(dir, "prisma/schema.prisma"), literal);
  return dir;
}
function prisma(dir, url, args) {
    // migrate diff no acepta --schema (lee los datamodels de sus propios flags).
  const withSchema = args[1] === "diff" ? args : [...args, "--schema", "prisma/schema.prisma"];
  const r = spawnSync(process.execPath, [prismaCli, ...withSchema], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1" },
  });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}
const firstLine = (s, re) => (s.split("\n").find((l) => re.test(l)) ?? "").trim();
const faultLate = `${targetSql}\nSELECT 1/0; -- FALLA INYECTADA (después de todo el DDL y los triggers)\n`;
const p2 = targetSql.indexOf("-- PARTE 2");
const faultMid = `${targetSql.slice(0, p2)}SELECT 1/0; -- FALLA INYECTADA\n${targetSql.slice(p2)}`;

// ── M1 ──
const d1 = await freshDb("m1");
const p1 = project("m1", d1.url);
let r = prisma(p1, d1.url, ["migrate", "deploy"]);
record("M1_DEPLOY_CLEAN", r.code === 0, firstLine(r.out, /applied|Applying migration `2026101/i));
const row1 = await migrationRow(d1.url, TARGET);
record("M1_MIGRATION_RECORDED_FINISHED", row1?.finished === true && row1.rolled_back === false, `applied_steps_count=${row1?.applied_steps_count}`);
r = prisma(p1, d1.url, ["migrate", "status"]);
record("M1_STATUS_UP_TO_DATE", r.code === 0 && /up to date/i.test(r.out), firstLine(r.out, /up to date|not yet|failed/i));
r = prisma(p1, d1.url, ["migrate", "diff", "--from-url", d1.url, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"]);
record("M1_NO_DRIFT_DB_VS_SCHEMA", r.code === 0, `exit=${r.code}`);

// ── M2 / M3 ──
async function faultScenario(tag, faulty) {
  const d = await freshDb(tag);
  const prev = project(`${tag}-prev`, d.url, { include: (n) => n < TARGET });
  prisma(prev, d.url, ["migrate", "deploy"]);
  const before = await snapshot(d.url);
  const pf = project(`${tag}-fault`, d.url, { overrides: { [TARGET]: faulty } });
  const res = prisma(pf, d.url, ["migrate", "deploy"]);
  record(`${tag}_DEPLOY_FAILS_P3018`, res.code !== 0 && /P3018/.test(res.out) && /division by zero/.test(res.out), firstLine(res.out, /P3018|division/) || res.out.slice(-400));
  record(`${tag}_NO_PARTIAL_SCHEMA`, before === (await snapshot(d.url)));
  const row = await migrationRow(d.url, TARGET);
  record(`${tag}_RECORDED_AS_FAILED`, row?.finished === false && row.rolled_back === false, `finished=${row?.finished} rolled_back=${row?.rolled_back}`);
  record(`${tag}_REAL_ERROR_IN_PRISMA_LOGS`, /division by zero/.test(row?.logs ?? ""), firstLine(row?.logs ?? "", /division|ERROR/));
  return { d, pf };
}
const { d: d2, pf: pf2 } = await faultScenario("M2", faultLate);
r = prisma(pf2, d2.url, ["migrate", "resolve", "--rolled-back", TARGET]);
record("M3_RESOLVE_ROLLED_BACK_AFTER_FAILURE", r.code === 0, firstLine(r.out, /rolled back|marked/i));
const pfix = project("m3-fix", d2.url);
r = prisma(pfix, d2.url, ["migrate", "deploy"]);
record("M3_REDEPLOY_CORRECT_MIGRATION", r.code === 0, firstLine(r.out, /applied/i));
r = prisma(pfix, d2.url, ["migrate", "status"]);
record("M3_STATUS_UP_TO_DATE", r.code === 0 && /up to date/i.test(r.out));
r = prisma(pfix, d2.url, ["migrate", "diff", "--from-url", d2.url, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"]);
record("M3_NO_DRIFT", r.code === 0, `exit=${r.code}`);

// ── M4 ──
await faultScenario("M4", faultMid);

// ── M5: prisma db execute ──
{
  const d = await freshDb("m5");
  const prev = project("m5-prev", d.url, { include: (n) => n < TARGET });
  prisma(prev, d.url, ["migrate", "deploy"]);
  const before = await snapshot(d.url);
  const file = path.join(prev, "faulty.sql");
  writeFileSync(file, faultMid);
  const res = prisma(prev, d.url, ["db", "execute", "--file", "faulty.sql"]);
  record("M5_DB_EXECUTE_FAILS", res.code !== 0 && /division by zero/.test(res.out), firstLine(res.out, /division|error/i));
  record("M5_DB_EXECUTE_NO_PARTIAL_SCHEMA", before === (await snapshot(d.url)));
}

// ── M6: reversión de una migración aplicada (roll-forward) ──
r = prisma(p1, d1.url, ["migrate", "resolve", "--rolled-back", TARGET]);
record("M6_RESOLVE_ROLLED_BACK_REFUSED_ON_APPLIED", r.code !== 0, firstLine(r.out, /P30\d\d|cannot|failed state|Error/i));
const beforeOld = await (async () => {
  const d = await freshDb("m6-ref");
  prisma(project("m6-ref", d.url, { include: (n) => n < TARGET }), d.url, ["migrate", "deploy"]);
  return snapshot(d.url);
})();
const p6 = project("m6-revert", d1.url, { extra: { [REVERT]: rollbackSql }, schema: schemaOld });
r = prisma(p6, d1.url, ["migrate", "deploy"]);
record("M6_ROLL_FORWARD_REVERT_DEPLOYS", r.code === 0, firstLine(r.out, /applied|Applying migration `20261019000001/i));
r = prisma(p6, d1.url, ["migrate", "status"]);
record("M6_STATUS_UP_TO_DATE_WITH_FULL_HISTORY", r.code === 0 && /up to date/i.test(r.out));
r = prisma(p6, d1.url, ["migrate", "diff", "--from-url", d1.url, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"]);
record("M6_NO_DRIFT_AGAINST_PREVIOUS_SCHEMA", r.code === 0, `exit=${r.code}`);
record("M6_SCHEMA_IDENTICAL_TO_PRE_2A", beforeOld === (await snapshot(d1.url)));

// ── M7: reversión bloqueada ──
{
  const d = await freshDb("m7");
  prisma(project("m7", d.url), d.url, ["migrate", "deploy"]);
  await withClient(d.url, (c) =>
    c.query(`INSERT INTO runtime_tenants (id, name, slug, updated_at) VALUES ('t-m7', 'T', 't-m7', now());
             INSERT INTO gym_activities (id, tenant_id, name, updated_at) VALUES ('a-m7', 't-m7', 'Act', now());`));
  const migrated = await snapshot(d.url);
  const pr = project("m7-revert", d.url, { extra: { [REVERT]: rollbackSql }, schema: schemaOld });
  const res = prisma(pr, d.url, ["migrate", "deploy"]);
  record("M7_REVERT_BLOCKED_BY_NEW_DATA", res.code !== 0 && /GYM_ROLLBACK_BLOCKED/.test(res.out), firstLine(res.out, /GYM_ROLLBACK_BLOCKED/) || res.out.slice(-400));
  record("M7_SCHEMA_2A_INTACT", migrated === (await snapshot(d.url)));
  const rowR = await migrationRow(d.url, REVERT);
  record("M7_BLOCK_REASON_IN_PRISMA_LOGS", /GYM_ROLLBACK_BLOCKED: datos nuevos presentes en: gym_activities/.test(rowR?.logs ?? ""),
    firstLine(rowR?.logs ?? "", /GYM_ROLLBACK_BLOCKED/));
  const rr = prisma(pr, d.url, ["migrate", "resolve", "--rolled-back", REVERT]);
  record("M7_RESOLVE_ROLLED_BACK_REVERT", rr.code === 0);
  const st = prisma(project("m7-after", d.url), d.url, ["migrate", "status"]);
  record("M7_STATUS_UP_TO_DATE_WITHOUT_REVERT_DIR", st.code === 0 && /up to date/i.test(st.out), firstLine(st.out, /up to date|not yet|failed/i));
}

// ── M8: contrafactual medido — BEGIN/COMMIT explícitos dentro del archivo ──
{
  const d = await freshDb("m8");
  prisma(project("m8-prev", d.url, { include: (n) => n < TARGET }), d.url, ["migrate", "deploy"]);
  const before = await snapshot(d.url);
  const explicitTx = `BEGIN;\n${faultMid}\nCOMMIT;\n`;
  const res = prisma(project("m8", d.url, { overrides: { [TARGET]: explicitTx } }), d.url, ["migrate", "deploy"]);
  const row = await migrationRow(d.url, TARGET);
  record("M8_INFO_EXPLICIT_TX_STILL_NO_PARTIAL_SCHEMA", before === (await snapshot(d.url)));
  record("M8_INFO_EXPLICIT_TX_HIDES_REAL_ERROR",
    /current transaction is aborted/.test(res.out) && !/division by zero/.test(row?.logs ?? ""),
    "con BEGIN explícito Prisma pierde el error real → se descartó BEGIN/COMMIT en el archivo");
}

const { rows: dbs } = await admin.query(`SELECT datname FROM pg_database WHERE datname LIKE 'zolvi_cert_prisma_%'`);
for (const { datname } of dbs) await admin.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
await admin.end();

const failed = results.filter((x) => !x.ok);
console.log(`\n══ RESULTADO prisma migrate: ${results.length - failed.length}/${results.length} PASS ══`);
if (failed.length) {
  for (const f of failed) console.log(`  FAIL ${f.id}: ${f.detail}`);
  process.exitCode = 1;
}
