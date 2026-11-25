// MH20 (Fase 9.1) — M4 platform_dte_mh_test_run_profiles contra PostgreSQL DESECHABLE.
//
// Cubre: cadena incompleta, segmento duplicado, perfil inválido, CHECK, UNIQUE,
// integridad referencial y aislamiento entre organizaciones, más el mapeo del
// repositorio (CHAIN_SEGMENT_EXISTS). Fase 9.2A: M5 (FK compuesta que ata
// profile.organization_id a la organización de la corrida).
//
// Se omite salvo que MH20_SCRATCH_DATABASE_URL apunte a localhost y a una base
// cuyo nombre contenga "_scratch_" (guarda contra bases persistentes). La base
// debe tener todas las migraciones aplicadas (incluidas M4 20261124030000 y
// M5 20261125010000).
//
//   MH20_SCRATCH_DATABASE_URL=postgresql://…@localhost:5432/zolvi_scratch_m4 \
//   DATABASE_URL=$MH20_SCRATCH_DATABASE_URL npx vitest run mh20-m4-run-profiles.pg

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaMhTestRunRepository } from "./mh-test-run.repository";

const URL_ENV = process.env.MH20_SCRATCH_DATABASE_URL ?? "";
const RUN = (() => {
  try {
    const u = new URL(URL_ENV);
    return ["localhost", "127.0.0.1"].includes(u.hostname) && /_scratch_/.test(u.pathname);
  } catch {
    return false;
  }
})();

const SNAPSHOT = { cod_estable_mh: "M001", cod_punto_venta_mh: "P001", dept_code: "06", municipality_code: "23" };

describe.skipIf(!RUN)("M4 run profiles — PostgreSQL desechable", () => {
  let db: PrismaClient;
  const ORG_A = `org-m4-a-${randomUUID()}`;
  const ORG_B = `org-m4-b-${randomUUID()}`;
  const CHAIN = `chain-${randomUUID()}`;

  /** Corrida terminada (no ocupa el índice one_active). */
  async function mkRun(org: string, status = "COMPLETED"): Promise<string> {
    const r = await db.platformDteMhTestRun.create({
      data: { organization_id: org, tenant_id: `t-${org}`, location_id: `l-${org}`, issuer_config_id: `ic-${org}`,
        environment: "TEST", status, plan: { version: 2, specProfile: "MH_2_0" } },
      select: { id: true },
    });
    return r.id;
  }

  async function insertProfileRaw(runId: string, org: string, profile: string,
    chainId: string | null, idx: number | null, total: number | null): Promise<number> {
    return db.$executeRawUnsafe(
      `INSERT INTO platform_dte_mh_test_run_profiles (run_id, organization_id, mh_spec_profile, chain_id, chain_index, chain_total, issuer_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      runId, org, profile, chainId, idx, total, JSON.stringify(SNAPSHOT),
    );
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: URL_ENV } } });
    const t = await db.$queryRaw<Array<{ n: bigint }>>`select count(*)::bigint as n from information_schema.tables where table_name = 'platform_dte_mh_test_run_profiles'`;
    expect(Number(t[0].n)).toBe(1);
    for (const id of [ORG_A, ORG_B]) {
      await db.platformOrganization.create({ data: { id, code: id, name: `M4 ${id}` } });
    }
  });

  afterAll(async () => {
    if (!db) return;
    const orgs = [ORG_A, ORG_B];
    await db.platformDteMhTestRunProfile.deleteMany({ where: { organization_id: { in: orgs } } });
    await db.platformDteMhTestRunItem.deleteMany({ where: { run: { organization_id: { in: orgs } } } });
    await db.platformDteMhTestRun.deleteMany({ where: { organization_id: { in: orgs } } });
    await db.platformOrganization.deleteMany({ where: { id: { in: orgs } } });
    await db.$disconnect();
  });

  describe("CHECK de perfil", () => {
    it.each(["MH_1_2", "MH_2_0"])("acepta %s", async (p) => {
      expect(await insertProfileRaw(await mkRun(ORG_A), ORG_A, p, null, null, null)).toBe(1);
    });
    it.each(["MH_3_0", "mh_2_0", "", "MH_2_0 "])("rechaza perfil inválido %j", async (p) => {
      await expect(insertProfileRaw(await mkRun(ORG_A), ORG_A, p, null, null, null))
        .rejects.toThrow(/platform_dte_mh_test_run_profiles_profile_chk/);
    });
  });

  describe("CHECK de cadena", () => {
    it.each([
      ["chain_id sin índice ni total", "x", null, null],
      ["chain_id + índice sin total",   "x", 1, null],
      ["índice sin chain_id",           null, 1, 2],
      ["total sin chain_id",            null, null, 2],
    ])("cadena incompleta: %s", async (_l, cid, idx, total) => {
      await expect(insertProfileRaw(await mkRun(ORG_A), ORG_A, "MH_2_0", cid as string | null, idx as number | null, total as number | null))
        .rejects.toThrow(/platform_dte_mh_test_run_profiles_chain_chk/);
    });
    it.each([
      ["índice 0", 0, 3], ["índice > total", 4, 3], ["total 0", 1, 0], ["total 51", 1, 51], ["índice negativo", -1, 3],
    ])("fuera de rango: %s", async (_l, idx, total) => {
      await expect(insertProfileRaw(await mkRun(ORG_A), ORG_A, "MH_2_0", `c-${randomUUID()}`, idx, total))
        .rejects.toThrow(/platform_dte_mh_test_run_profiles_chain_chk/);
    });
    it("límites válidos: 1/1 y 50/50", async () => {
      expect(await insertProfileRaw(await mkRun(ORG_A), ORG_A, "MH_2_0", `c-${randomUUID()}`, 1, 1)).toBe(1);
      expect(await insertProfileRaw(await mkRun(ORG_A), ORG_A, "MH_2_0", `c-${randomUUID()}`, 50, 50)).toBe(1);
    });
  });

  describe("UNIQUE", () => {
    it("segmento duplicado (org, chain_id, chain_index) se rechaza", async () => {
      expect(await insertProfileRaw(await mkRun(ORG_A), ORG_A, "MH_2_0", CHAIN, 1, 3)).toBe(1);
      await expect(insertProfileRaw(await mkRun(ORG_A), ORG_A, "MH_2_0", CHAIN, 1, 3))
        .rejects.toThrow(/platform_dte_mh_test_run_profiles_organization_id_chain_id__key|23505|unique/i);
      expect(await insertProfileRaw(await mkRun(ORG_A), ORG_A, "MH_2_0", CHAIN, 2, 3)).toBe(1);
    });
    it("un solo perfil por corrida (PK run_id)", async () => {
      const run = await mkRun(ORG_A);
      expect(await insertProfileRaw(run, ORG_A, "MH_2_0", null, null, null)).toBe(1);
      await expect(insertProfileRaw(run, ORG_A, "MH_1_2", null, null, null))
        .rejects.toThrow(/platform_dte_mh_test_run_profiles_pkey|23505|unique/i);
    });
    it("varias corridas sin cadena en la misma organización (NULL no colisiona)", async () => {
      expect(await insertProfileRaw(await mkRun(ORG_A), ORG_A, "MH_2_0", null, null, null)).toBe(1);
      expect(await insertProfileRaw(await mkRun(ORG_A), ORG_A, "MH_2_0", null, null, null)).toBe(1);
    });
  });

  describe("Integridad referencial", () => {
    it("run_id inexistente se rechaza", async () => {
      await expect(insertProfileRaw(randomUUID(), ORG_A, "MH_2_0", null, null, null))
        .rejects.toThrow(/platform_dte_mh_test_run_profiles_run_id_fkey|23503|foreign key/i);
    });
    it("borrar una corrida con perfil está restringido (ON DELETE RESTRICT)", async () => {
      const run = await mkRun(ORG_A);
      await insertProfileRaw(run, ORG_A, "MH_2_0", null, null, null);
      await expect(db.$executeRawUnsafe(`DELETE FROM platform_dte_mh_test_runs WHERE id = $1`, run))
        .rejects.toThrow(/platform_dte_mh_test_run_profiles_run_id_fkey|23503|foreign key/i);
      expect(await db.platformDteMhTestRunProfile.count({ where: { run_id: run } })).toBe(1);
    });
    it("issuer_snapshot es obligatorio", async () => {
      const run = await mkRun(ORG_A);
      await expect(db.$executeRawUnsafe(
        `INSERT INTO platform_dte_mh_test_run_profiles (run_id, organization_id, mh_spec_profile) VALUES ($1, $2, 'MH_2_0')`, run, ORG_A))
        .rejects.toThrow(/issuer_snapshot|23502|null value/i);
    });
  });

  describe("Aislamiento entre organizaciones", () => {
    it("el mismo segmento (chain_id, chain_index) es independiente por organización", async () => {
      const chain = `shared-${randomUUID()}`;
      expect(await insertProfileRaw(await mkRun(ORG_A), ORG_A, "MH_2_0", chain, 1, 2)).toBe(1);
      expect(await insertProfileRaw(await mkRun(ORG_B), ORG_B, "MH_2_0", chain, 1, 2)).toBe(1);
      const byOrg = await db.platformDteMhTestRunProfile.groupBy({ by: ["organization_id"], where: { chain_id: chain }, _count: true });
      expect(byOrg.map((r) => r.organization_id).sort()).toEqual([ORG_A, ORG_B].sort());
    });
    it("getRunProfile devuelve solo la fila de esa corrida", async () => {
      const repo = createPrismaMhTestRunRepository(db);
      const ra = await mkRun(ORG_A);
      const rb = await mkRun(ORG_B);
      await insertProfileRaw(ra, ORG_A, "MH_2_0", null, null, null);
      await insertProfileRaw(rb, ORG_B, "MH_1_2", null, null, null);
      expect((await repo.getRunProfile!(ra))?.mh_spec_profile).toBe("MH_2_0");
      expect((await repo.getRunProfile!(rb))?.mh_spec_profile).toBe("MH_1_2");
    });
    it("una corrida activa por organización: B no queda bloqueada por la de A", async () => {
      await mkRun(ORG_A, "QUEUED");
      await expect(mkRun(ORG_A, "RUNNING")).rejects.toThrow();
      const rb = await mkRun(ORG_B, "QUEUED");
      expect(rb).toBeTruthy();
      await db.platformDteMhTestRun.updateMany({ where: { organization_id: { in: [ORG_A, ORG_B] }, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED" } });
    });
    // Residual de 9.1 cerrado en 9.2A por M5 (FK compuesta, ver bloque M5);
    // createRun sigue escribiendo el mismo organization_id en ambas filas.
    it("createRun escribe el mismo organization_id en corrida y perfil", async () => {
      const repo = createPrismaMhTestRunRepository(db);
      const res = await repo.createRun({
        organization_id: ORG_B, tenant_id: "t", location_id: "l", issuer_config_id: "ic",
        plan: { version: 2, specProfile: "MH_2_0" } as never, items: [], created_by: "cp", authorized_by: "cp",
        runProfile: { mh_spec_profile: "MH_2_0", chain_id: null, chain_index: null, chain_total: null, issuer_snapshot: SNAPSHOT },
      }, new Date());
      expect(res.ok).toBe(true);
      const runId = (res as { runId: string }).runId;
      const run = await db.platformDteMhTestRun.findUniqueOrThrow({ where: { id: runId }, include: { run_profile: true } });
      expect(run.run_profile?.organization_id).toBe(run.organization_id);
      await db.platformDteMhTestRun.update({ where: { id: runId }, data: { status: "CANCELLED" } });
    });
  });

  // MH20 (Fase 9.2A) — M5 20261125010000_mh20_mh_test_run_profile_org_fk.
  describe("M5: organización del perfil = organización de la corrida", () => {
    const ORG_FK = /platform_dte_mh_test_run_profiles_run_id_organization_id_fkey|23503|foreign key/i;

    it("SQL: un perfil de B no puede apuntar a una corrida de A", async () => {
      const runA = await mkRun(ORG_A);
      await expect(insertProfileRaw(runA, ORG_B, "MH_2_0", null, null, null)).rejects.toThrow(ORG_FK);
      expect(await db.platformDteMhTestRunProfile.count({ where: { run_id: runA } })).toBe(0);
    });
    it("Prisma (create no comprobado): el cruce también se rechaza", async () => {
      const runA = await mkRun(ORG_A);
      await expect(db.platformDteMhTestRunProfile.create({
        data: { run_id: runA, organization_id: ORG_B, mh_spec_profile: "MH_2_0", issuer_snapshot: SNAPSHOT },
      })).rejects.toThrow();
      expect(await db.platformDteMhTestRunProfile.count({ where: { run_id: runA } })).toBe(0);
    });
    it("no se puede mover el perfil a otra organización", async () => {
      const runA = await mkRun(ORG_A);
      await insertProfileRaw(runA, ORG_A, "MH_2_0", null, null, null);
      await expect(db.$executeRawUnsafe(
        `UPDATE platform_dte_mh_test_run_profiles SET organization_id = $1 WHERE run_id = $2`, ORG_B, runA)).rejects.toThrow(ORG_FK);
    });
    it("no se puede mover a otra organización una corrida con perfil (ON UPDATE RESTRICT)", async () => {
      const runA = await mkRun(ORG_A);
      await insertProfileRaw(runA, ORG_A, "MH_2_0", null, null, null);
      await expect(db.$executeRawUnsafe(
        `UPDATE platform_dte_mh_test_runs SET organization_id = $1 WHERE id = $2`, ORG_B, runA)).rejects.toThrow(ORG_FK);
      const run = await db.platformDteMhTestRun.findUniqueOrThrow({ where: { id: runA }, include: { run_profile: true } });
      expect(run.organization_id).toBe(ORG_A);
      expect(run.run_profile?.organization_id).toBe(ORG_A);
    });
    it("compatibilidad: una corrida histórica sin perfil no queda afectada", async () => {
      const run = await mkRun(ORG_A);
      expect(await db.$executeRawUnsafe(`UPDATE platform_dte_mh_test_runs SET last_error = 'x' WHERE id = $1`, run)).toBe(1);
      expect(await db.platformDteMhTestRunProfile.count({ where: { run_id: run } })).toBe(0);
    });
    it("catálogo: FK compuesta y UNIQUE nuevos; FK simple, UNIQUE de segmento y CHECK de M4 conservados", async () => {
      const cons = await db.$queryRaw<Array<{ conname: string; contype: string; def: string }>>`
        SELECT conname, contype::text AS contype, pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'platform_dte_mh_test_run_profiles'::regclass ORDER BY conname`;
      const by = Object.fromEntries(cons.map((c) => [c.conname, c]));
      expect(by.platform_dte_mh_test_run_profiles_run_id_organization_id_fkey?.def)
        .toMatch(/FOREIGN KEY \(run_id, organization_id\) REFERENCES platform_dte_mh_test_runs\(id, organization_id\) ON UPDATE RESTRICT ON DELETE RESTRICT/);
      expect(by.platform_dte_mh_test_run_profiles_run_id_fkey?.def).toMatch(/FOREIGN KEY \(run_id\) REFERENCES platform_dte_mh_test_runs\(id\)/);
      expect(by.platform_dte_mh_test_run_profiles_profile_chk?.contype).toBe("c");
      expect(by.platform_dte_mh_test_run_profiles_chain_chk?.contype).toBe("c");
      const idx = await db.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes WHERE indexname IN (
          'platform_dte_mh_test_runs_id_organization_id_key',
          'platform_dte_mh_test_run_profiles_organization_id_chain_id__key')`;
      expect(idx.map((r) => r.indexname).sort()).toEqual([
        "platform_dte_mh_test_run_profiles_organization_id_chain_id__key",
        "platform_dte_mh_test_runs_id_organization_id_key",
      ]);
    });
    it("la FK valida filas existentes: con un perfil incoherente previo, M5 no se aplica", async () => {
      const runA = await mkRun(ORG_A);
      const sentinel = new Error("rollback");
      let addError: unknown = null;
      await expect(db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`ALTER TABLE platform_dte_mh_test_run_profiles DROP CONSTRAINT platform_dte_mh_test_run_profiles_run_id_organization_id_fkey`);
        await tx.$executeRawUnsafe(
          `INSERT INTO platform_dte_mh_test_run_profiles (run_id, organization_id, mh_spec_profile, issuer_snapshot) VALUES ($1, $2, 'MH_2_0', '{}'::jsonb)`, runA, ORG_B);
        await tx.$executeRawUnsafe(`SAVEPOINT m5`);
        try {
          await tx.$executeRawUnsafe(`ALTER TABLE platform_dte_mh_test_run_profiles ADD CONSTRAINT platform_dte_mh_test_run_profiles_run_id_organization_id_fkey FOREIGN KEY (run_id, organization_id) REFERENCES platform_dte_mh_test_runs(id, organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT`);
        } catch (e) {
          addError = e;
          await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT m5`);
        }
        throw sentinel; // revierte el DROP y la fila incoherente
      })).rejects.toBe(sentinel);
      expect(String(addError)).toMatch(ORG_FK);
      expect(await db.platformDteMhTestRunProfile.count({ where: { run_id: runA } })).toBe(0);
      const still = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM pg_constraint WHERE conname = 'platform_dte_mh_test_run_profiles_run_id_organization_id_fkey'`;
      expect(Number(still[0].n)).toBe(1);
    });
  });

  describe("Repositorio", () => {
    it("segmento duplicado vía createRun → CHAIN_SEGMENT_EXISTS (sin corrida huérfana)", async () => {
      const repo = createPrismaMhTestRunRepository(db);
      const chain = `repo-${randomUUID()}`;
      const input = {
        organization_id: ORG_A, tenant_id: "t", location_id: "l", issuer_config_id: "ic",
        plan: { version: 2, specProfile: "MH_2_0" } as never, items: [], created_by: "cp", authorized_by: "cp",
        runProfile: { mh_spec_profile: "MH_2_0" as const, chain_id: chain, chain_index: 1, chain_total: 2, issuer_snapshot: SNAPSHOT },
      };
      const first = await repo.createRun(input, new Date());
      expect(first.ok).toBe(true);
      await db.platformDteMhTestRun.update({ where: { id: (first as { runId: string }).runId }, data: { status: "COMPLETED" } });
      const before = await db.platformDteMhTestRun.count({ where: { organization_id: ORG_A } });
      expect(await repo.createRun(input, new Date())).toEqual({ ok: false, code: "CHAIN_SEGMENT_EXISTS" });
      expect(await db.platformDteMhTestRun.count({ where: { organization_id: ORG_A } })).toBe(before); // rollback
    });
    it("cadena incompleta vía createRun falla y revierte la corrida", async () => {
      const repo = createPrismaMhTestRunRepository(db);
      const before = await db.platformDteMhTestRun.count({ where: { organization_id: ORG_A } });
      await expect(repo.createRun({
        organization_id: ORG_A, tenant_id: "t", location_id: "l", issuer_config_id: "ic",
        plan: { version: 2, specProfile: "MH_2_0" } as never, items: [], created_by: "cp", authorized_by: "cp",
        runProfile: { mh_spec_profile: "MH_2_0", chain_id: "x", chain_index: null, chain_total: null, issuer_snapshot: SNAPSHOT },
      }, new Date())).rejects.toThrow();
      expect(await db.platformDteMhTestRun.count({ where: { organization_id: ORG_A } })).toBe(before);
    });
  });
});
