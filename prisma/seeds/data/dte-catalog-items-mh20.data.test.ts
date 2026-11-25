// MH20 (IMP20-009) — catálogos 2.0 versionados: coherencia con el diff de
// la Fase 3 y no-regresión de las filas V1.2.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DTE_CATALOG_ITEMS_MH20,
  DTE_CATALOG_VERSION_MH20,
} from "./dte-catalog-items-mh20.data";
import { FEX11_CATALOG_ROWS } from "./fex11-catalog-rows";

const DIFF = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "docs", "fiscal", "mh-normativa-2.0", "auditoria", "03-catalogos-diff.json"), "utf8"),
) as { diferencias: Array<{ catalogo: string; eje: string; clave: string | null; tipo_cambio: string; valor_nuevo: unknown }> };

const rows = (c: string) => DTE_CATALOG_ITEMS_MH20.filter((r) => r.catalog_code === c);

describe("catálogos MH 2.0 (version 2.0)", () => {
  it("todas las filas son version 2.0 y únicas por (catálogo, código)", () => {
    const keys = new Set<string>();
    for (const r of DTE_CATALOG_ITEMS_MH20) {
      expect(r.version).toBe(DTE_CATALOG_VERSION_MH20);
      const k = `${r.catalog_code}|${r.item_code}`;
      expect(keys.has(k), k).toBe(false);
      keys.add(k);
    }
  });

  it("conteos publicados", () => {
    expect(rows("CAT-002")).toHaveLength(13);
    expect(rows("CAT-017")).toHaveLength(12);
    expect(rows("CAT-024")).toHaveLength(3);
    expect(rows("CAT-028")).toHaveLength(90);
    expect(rows("CAT-033")).toHaveLength(4);
  });

  it("CAT-028 2.0 en formato cccc.ccc = códigos CODE_ADDED del diff", () => {
    const added = DIFF.diferencias
      .filter((e) => e.eje === "OFICIAL_V1.2→2.0" && e.catalogo === "CAT-028" && e.tipo_cambio === "CODE_ADDED")
      .map((e) => e.clave)
      .sort();
    expect(rows("CAT-028").map((r) => r.item_code).sort()).toEqual(added);
    for (const r of rows("CAT-028")) expect(r.item_code).toMatch(/^[0-9]{4}\.[0-9]{3}$/);
  });

  it("CAT-002 incluye 11, 14, 17, 18; CAT-024 código 2 con etiqueta oficial", () => {
    expect(rows("CAT-002").map((r) => r.item_code)).toEqual(expect.arrayContaining(["01", "03", "05", "06", "11", "14", "17", "18"]));
    expect(rows("CAT-024").find((r) => r.item_code === "2")?.item_label).toBe("Rescindir de la operación realizada.");
  });

  // Fase 6.1 (consultas §15): cambio de expectativa justificado; " TA-1" → "TA-1".
  it("CAT-033 'TA-1' sin espacio (CAT-PDF p.60, Longitud 4)", () => {
    expect(rows("CAT-033").map((r) => r.item_code)).toEqual(["EX-1", "EX-2", "EX-3", "TA-1"]);
    for (const r of rows("CAT-033")) expect(r.item_code.length).toBeLessThanOrEqual(4);
  });

  it("no altera las filas V1.2 de FEX (CAT-028 version 1 intacto)", () => {
    const v1 = FEX11_CATALOG_ROWS.filter((r) => r.catalog_code === "CAT-028");
    expect(v1.length).toBeGreaterThan(0);
    for (const r of v1) expect(r.version ?? "1").toBe("1");
  });
});
