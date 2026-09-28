// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-v3-territory.test.ts
//
// Tests centinela de la proyección territorial FEX 11 v3
// (FEX-V3-TERRITORY-FIX). MH TEST rechazó 05/11/050611 (codigoMsg 096);
// la proyección correcta para Santa Tecla es 05/06/11. Las filas usan
// los valores reales del catálogo Municipality.
// ─────────────────────────────────────────────────────────────────

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { projectFexV3Territory } from "./fex11-v3-territory";
import type { ResolvedDteMunicipality } from "./dte-territory.resolver";

function row(
  departmentCode: string,
  municipalityCode: string,
  newMunicipalityCode: string | null,
  districtCode: string | null,
): ResolvedDteMunicipality {
  return {
    departmentCode, municipalityCode, districtCode, newMunicipalityCode,
    districtName: null, newMunicipalityName: null,
  };
}

describe("projectFexV3Territory — centinelas del catálogo", () => {
  it.each([
    ["Santa Tecla",  row("05", "11", "0506", "050611"), { departamento: "05", municipio: "06", distrito: "11" }],
    ["San Salvador", row("06", "14", "0601", "060114"), { departamento: "06", municipio: "01", distrito: "14" }],
    ["El Congo",     row("02", "04", "0202", "020204"), { departamento: "02", municipio: "02", distrito: "04" }],
    ["Yamabal",      row("13", "25", "1302", "130225"), { departamento: "13", municipio: "02", distrito: "25" }],
    ["Yoloaiquín",   row("13", "26", "1302", "130226"), { departamento: "13", municipio: "02", distrito: "26" }],
  ])("%s", (_name, resolved, expected) => {
    expect(projectFexV3Territory(resolved)).toEqual({ ok: true, territory: expected });
  });
});

describe("projectFexV3Territory — fail-closed", () => {
  it("municipio nuevo que no pertenece al departamento", () => {
    const r = projectFexV3Territory(row("05", "11", "0606", "060611"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no pertenece al departamento");
  });

  it("distrito que no pertenece al municipio nuevo", () => {
    const r = projectFexV3Territory(row("05", "11", "0506", "050711"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no pertenece al municipio nuevo");
  });

  it.each([
    ["departamento de 1 dígito",   row("5", "11", "0506", "050611")],
    ["municipio nuevo de 3 dígitos", row("05", "11", "506", "050611")],
    ["municipio nuevo de 6 dígitos", row("05", "11", "050611", "050611")],
    ["distrito de 2 dígitos",       row("05", "11", "0506", "11")],
    ["distrito de 8 dígitos",       row("05", "11", "0506", "05061100")],
    ["municipio nuevo no numérico", row("05", "11", "05AB", "05AB11")],
    ["municipio nuevo null",        row("05", "11", null, "050611")],
    ["distrito null",               row("05", "11", "0506", null)],
  ])("%s", (_name, resolved) => {
    expect(projectFexV3Territory(resolved).ok).toBe(false);
  });
});

describe("aislamiento: la proyección es exclusiva de FEX v3", () => {
  it("no muta el resultado del resolver (municipalityCode sigue siendo Municipality.code)", () => {
    const resolved = row("05", "11", "0506", "050611");
    projectFexV3Territory(resolved);
    expect(resolved.municipalityCode).toBe("11");
    expect(resolved.districtCode).toBe("050611");
  });

  it.each([
    "generate-fe-json.service.ts",
    "generate-ccfe-json.service.ts",
    "generate-nc-json.service.ts",
    "generate-fse-json.service.ts",
  ])("%s no usa la proyección FEX v3", (file) => {
    const source = readFileSync(join(__dirname, "..", "services", file), "utf8");
    expect(source).not.toContain("fex11-v3-territory");
    expect(source).not.toContain("projectFexV3Territory");
  });
});
