// MH20 (Fase 5.1A) — resolución de versión de catálogo por perfil.

import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  DTE_CATALOG_VERSION_MH12,
  DTE_CATALOG_VERSION_MH20,
  DTE_CATALOGS_VERSIONED_MH20,
  dteCatalogWhere,
  resolveDteCatalogVersion,
  resolveDteCatalogVersionFor,
} from "./dte-catalog-version";
import { listDteCatalogItems } from "../queries/list-dte-catalog-items";
import {
  DTE_CATALOG_ITEMS_MH20,
  DTE_CATALOG_VERSION_MH20 as DATA_VERSION_MH20,
} from "../../../../../prisma/seeds/data/dte-catalog-items-mh20.data";
import { seedDteCatalogItemsMh20 } from "../../../../../prisma/seeds/seed.dte-catalog-items-mh20";

describe("resolveDteCatalogVersion", () => {
  it("default y MH_1_2 → '1'", () => {
    expect(resolveDteCatalogVersion()).toBe("1");
    expect(resolveDteCatalogVersion("MH_1_2")).toBe(DTE_CATALOG_VERSION_MH12);
  });
  it("MH_2_0 → '2.0' (misma constante que el dataset)", () => {
    expect(resolveDteCatalogVersion("MH_2_0")).toBe(DTE_CATALOG_VERSION_MH20);
    expect(DATA_VERSION_MH20).toBe(DTE_CATALOG_VERSION_MH20);
  });
  it("catálogos versionados 2.0 = catálogos presentes en el dataset", () => {
    const inData = new Set(DTE_CATALOG_ITEMS_MH20.map((r) => r.catalog_code));
    expect([...DTE_CATALOGS_VERSIONED_MH20].sort()).toEqual([...inData].sort());
  });
  it("MH_1_2 nunca resuelve '2.0' para ningún catálogo", () => {
    for (const c of ["CAT-002", "CAT-017", "CAT-028", "CAT-033", "CAT-016", "CAT-999"]) {
      expect(resolveDteCatalogVersionFor(c, "MH_1_2")).toBe("1");
      expect(resolveDteCatalogVersionFor(c)).toBe("1");
    }
  });
  it("MH_2_0: versionados → '2.0'; sin cambios → '1' explícito", () => {
    expect(resolveDteCatalogVersionFor("CAT-017", "MH_2_0")).toBe("2.0");
    expect(resolveDteCatalogVersionFor("CAT-028", "MH_2_0")).toBe("2.0");
    expect(resolveDteCatalogVersionFor("CAT-016", "MH_2_0")).toBe("1");
    expect(dteCatalogWhere("CAT-024", "MH_2_0")).toEqual({ catalog_code: "CAT-024", version: "2.0" });
  });
});

describe("listDteCatalogItems filtra por versión", () => {
  const fakeClient = () => {
    const findMany = vi.fn().mockResolvedValue([]);
    return { client: { dteCatalogItem: { findMany } } as unknown as PrismaClient, findMany };
  };
  it("sin perfil → version '1'", async () => {
    const { client, findMany } = fakeClient();
    await listDteCatalogItems({ catalog_code: "CAT-017" }, client);
    expect(findMany.mock.calls[0][0].where).toEqual({ catalog_code: "CAT-017", version: "1", is_active: true });
  });
  it("MH_2_0 → version '2.0'", async () => {
    const { client, findMany } = fakeClient();
    await listDteCatalogItems({ catalog_code: "CAT-017", spec_profile: "MH_2_0" }, client);
    expect(findMany.mock.calls[0][0].where).toEqual({ catalog_code: "CAT-017", version: "2.0", is_active: true });
  });
});

describe("seedDteCatalogItemsMh20 (cliente simulado)", () => {
  it("solo escribe version '2.0' y es idempotente", async () => {
    const store = new Map<string, Record<string, unknown>>();
    const key = (w: { catalog_code_item_code_version: { catalog_code: string; item_code: string; version: string } }) =>
      `${w.catalog_code_item_code_version.catalog_code}|${w.catalog_code_item_code_version.item_code}|${w.catalog_code_item_code_version.version}`;
    const client = {
      dteCatalogItem: {
        findUnique: vi.fn(async ({ where }) => store.get(key(where)) ?? null),
        upsert: vi.fn(async ({ where, create, update }) => {
          const k = key(where);
          const row = store.has(k) ? { ...store.get(k), ...update } : create;
          store.set(k, row);
          return row;
        }),
      },
    };
    const first = await seedDteCatalogItemsMh20(client as never);
    expect(first.created).toBe(DTE_CATALOG_ITEMS_MH20.length);
    for (const call of client.dteCatalogItem.upsert.mock.calls) {
      expect(call[0].where.catalog_code_item_code_version.version).toBe("2.0");
      expect(call[0].create.version).toBe("2.0");
    }
    const second = await seedDteCatalogItemsMh20(client as never);
    expect(second).toEqual({ created: 0, updated: 0, unchanged: DTE_CATALOG_ITEMS_MH20.length, total: DTE_CATALOG_ITEMS_MH20.length });
  });
});
