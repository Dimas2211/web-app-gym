// ─────────────────────────────────────────────────────────────────
// DTE-MH-TEST-RUNS — pruebas de concurrencia contra PostgreSQL REAL.
//
// Solo corren si MH_TEST_PG_URL apunta a una base DESECHABLE con la
// migración 20261116000000_dte_mh_test_runs aplicada y un emisor TEST
// (id ISS-T, tenant t1, location L1, M001/P001). Nunca contra bases de
// clientes ni Control Plane remoto. En CI/local normal se omiten.
//
//   MH_TEST_PG_URL=postgresql://mhtest@localhost:55439/mig_test npx vitest run mh-test-runs.pg
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { materializeMhTestDocuments } from "./mh-test-documents.service";
import { reserveDteControlNumber, reserveDteControlNumberBlock } from "../services/dte-correlative.service";
import { createPrismaMhTestRunRepository } from "@/modules/platform/dte-onboarding/mh-test-runs/mh-test-run.repository";

const URL = process.env.MH_TEST_PG_URL;
const scope = { tenantId: "t1", locationId: "L1", issuerConfigId: "ISS-T", userId: null as unknown as string, contingency: null };
const ctx = (type: string) => ({
  tenant_id: "t1", location_id: "L1", issuer_config_id: "ISS-T", environment: "TEST" as const,
  dte_type_code: type, cod_estable_mh: "M001", cod_punto_venta_mh: "P001",
});

describe.skipIf(!URL)("PostgreSQL real — reserva en bloque, materialización y lease", () => {
  let db: PrismaClient;
  beforeAll(() => { db = new PrismaClient({ datasources: { db: { url: URL } } }); });
  afterAll(async () => { await db.$disconnect(); });

  async function nextFree(type: string): Promise<number> {
    const r = await db.$transaction((tx) => reserveDteControlNumberBlock(tx, ctx(type), { firstSequence: 999_999_999, count: 1 }).then(async (res) => { throw Object.assign(new Error("rollback"), { res }); }))
      .catch((e: { res?: unknown }) => e.res as { ok: boolean; next_available?: number; floor?: number });
    // El bloque de sondeo se revierte (rollback); devolvemos el piso real + 1.
    return (r as { ok: true; floor: number }).floor + 1;
  }

  it("materialización concurrente de la MISMA corrida: un solo juego de documentos, ambas respuestas consistentes", async () => {
    const runId = `pg-${randomUUID()}`;
    const first = await nextFree("14");
    const items = [0, 1, 2].map((i) => ({ key: `${runId}:${i + 1}`, dteTypeCode: "14" as const, plannedSequence: first + i, contingency: false }));
    const [a, b] = await Promise.all([materializeMhTestDocuments(db, scope, items), materializeMhTestDocuments(db, scope, items)]);
    expect(a.ok && b.ok).toBe(true);
    const rows = await db.dteOutgoingDocument.findMany({ where: { certification_item_key: { startsWith: `${runId}:` } } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.purpose === "MH_TEST_CERTIFICATION" && r.environment === "TEST" && r.sale_id === null)).toBe(true);
    expect(new Set(rows.map((r) => r.control_number)).size).toBe(3);
    // Reintento posterior = recuperación por clave, sin reservar.
    const again = await materializeMhTestDocuments(db, scope, items);
    expect(again).toMatchObject({ ok: true, recovered: true });
  });

  it("bloque + asignador operativo concurrentes: sin números duplicados; el operativo continúa después del bloque", async () => {
    const runId = `pg-${randomUUID()}`;
    // La fila del correlativo ya existe (emisor que ya emitió): el alta concurrente
    // por primera vez del asignador OPERATIVO tiene una carrera PRE-EXISTENTE
    // (upsert → P2002) documentada aparte y fuera del alcance de este cambio.
    await db.$transaction((tx) => reserveDteControlNumber(tx, ctx("11")));
    const first = await nextFree("11");
    const items = Array.from({ length: 20 }, (_, i) => ({ key: `${runId}:${i + 1}`, dteTypeCode: "11" as const, plannedSequence: first + i, contingency: false }));
    const ops = Array.from({ length: 10 }, () => db.$transaction((tx) => reserveDteControlNumber(tx, ctx("11"))));
    const [mat, ...operational] = await Promise.all([materializeMhTestDocuments(db, scope, items), ...ops]);
    const opNumbers = operational.map((o) => o.control_number);
    if (mat.ok) {
      const certNumbers = mat.docs.map((d) => d.controlNumber);
      const all = [...certNumbers, ...opNumbers];
      expect(new Set(all).size).toBe(all.length);
    } else {
      // Un operativo ganó el lock primero y consumió el primer número del bloque: rechazo explícito, sin reservar nada.
      expect(mat.code).toBe("FIRST_SEQUENCE_ALREADY_USED");
      expect(await db.dteOutgoingDocument.count({ where: { certification_item_key: { startsWith: `${runId}:` } } })).toBe(0);
    }
    const after = await db.$transaction((tx) => reserveDteControlNumber(tx, ctx("11")));
    const seq = (n: string) => Number(n.slice(-15));
    expect(seq(after.control_number)).toBeGreaterThan(Math.max(...opNumbers.map(seq), mat.ok ? first + 19 : 0));
  });

  it("bloques concurrentes sobre un tipo/año SIN fila previa: sin P2002, uno reserva y el otro recibe FIRST_SEQUENCE_ALREADY_USED", async () => {
    // Base desechable: se elimina la fila del correlativo 03 para forzar el alta
    // concurrente. El piso sigue considerando los DTE ya emitidos (no hay reuso).
    await db.dteCorrelative.deleteMany({ where: { issuer_config_id: "ISS-T", environment: "TEST", dte_type_code: "03" } });
    await Promise.all(Array.from({ length: 12 }, () => db.$queryRaw`select 1 as x from pg_sleep(0.02)`)); // pool caliente
    const first = await nextFree("03"); // sondeo revertido: la fila sigue sin existir
    const runs = Array.from({ length: 6 }, () => `pg-${randomUUID()}`);
    const results = await Promise.all(runs.map((runId) =>
      materializeMhTestDocuments(db, scope, [0, 1].map((i) => ({ key: `${runId}:${i + 1}`, dteTypeCode: "03" as const, plannedSequence: first + i, contingency: false })))));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === "FIRST_SEQUENCE_ALREADY_USED")).toBe(true);
  });

  it("primer correlativo ya usado: rechazo con siguiente disponible y sin efectos", async () => {
    const runId = `pg-${randomUUID()}`;
    const res = await materializeMhTestDocuments(db, scope, [{ key: `${runId}:1`, dteTypeCode: "11", plannedSequence: 1, contingency: false }]);
    expect(res).toMatchObject({ ok: false, code: "FIRST_SEQUENCE_ALREADY_USED" });
    expect(res.ok ? null : res.nextAvailable?.["11"]).toBeGreaterThan(1);
  });

  describe("Control Plane — lease e índice de corrida activa única", () => {
    const repo = () => createPrismaMhTestRunRepository(db);
    let orgId: string;
    beforeAll(async () => {
      const org = await db.platformOrganization.create({ data: { code: `pg-${randomUUID().slice(0, 8)}`, name: "PG test org" } });
      orgId = org.id;
    });

    it("una sola corrida activa por organización (índice parcial)", async () => {
      const input = { organization_id: orgId, tenant_id: "t1", location_id: "L1", issuer_config_id: "ISS-T", plan: { version: 1 } as never, items: [], created_by: "u", authorized_by: "u" };
      const [a, b] = await Promise.all([repo().createRun(input, new Date()), repo().createRun(input, new Date())]);
      expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
      expect([a, b].find((r) => !r.ok)).toMatchObject({ code: "ALREADY_ACTIVE" });
    });

    it("10 procesos compiten por el lease: exactamente uno lo obtiene; epoch monotónico y fencing", async () => {
      const run = await db.platformDteMhTestRun.findFirstOrThrow({ where: { organization_id: orgId } });
      const now = new Date();
      const leases = await Promise.all(Array.from({ length: 10 }, (_, i) => repo().acquireLease(run.id, `w${i}`, 60_000, now)));
      const winners = leases.filter(Boolean);
      expect(winners).toHaveLength(1);
      const later = new Date(now.getTime() + 120_000);
      const next = await repo().acquireLease(run.id, "late", 60_000, later);
      expect(next!.epoch).toBe(winners[0]!.epoch + 1);
      expect(await repo().updateRun(winners[0]!, { last_error: "stale" }, later)).toBe(false);
      expect(await repo().updateRun(next!, { last_error: null }, later)).toBe(true);
      await repo().releaseLease(next!);
    });
  });
});
