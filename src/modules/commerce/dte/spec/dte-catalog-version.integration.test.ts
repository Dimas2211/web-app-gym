// MH20 (Fase 5.1A) — integración de catálogos versionados contra una base
// PostgreSQL DESECHABLE. Se omite salvo que MH20_SCRATCH_DATABASE_URL apunte
// a localhost y a una base cuyo nombre contenga "_scratch_" (guarda contra
// ejecutar sobre bases persistentes). La base debe tener las migraciones
// aplicadas (prisma migrate deploy) y estar vacía.

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listDteCatalogItems } from "../queries/list-dte-catalog-items";
import { dteCatalogWhere, DTE_CATALOG_VERSION_MH20 } from "./dte-catalog-version";
import {
  runDteCatalogItemsSeed,
  runDteCatalogItemsSeedDryRun,
} from "../../../platform/lib/seed-runners/dte-catalog-items-runner";
import { seedDteCatalogItemsMh20 } from "../../../../../prisma/seeds/seed.dte-catalog-items-mh20";
import { DTE_CATALOG_ITEMS_MH20 } from "../../../../../prisma/seeds/data/dte-catalog-items-mh20.data";

const URL_ENV = process.env.MH20_SCRATCH_DATABASE_URL ?? "";

function isSafeScratchUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return ["localhost", "127.0.0.1"].includes(u.hostname) && /_scratch_/.test(u.pathname);
  } catch {
    return false;
  }
}

const RUN = isSafeScratchUrl(URL_ENV);

type V1Row = { catalog_code: string; item_code: string; item_label: string; description: string | null; sort_order: number | null; is_active: boolean };

describe.skipIf(!RUN)("catálogos versionados MH 1.2 / 2.0 — base desechable", () => {
  let db: PrismaClient;

  const v1Snapshot = async (): Promise<V1Row[]> =>
    db.dteCatalogItem.findMany({
      where:   { version: "1" },
      select:  { catalog_code: true, item_code: true, item_label: true, description: true, sort_order: true, is_active: true },
      orderBy: [{ catalog_code: "asc" }, { item_code: "asc" }],
    });

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: URL_ENV } } });
    expect(await db.dteCatalogItem.count()).toBe(0);
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("solo con filas 2.0 sembradas, el onboarding 1.2 sigue viendo los catálogos como faltantes", async () => {
    const r = await seedDteCatalogItemsMh20(db);
    expect(r).toEqual({ created: DTE_CATALOG_ITEMS_MH20.length, updated: 0, unchanged: 0, total: DTE_CATALOG_ITEMS_MH20.length });
    const dry = await runDteCatalogItemsSeedDryRun(db);
    expect(dry.missingCatalogs).toEqual(expect.arrayContaining(["CAT-002", "CAT-017"]));
    expect(await listDteCatalogItems({ catalog_code: "CAT-017" }, db)).toEqual([]);
  });

  it("seed 1.2 posterior no elimina filas 2.0 (limpieza FEX11 limitada a version 1)", async () => {
    await runDteCatalogItemsSeed(db);
    expect(await db.dteCatalogItem.count({ where: { version: DTE_CATALOG_VERSION_MH20 } })).toBe(DTE_CATALOG_ITEMS_MH20.length);
    expect((await runDteCatalogItemsSeedDryRun(db)).missingCatalogs).toEqual([]);
  });

  it("seed 2.0 idempotente y sin efecto sobre V1.2", async () => {
    const before = await v1Snapshot();
    expect(before.length).toBeGreaterThan(0);
    const r = await seedDteCatalogItemsMh20(db);
    expect(r).toEqual({ created: 0, updated: 0, unchanged: DTE_CATALOG_ITEMS_MH20.length, total: DTE_CATALOG_ITEMS_MH20.length });
    await runDteCatalogItemsSeed(db); // 1.2 re-ejecutado
    expect(await v1Snapshot()).toEqual(before);
    expect(await db.dteCatalogItem.count({ where: { version: DTE_CATALOG_VERSION_MH20 } })).toBe(DTE_CATALOG_ITEMS_MH20.length);
  });

  it("coexistencia: CAT-017 aislado por perfil", async () => {
    const v12 = await listDteCatalogItems({ catalog_code: "CAT-017" }, db);
    const v20 = await listDteCatalogItems({ catalog_code: "CAT-017", spec_profile: "MH_2_0" }, db);
    expect(v12.length).toBeGreaterThan(0);
    expect(v12.every((r) => r.version === "1")).toBe(true);
    expect(v12.map((r) => r.item_code)).not.toContain("11"); // Bitcoin solo 2.0
    expect(v20).toHaveLength(12);
    expect(v20.every((r) => r.version === "2.0")).toBe(true);
    expect(v20.map((r) => r.item_code)).toContain("11");
  });

  it("CAT-028: 1.2 conserva EX-n.cccc.ccc; 2.0 solo cccc.ccc", async () => {
    const v12 = await listDteCatalogItems({ catalog_code: "CAT-028" }, db);
    const v20 = await listDteCatalogItems({ catalog_code: "CAT-028", spec_profile: "MH_2_0" }, db);
    expect(v12.length).toBeGreaterThan(0);
    for (const r of v12) expect(r.item_code).not.toMatch(/^[0-9]{4}\.[0-9]{3}$/);
    expect(v20).toHaveLength(90);
    for (const r of v20) expect(r.item_code).toMatch(/^[0-9]{4}\.[0-9]{3}$/);
  });

  it("CAT-033 (solo 2.0) no aparece en 1.2; 'TA-1' sin espacio (Fase 6.1)", async () => {
    expect(await listDteCatalogItems({ catalog_code: "CAT-033" }, db)).toEqual([]);
    const v20 = await listDteCatalogItems({ catalog_code: "CAT-033", spec_profile: "MH_2_0" }, db);
    expect(v20.map((r) => r.item_code)).toContain("TA-1");
  });

  it("catálogo sin cambios 2.0 (CAT-016) resuelve filas V1.2 bajo MH_2_0", async () => {
    const v12 = await listDteCatalogItems({ catalog_code: "CAT-016" }, db);
    const v20 = await listDteCatalogItems({ catalog_code: "CAT-016", spec_profile: "MH_2_0" }, db);
    expect(v20).toEqual(v12);
  });

  it("unicidad (catalog_code, item_code, version)", async () => {
    await expect(
      db.dteCatalogItem.create({ data: { catalog_code: "CAT-017", item_code: "11", item_label: "dup", version: "2.0" } }),
    ).rejects.toMatchObject({ code: "P2002" });
    // El mismo código en otra versión sí coexiste (CAT-017 "01" existe en ambas).
    expect(await db.dteCatalogItem.count({ where: { catalog_code: "CAT-017", item_code: "01" } })).toBe(2);
  });

  it("conteo estilo preflight usa solo V1.2", async () => {
    const v1 = await db.dteCatalogItem.count({ where: { ...dteCatalogWhere("CAT-002"), is_active: true } });
    const all = await db.dteCatalogItem.count({ where: { catalog_code: "CAT-002", is_active: true } });
    expect(all).toBeGreaterThan(v1);
    expect(v1).toBe(await db.dteCatalogItem.count({ where: { catalog_code: "CAT-002", version: "1" } }));
  });
});
