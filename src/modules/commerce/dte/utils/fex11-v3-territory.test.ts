// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-v3-territory.test.ts
//
// Tests centinela de la proyección territorial FEX 11 v3
// (FEX-V3-TERRITORY-FIX). Evidencia MH TEST (codigoMsg 096): 05/11/050611
// y 05/06/11 rechazados; la proyección correcta para Santa Tecla es
// 05/28/11 (municipio = CAT-013 v1.2). Las filas usan los valores reales
// del catálogo Municipality.
// ─────────────────────────────────────────────────────────────────

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { projectFexV3Territory } from "./fex11-v3-territory";
import { resolveDteMunicipality, type ResolvedDteMunicipality } from "./dte-territory.resolver";
import type { Cat013FexV3Municipality } from "./cat013-fex-v3-municipalities";

function row(
  departmentCode: string,
  municipalityCode: string,
  newMunicipalityCode: string | null,
  newMunicipalityName: string | null,
  districtCode: string | null,
): ResolvedDteMunicipality {
  return {
    departmentCode, municipalityCode, districtCode, newMunicipalityCode, newMunicipalityName,
    districtName: null,
  };
}

const SANTA_TECLA = row("05", "11", "0506", "La Libertad Sur", "050611");

describe("projectFexV3Territory — centinelas del catálogo", () => {
  it.each([
    ["Santa Tecla",  SANTA_TECLA,                                          { departamento: "05", municipio: "28", distrito: "11" }],
    ["San Salvador", row("06", "14", "0601", "San Salvador Centro", "060114"), { departamento: "06", municipio: "23", distrito: "14" }],
    ["El Congo",     row("02", "04", "0202", "Santa Ana Este", "020204"),      { departamento: "02", municipio: "16", distrito: "04" }],
    ["Yamabal",      row("13", "25", "1302", "Morazán Sur", "130225"),         { departamento: "13", municipio: "28", distrito: "25" }],
    ["Yoloaiquín",   row("13", "26", "1302", "Morazán Sur", "130226"),         { departamento: "13", municipio: "28", distrito: "26" }],
  ])("%s", (_name, resolved, expected) => {
    expect(projectFexV3Territory(resolved)).toEqual({ ok: true, territory: expected });
  });

  it("el municipio NO es Municipality.code ni el sufijo/código de new_municipality_code", () => {
    const r = projectFexV3Territory(SANTA_TECLA);
    expect(r.ok && r.territory.municipio).toBe("28");
    expect(r.ok && r.territory.municipio).not.toBe("11");
    expect(r.ok && r.territory.municipio).not.toBe("06");
    expect(r.ok && r.territory.municipio).not.toBe("0506");
  });
});

describe("projectFexV3Territory — fail-closed", () => {
  it("newMunicipalityName ausente", () => {
    for (const name of [null, "", "   "]) {
      const r = projectFexV3Territory(row("05", "11", "0506", name, "050611"));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("nombre del municipio nuevo");
    }
  });

  it("CAT-013 sin coincidencia (nombre inexistente o de otro departamento)", () => {
    for (const resolved of [
      row("05", "11", "0506", "La Libertad Suroeste", "050611"),
      row("05", "11", "0506", "Morazán Sur", "050611"),
    ]) {
      const r = projectFexV3Territory(resolved);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("no existe en CAT-013");
    }
  });

  it("CAT-013 ambiguo", () => {
    const ambiguous: Cat013FexV3Municipality[] = [
      { departmentCode: "05", municipalityCode: "28", municipalityName: "LA LIBERTAD SUR" },
      { departmentCode: "05", municipalityCode: "29", municipalityName: "La Libertad  Sur" },
    ];
    const r = projectFexV3Territory(SANTA_TECLA, ambiguous);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ambiguo");
  });

  it("código CAT-013 con formato inválido", () => {
    const bad: Cat013FexV3Municipality[] = [
      { departmentCode: "05", municipalityCode: "028", municipalityName: "LA LIBERTAD SUR" },
    ];
    expect(projectFexV3Territory(SANTA_TECLA, bad).ok).toBe(false);
  });

  it("newMunicipalityCode con departamento incorrecto", () => {
    const r = projectFexV3Territory(row("05", "11", "0606", "La Libertad Sur", "060611"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no pertenece al departamento");
  });

  it("districtCode que no comienza por newMunicipalityCode", () => {
    const r = projectFexV3Territory(row("05", "11", "0506", "La Libertad Sur", "050711"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no pertenece al municipio nuevo");
  });

  it.each([
    ["deptCode de 1 dígito",             row("5", "11", "0506", "La Libertad Sur", "050611")],
    ["deptCode de 3 dígitos",            row("050", "11", "0506", "La Libertad Sur", "050611")],
    ["newMunicipalityCode de 3 dígitos", row("05", "11", "506", "La Libertad Sur", "050611")],
    ["newMunicipalityCode de 6 dígitos", row("05", "11", "050611", "La Libertad Sur", "050611")],
    ["newMunicipalityCode no numérico",  row("05", "11", "05AB", "La Libertad Sur", "05AB11")],
    ["newMunicipalityCode null",         row("05", "11", null, "La Libertad Sur", "050611")],
    ["districtCode de 2 dígitos",        row("05", "11", "0506", "La Libertad Sur", "11")],
    ["districtCode de 8 dígitos",        row("05", "11", "0506", "La Libertad Sur", "05061100")],
    ["districtCode null",                row("05", "11", "0506", "La Libertad Sur", null)],
  ])("longitud/formato inválido: %s", (_name, resolved) => {
    expect(projectFexV3Territory(resolved).ok).toBe(false);
  });
});

describe("aislamiento: CAT-013 y la proyección son exclusivos de FEX v3", () => {
  it("resolveDteMunicipality().municipalityCode sigue siendo Municipality.code", async () => {
    const db = {
      municipality: {
        findFirst: async () => ({
          dept_code: "05", code: "11", district_code: "050611", district_name: "Santa Tecla",
          new_municipality_code: "0506", new_municipality_name: "La Libertad Sur",
        }),
      },
    };
    const resolved = await resolveDteMunicipality({ deptCode: "05", municipalityCode: "11" }, db as never);
    expect(resolved?.municipalityCode).toBe("11");
    expect(resolved?.districtCode).toBe("050611");
    expect(resolved).not.toHaveProperty("cat013Code");
  });

  it("no muta el resultado del resolver", () => {
    const resolved = { ...SANTA_TECLA };
    projectFexV3Territory(resolved);
    expect(resolved).toEqual(SANTA_TECLA);
  });

  it.each([
    ["FE 01",   "services/generate-fe-json.service.ts"],
    ["CCFE 03", "services/generate-ccfe-json.service.ts"],
    ["NC 05",   "services/generate-nc-json.service.ts"],
    ["FSE 14",  "services/generate-fse-json.service.ts"],
    ["resolver territorial compartido", "utils/dte-territory.resolver.ts"],
  ])("%s no usa CAT-013 FEX v3 ni la proyección FEX v3", (_name, file) => {
    const source = readFileSync(join(__dirname, "..", file), "utf8");
    expect(source).not.toContain("cat013-fex-v3-municipalities");
    expect(source).not.toContain("CAT013_FEX_V3_MUNICIPALITIES");
    expect(source).not.toContain("fex11-v3-territory");
    expect(source).not.toContain("projectFexV3Territory");
  });
});
