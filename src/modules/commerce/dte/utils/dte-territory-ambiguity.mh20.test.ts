// MH20 (Fase 5.1B) — correspondencias ambiguas aisladas al perfil 2.0.
import { describe, expect, it } from "vitest";
import { mh20TerritoryAmbiguityError, projectMhTerritory, mhTerritoryOptionsForProfile } from "./dte-territory-projection";
import { MUNICIPALITIES } from "../../../../../prisma/importers/generated/municipalities.data";
import { DTE_CATALOG_ITEMS_MH20 } from "../../../../../prisma/seeds/data/dte-catalog-items-mh20.data";
import { checkFexV3TransportModes, isValidCat030ModoTransp, isValidCat033TipoRegimen } from "./fex11-v3-rules";

const resolvedOf = (dept: string, code: string) => {
  const m = MUNICIPALITIES.find((x) => x.dept_code === dept && x.code === code)!;
  return {
    departmentCode: m.dept_code, newMunicipalityCode: m.new_municipality_code,
    newMunicipalityName: m.new_municipality_name, districtCode: m.district_code,
  };
};

// Fase 6.1 — Cabañas RESUELTO_DOCUMENTALMENTE (CAT-013 v1.1 "Cambio: 2",
// CAT-PDF p.2 y p.18; consultas-mh-verificadas.md §13). Cambio de
// expectativa justificado: hasta Fase 6 se esperaba error CAT_INC_001.
describe("Cabañas (CAT-013 v1.1: 10 = ESTE, 11 = OESTE)", () => {
  it("ya no hay correspondencia ambigua en ningún perfil", () => {
    for (const p of ["MH_1_2", "MH_2_0"] as const) {
      for (const d of ["01", "05", "06", "09", "14"]) expect(mh20TerritoryAmbiguityError(p, d, "emisor")).toBeNull();
    }
  });
  it("MH_2_0: los 9 distritos proyectan Este → 10 y Oeste → 11, marcados REVIEW_CAT013_CHANGED", () => {
    const rows = MUNICIPALITIES.filter((m) => m.dept_code === "09");
    expect(rows).toHaveLength(9);
    for (const m of rows) {
      const r = projectMhTerritory(resolvedOf("09", m.code), mhTerritoryOptionsForProfile("MH_2_0"));
      expect(r.ok, m.code).toBe(true);
      if (!r.ok) continue;
      expect(r.territory.municipio).toBe(m.new_municipality_name === "Cabañas Este" ? "10" : "11");
      expect(r.territory.distrito).toBe(m.code);
      expect(r.review).toContain("REVIEW_CAT013_CHANGED");
    }
  });
  it("MH_1_2: tabla V1.2 intacta (Este → 11, Oeste → 10), sin marca", () => {
    for (const m of MUNICIPALITIES.filter((x) => x.dept_code === "09")) {
      const r = projectMhTerritory(resolvedOf("09", m.code), mhTerritoryOptionsForProfile("MH_1_2"));
      expect(r.ok && r.territory.municipio).toBe(m.new_municipality_name === "Cabañas Este" ? "11" : "10");
      expect(r.ok && r.review).toEqual([]);
    }
  });
});

describe("Ciudad Delgado (CAT20-297, Excel Hoja1!A174)", () => {
  it("clave EXACTA: proyecta 06/23/19 en 2.0 (solo cambia la etiqueta; no ambigua)", () => {
    const r = projectMhTerritory(resolvedOf("06", "19"), mhTerritoryOptionsForProfile("MH_2_0"));
    expect(r).toEqual({ ok: true, territory: { departamento: "06", municipio: "23", distrito: "19" }, review: ["REVIEW_LABEL"] });
  });
  it("1.2 inalterado", () => {
    const r = projectMhTerritory(resolvedOf("06", "19"), mhTerritoryOptionsForProfile("MH_1_2"));
    expect(r.ok && r.territory).toEqual({ departamento: "06", municipio: "23", distrito: "19" });
  });
});

// Fase 6.1 (consultas §15): CAT-INC-004 resuelto documentalmente.
describe("CAT-033 'TA-1' (CAT-PDF p.60; Excel Hoja1!A1907 traía espacio)", () => {
  it("se siembra sin espacio inicial y valida con la regla CAT-033", () => {
    const ta = DTE_CATALOG_ITEMS_MH20.find((r) => r.catalog_code === "CAT-033" && r.item_label === "Tránsito Aduanero")!;
    expect(ta.item_code).toBe("TA-1");
    expect(isValidCat033TipoRegimen("TA-1")).toBe(true);
    expect(isValidCat033TipoRegimen(" TA-1")).toBe(false);
  });
  it("CAT-030 modoTransp: solo 1–6 (7 del schema no está en el catálogo)", () => {
    for (const v of [1, 2, 3, 4, 5, 6, null]) expect(isValidCat030ModoTransp(v)).toBe(true);
    for (const v of [0, 7, "1", 11]) expect(isValidCat030ModoTransp(v)).toBe(false);
    expect(checkFexV3TransportModes({ otrosDocumentos: null })).toEqual([]);
    expect(checkFexV3TransportModes({ otrosDocumentos: [{ modoTransp: 7 }] })).toHaveLength(1);
  });
});
