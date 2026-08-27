// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-territory.resolver.test.ts
//
// Tests centinela permanentes del resolver territorial único.
// Referencia de no regresión: DTE tipoDte="03" real, PROCESADO por
// Hacienda en TEST (codigoGeneracion 91813799-11B5-461D-836F-
// B4D35B3ED0FB), con emisor Santa Tecla 05/11 y receptor San
// Salvador 06/14 — ver dte-territory.resolver.ts.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

// Fixture mínimo que imita el catálogo Municipality real, incluyendo
// los dos casos centinela y un tercer registro con el mismo dept_code
// que San Salvador pero code distinto, para probar que un par
// desalineado (06/01) NO se confunde con San Salvador (06/14).
const MUNICIPALITY_FIXTURE = [
  {
    dept_code: "05", code: "11",
    district_name: "Santa Tecla", new_municipality_code: "0506", new_municipality_name: "La Libertad Sur",
    status: "active",
  },
  {
    dept_code: "06", code: "14",
    district_name: "San Salvador", new_municipality_code: "0601", new_municipality_name: "San Salvador Centro",
    status: "active",
  },
  {
    dept_code: "06", code: "01",
    district_name: "Ayutuxtepeque", new_municipality_code: "0601", new_municipality_name: "San Salvador Centro",
    status: "active",
  },
] as const;

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    municipality: {
      findFirst: vi.fn(async ({ where }: { where: { dept_code: string; code: string; status: string } }) => {
        const row = MUNICIPALITY_FIXTURE.find(
          (r) => r.dept_code === where.dept_code && r.code === where.code && r.status === where.status,
        );
        return row ?? null;
      }),
    },
  },
}));

const { resolveDteMunicipality, validateDteAddressCodes } = await import("./dte-territory.resolver");

describe("resolveDteMunicipality", () => {
  it("TEST 1 — La Libertad / Santa Tecla resuelve departamento=05, municipio=11", async () => {
    const result = await resolveDteMunicipality({ deptCode: "05", municipalityCode: "11" });
    expect(result?.departmentCode).toBe("05");
    expect(result?.municipalityCode).toBe("11");
  });

  it("TEST 2 — San Salvador / San Salvador resuelve departamento=06, municipio=14", async () => {
    const result = await resolveDteMunicipality({ deptCode: "06", municipalityCode: "14" });
    expect(result?.departmentCode).toBe("06");
    expect(result?.municipalityCode).toBe("14");
  });

  it("TEST 3 — un par desalineado (06/01) resuelve a un municipio distinto de San Salvador, nunca se confunde", async () => {
    const wrong = await resolveDteMunicipality({ deptCode: "06", municipalityCode: "01" });
    const correct = await resolveDteMunicipality({ deptCode: "06", municipalityCode: "14" });
    expect(wrong?.districtName).not.toBe(correct?.districtName);
    expect(wrong?.districtName).toBe("Ayutuxtepeque");
  });

  it("TEST 5 — new_municipality_code (ej. 0506/0601) nunca se devuelve como municipalityCode", async () => {
    const staTecla = await resolveDteMunicipality({ deptCode: "05", municipalityCode: "11" });
    expect(staTecla?.municipalityCode).toBe("11");
    expect(staTecla?.municipalityCode).not.toBe(staTecla?.newMunicipalityCode);

    const sanSalvador = await resolveDteMunicipality({ deptCode: "06", municipalityCode: "14" });
    expect(sanSalvador?.municipalityCode).toBe("14");
    expect(sanSalvador?.municipalityCode).not.toBe(sanSalvador?.newMunicipalityCode);
  });

  it("código inexistente devuelve null", async () => {
    const result = await resolveDteMunicipality({ deptCode: "06", municipalityCode: "99" });
    expect(result).toBeNull();
  });
});

describe("validateDteAddressCodes", () => {
  it("acepta el par correcto de Santa Tecla", async () => {
    const result = await validateDteAddressCodes({ role: "emisor", deptCode: "05", municipalityCode: "11" });
    expect(result.ok).toBe(true);
  });

  it("acepta el par correcto de San Salvador", async () => {
    const result = await validateDteAddressCodes({ role: "receptor", deptCode: "06", municipalityCode: "14" });
    expect(result.ok).toBe(true);
  });

  it("rechaza un código territorial que no existe en Municipality", async () => {
    const result = await validateDteAddressCodes({ role: "sujeto excluido", deptCode: "06", municipalityCode: "99" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no corresponde a ningún municipio activo/);
  });

  it("acepta dirección totalmente ausente (ambos códigos null)", async () => {
    const result = await validateDteAddressCodes({ role: "receptor", deptCode: null, municipalityCode: null });
    expect(result.ok).toBe(true);
  });

  it("rechaza un par incompleto (solo departamento)", async () => {
    const result = await validateDteAddressCodes({ role: "receptor", deptCode: "06", municipalityCode: null });
    expect(result.ok).toBe(false);
  });
});
