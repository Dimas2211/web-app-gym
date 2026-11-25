// COR-01 — reinicio anual del correlativo contra PostgreSQL DESECHABLE.
//
// Se omite salvo que MH20_SCRATCH_DATABASE_URL apunte a localhost y a una base
// cuyo nombre contenga "_scratch_" (guarda contra bases persistentes). La base
// debe tener TODAS las migraciones aplicadas, incluida
// 20261125000000_cor01_fiscal_year. Cada ejecución usa un tenant aleatorio.
//
//   MH20_SCRATCH_DATABASE_URL=postgresql://…@localhost:5432/zolvi_scratch_cor01 \
//   DATABASE_URL=$MH20_SCRATCH_DATABASE_URL npx vitest run dte-correlative.cor01.pg

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  alignDteCorrelativeBaseline,
  getDteCorrelativeStatus,
  reserveDteControlNumber,
  reserveDteControlNumberBlock,
  type DteCorrelativeIssuerContext,
} from "./dte-correlative.service";
import { checkDteFiscalYearForGeneration } from "../utils/dte-fiscal-year";

const URL_ENV = process.env.MH20_SCRATCH_DATABASE_URL ?? "";
const RUN = (() => {
  try {
    const u = new URL(URL_ENV);
    return ["localhost", "127.0.0.1"].includes(u.hostname) && /_scratch_/.test(u.pathname);
  } catch {
    return false;
  }
})();

const Y2026_LATE = new Date("2027-01-01T05:59:59.000Z"); // 31/12/2026 23:59:59 SV
const Y2027_START = new Date("2027-01-01T06:00:00.000Z"); // 01/01/2027 00:00:00 SV

describe.skipIf(!RUN)("COR-01 — PostgreSQL desechable", () => {
  let db: PrismaClient;
  const T = `t-cor01-${randomUUID()}`;
  const L = `l-cor01-${randomUUID()}`;
  let ISS_TEST = "";
  let ISS_PROD = "";
  let USER_ID = "";

  const ctx = (type: string, env: "TEST" | "PRODUCTION" = "TEST"): DteCorrelativeIssuerContext => ({
    tenant_id: T, location_id: L, issuer_config_id: env === "TEST" ? ISS_TEST : ISS_PROD, environment: env,
    dte_type_code: type, cod_estable_mh: "M001", cod_punto_venta_mh: "P001",
  });

  // Reserva + creación del documento en la MISMA transacción (como los servicios reales).
  async function emit(type: string, now: Date, env: "TEST" | "PRODUCTION" = "TEST") {
    return db.$transaction(async (tx) => {
      const r = await reserveDteControlNumber(tx, ctx(type, env), { now });
      const doc = await tx.dteOutgoingDocument.create({
        data: {
          tenant_id: T, location_id: L, issuer_config_id: ctx(type, env).issuer_config_id, dte_type_code: type,
          environment: env, generation_code: randomUUID().toUpperCase(), control_number: r.control_number,
          fiscal_year: r.fiscal_year, dte_status: "PENDING_GENERATION", retry_count: 0,
        },
        select: { id: true, control_number: true, fiscal_year: true, created_at: true },
      });
      return { ...r, doc };
    });
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: URL_ENV } } });
    const cols = await db.$queryRaw<Array<{ n: bigint }>>`select count(*)::bigint as n from information_schema.columns where table_name = 'dte_outgoing_documents' and column_name = 'fiscal_year'`;
    expect(Number(cols[0].n)).toBe(1); // M-COR-01 aplicada en la base desechable
    const mk = (environment: "TEST" | "PRODUCTION") => db.dteIssuerConfig.create({
      data: { tenant_id: T, location_id: L, environment, nit: "06140000000000", name: `COR01 ${environment}`, cod_estable_mh: "M001", cod_punto_venta_mh: "P001" },
      select: { id: true },
    });
    ISS_TEST = (await mk("TEST")).id;
    ISS_PROD = (await mk("PRODUCTION")).id;
    // external_baseline_set_by es FK a users → usuario mínimo en la base desechable.
    const rt = await db.runtimeTenant.create({ data: { id: T, name: "COR01 PG", slug: T } });
    USER_ID = (await db.user.create({
      data: { tenant_id: rt.id, email: `cor01-${randomUUID()}@scratch.local`, password_hash: "x", first_name: "COR", last_name: "01", role: "super_admin" },
      select: { id: true },
    })).id;
  });

  afterAll(async () => { await db?.$disconnect(); });

  it("transición 2026 → 2027 y reinicio anual: el primer DTE de 2027 es la secuencia 1", async () => {
    const a = await emit("01", Y2026_LATE);
    const b = await emit("01", Y2026_LATE);
    const c = await emit("01", Y2027_START);
    expect([a.sequence, b.sequence]).toEqual([1, 2]);
    expect(a.fiscal_year).toBe(2026);
    expect(c).toMatchObject({ sequence: 1, fiscal_year: 2027 });
    expect(c.control_number).toBe(a.control_number); // mismo número, distinto ejercicio
    const rows = await db.dteCorrelative.findMany({ where: { tenant_id: T, dte_type_code: "01", environment: "TEST" }, orderBy: { year: "asc" } });
    expect(rows.map((r) => [r.year, r.last_sequence])).toEqual([[2026, 2], [2027, 1]]);
  });

  it("unicidad: el mismo número se repite entre años, nunca dentro del mismo año (P2002)", async () => {
    const dup = db.dteOutgoingDocument.create({
      data: { tenant_id: T, location_id: L, issuer_config_id: ISS_TEST, dte_type_code: "01", environment: "TEST",
        generation_code: randomUUID().toUpperCase(), control_number: "DTE-01-M001P001-000000000000001", fiscal_year: 2027, dte_status: "PENDING_GENERATION", retry_count: 0 },
    });
    await expect(dup).rejects.toMatchObject({ code: "P2002" });
  });

  it("concurrencia en el cambio de año: 25 reservas simultáneas sin fila previa → 1..25 sin duplicados ni P2002", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => emit("03", Y2027_START)));
    const seqs = results.map((r) => r.sequence).sort((x, y) => x - y);
    expect(seqs).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(new Set(results.map((r) => r.control_number)).size).toBe(25);
    expect(results.every((r) => r.fiscal_year === 2027)).toBe(true);
  });

  it("concurrencia mixta: bloque MH TEST + reservas operativas en el mismo año → sin duplicados", async () => {
    await emit("14", Y2027_START); // fila existente
    const block = db.$transaction((tx) => reserveDteControlNumberBlock(tx, ctx("14"), { firstSequence: 50, count: 10, now: Y2027_START }));
    const ops = Array.from({ length: 10 }, () => emit("14", Y2027_START));
    const [blk, ...op] = await Promise.all([block, ...ops]);
    const opSeqs = op.map((o) => o.sequence);
    const all = [...opSeqs, ...(blk.ok ? blk.reserved.map((r) => r.sequence) : [])];
    expect(new Set(all).size).toBe(all.length);
    if (blk.ok) expect(blk.fiscal_year).toBe(2027);
  });

  it("separación TEST/PRODUCTION: secuencias independientes por ambiente y año", async () => {
    const p = await emit("01", Y2027_START, "PRODUCTION");
    expect(p).toMatchObject({ sequence: 1, fiscal_year: 2027 });
    const t = await emit("01", Y2027_START, "TEST");
    expect(t.sequence).toBe(2); // TEST 2027 ya tenía la 1
  });

  it("pendiente del año anterior: conserva su numeroControl y la generación en 2027 se rechaza", async () => {
    const pending = await emit("05", Y2026_LATE);
    const loaded = await db.dteOutgoingDocument.findUniqueOrThrow({ where: { id: pending.doc.id }, select: { fiscal_year: true, created_at: true, control_number: true } });
    const check = checkDteFiscalYearForGeneration(loaded, Y2027_START);
    expect(check).toMatchObject({ ok: false, code: "DTE_FISCAL_YEAR_MISMATCH" });
    const after = await db.dteOutgoingDocument.findUniqueOrThrow({ where: { id: pending.doc.id }, select: { control_number: true, fiscal_year: true } });
    expect(after).toEqual({ control_number: pending.control_number, fiscal_year: 2026 });
    // El ejercicio nuevo empieza en 1 sin tocar el pendiente.
    expect((await emit("05", Y2027_START)).sequence).toBe(1);
  });

  it("heredado ambiguo (fiscal_year NULL): índice parcial impide duplicarlo y su número cuenta en el piso", async () => {
    const legacyCn = "DTE-11-M001P001-000000000000007";
    const base = { tenant_id: T, location_id: L, issuer_config_id: ISS_TEST, dte_type_code: "11", environment: "TEST" as const, control_number: legacyCn, dte_status: "PENDING_GENERATION" as const, retry_count: 0 };
    await db.dteOutgoingDocument.create({ data: { ...base, generation_code: randomUUID().toUpperCase() } });
    await expect(db.dteOutgoingDocument.create({ data: { ...base, generation_code: randomUUID().toUpperCase() } })).rejects.toMatchObject({ code: "P2002" });
    const r = await emit("11", Y2027_START);
    expect(r.sequence).toBe(8); // fail-safe: nunca reutiliza un número de asignación anual desconocida
  });

  it("alineación administrativa por año: baseline 2027 no afecta 2026", async () => {
    const before2026 = await getDteCorrelativeStatus({ ...ctx("01"), fiscal_year: 2026 }, db);
    const res = await alignDteCorrelativeBaseline({ ...ctx("01"), last_used_sequence: 300, source: "Sistema anterior", notes: "Evidencia COR-01 PG", user_id: USER_ID, fiscal_year: 2027 }, db);
    expect(res).toEqual({ ok: true, next_sequence: 301 });
    expect((await emit("01", Y2027_START)).sequence).toBe(301);
    const after2026 = await getDteCorrelativeStatus({ ...ctx("01"), fiscal_year: 2026 }, db);
    expect(after2026.next_sequence).toBe(before2026.next_sequence);
    expect(after2026.baseline_last_used_sequence).toBeNull();
  });

  it("compatibilidad histórica: el estado 2026 sigue mostrando su piso real tras emitir en 2027", async () => {
    const s = await getDteCorrelativeStatus({ ...ctx("01"), fiscal_year: 2026 }, db);
    expect(s).toMatchObject({ fiscal_year: 2026, local_last_sequence: 2, next_sequence: 3 });
  });
});
