// DTE-MH-TEST-RUNS — escenarios: validación de perfiles + dry-run real contra
// builders puros y schemas oficiales MH. Los datos de receptor son FIXTURES
// de test (no se usan en ninguna corrida real: el operador los ingresa).

import { describe, it, expect } from "vitest";
import {
  buildMhTestScenarioJson,
  MH_TEST_SCENARIOS,
  dryRunMhTestScenarios,
  validateMhTestReceptors,
  type MhTestBuildContext,
  type MhTestScenarioCode,
  type MhTestReceptors,
} from "./mh-test-scenarios";
import { validateDteJsonAgainstOfficialSchema } from "../services/validate-dte-json-schema.service";

const issuer = {
  id: "iss-1", tenant_id: "t1", location_id: "l1", environment: "TEST", is_active: true,
  nit: "06141234567890", nrc: "1234567", name: "EMISOR DE PRUEBA SA DE CV", legal_name: null,
  activity_code: "93110", activity_name: "Gestión de instalaciones deportivas",
  establishment_code: "M001", establishment_type_code: "02", point_of_sale_code: "P001",
  cod_estable_mh: "M001", cod_punto_venta_mh: "P001",
  dept_code: "05", municipality_code: "11", address_complement: "Calle de prueba 123",
  phone: "22223333", email: "facturacion@emisor.test",
} as unknown as MhTestBuildContext["issuer"];

const receptors: MhTestReceptors = {
  identified: { idTypeCode: "13", documentNumber: "00000000-0", name: "RECEPTOR FIXTURE", email: "r@fixture.test" },
  taxpayer: {
    nit: "06140000000000", nrc: "1234", name: "CONTRIBUYENTE FIXTURE SA DE CV", activityCode: "46900",
    activityName: "Venta al por mayor", deptCode: "06", municipalityCode: "14", addressComplement: "Col. Fixture",
    email: "c@fixture.test", phone: "22220000",
  },
  foreign: {
    name: "FOREIGN FIXTURE LLC", idTypeCode: "03", documentNumber: "AB1234567", countryCode: "US",
    addressComplement: "1 MAIN ST", activityName: "SERVICES", personType: "2", email: "f@fixture.test",
  },
  excludedSubject: {
    idTypeCode: "13", documentNumber: "000000000", name: "SUJETO EXCLUIDO FIXTURE", deptCode: "06",
    municipalityCode: "14", addressComplement: "Col. Fixture", email: "s@fixture.test",
  },
};

const ctx: MhTestBuildContext = {
  issuer, receptors,
  emisorFexTerritory: { departamento: "05", municipio: "28", distrito: "11" } as MhTestBuildContext["emisorFexTerritory"],
  foreignCountry: { code: "US", name: "Estados Unidos" },
};

const ALL: MhTestScenarioCode[] = ["FE01_CONSUMIDOR_FINAL", "FE01_IDENTIFICADO", "CCFE03_ESTANDAR", "FEX11_SERVICIOS", "FSE14_SERVICIOS", "CONT01_FE", "CONT03_CCFE"];
const NOW = new Date("2026-11-16T15:00:00Z");

describe("dry-run de escenarios MH TEST", () => {
  it("todos los escenarios armables pasan builder + schema oficial", () => {
    const errors = dryRunMhTestScenarios(ctx, new Set(ALL), { contingencyTypeCode: "1", reason: null }, NOW);
    expect(errors).toEqual([]);
  });

  it.each(ALL)("%s produce JSON válido con varios índices (montos distintos)", (scenario) => {
    for (const index of [0, 7, 49]) {
      const contingency = scenario.startsWith("CONT");
      const built = buildMhTestScenarioJson(ctx, scenario, {
        control_number: `DTE-${MH_TEST_SCENARIOS[scenario].dteTypeCode}-M001P001-000000000000009`, generation_code: "A1B2C3D4-E5F6-4234-8678-9ABCDEF01234",
        transmission_type_code: contingency ? "2" : "1", contingency_type_code: contingency ? "1" : null, contingency_reason: null,
      }, index, NOW);
      expect(built.ok, built.ok ? "" : built.error).toBe(true);
    }
  });

  it("FE consumidor final no lleva receptor identificado; FE identificado sí", () => {
    const doc = { control_number: "DTE-01-M001P001-000000000000001", generation_code: "A1B2C3D4-E5F6-4234-8678-9ABCDEF01234", transmission_type_code: "1", contingency_type_code: null, contingency_reason: null };
    const cf = buildMhTestScenarioJson(ctx, "FE01_CONSUMIDOR_FINAL", doc, 0, NOW);
    const id = buildMhTestScenarioJson(ctx, "FE01_IDENTIFICADO", doc, 0, NOW);
    expect(cf.ok && (cf.json.receptor as { numDocumento: unknown }).numDocumento).toBeNull();
    expect(id.ok && (id.json.receptor as { tipoDocumento: unknown }).tipoDocumento).toBe("13");
  });

  it("contingencia: identificación con tipoModelo 2 / tipoOperacion 2 y valida contra schema", () => {
    const built = buildMhTestScenarioJson(ctx, "CONT01_FE", {
      control_number: "DTE-01-M001P001-000000000000003", generation_code: "A1B2C3D4-E5F6-4234-8678-9ABCDEF01234",
      transmission_type_code: "2", contingency_type_code: "1", contingency_reason: null,
    }, 0, NOW);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const ident = built.json.identificacion as Record<string, unknown>;
    expect(ident.tipoOperacion).toBe(2);
    expect(validateDteJsonAgainstOfficialSchema("01", built.json).ok).toBe(true);
  });

  it("dry-run reporta un perfil inválido sin lanzar", () => {
    const bad = { ...ctx, receptors: { ...receptors, taxpayer: null } };
    const errors = dryRunMhTestScenarios(bad, new Set<MhTestScenarioCode>(["CCFE03_ESTANDAR"]), null, NOW);
    expect(errors.length).toBe(1);
  });
});

describe("validateMhTestReceptors — sin inventar datos", () => {
  it("exige los perfiles de los escenarios elegidos", () => {
    const errors = validateMhTestReceptors(new Set<MhTestScenarioCode>(["CCFE03_ESTANDAR", "FSE14_SERVICIOS"]), {}, null, false, null);
    expect(errors.join(" ")).toMatch(/Contribuyente/);
    expect(errors.join(" ")).toMatch(/Sujeto excluido/);
  });

  it("no exige perfiles para escenarios sin receptor", () => {
    expect(validateMhTestReceptors(new Set<MhTestScenarioCode>(["FE01_CONSUMIDOR_FINAL"]), {}, null, false, null)).toEqual([]);
  });

  it("valida longitud NIT/DUI, correo y responsable", () => {
    const errors = validateMhTestReceptors(
      new Set<MhTestScenarioCode>(["FE01_IDENTIFICADO"]),
      { identified: { idTypeCode: "13", documentNumber: "123", name: "X", email: "no-es-correo" } },
      { name: "abc", docTypeCode: "13", documentNumber: "1" },
      true,
      null,
    );
    expect(errors.some((e) => e.includes("DUI"))).toBe(true);
    expect(errors.some((e) => e.includes("correo"))).toBe(true);
    expect(errors.some((e) => e.includes("Responsable"))).toBe(true);
  });

  it("contingencia tipo 5 exige motivo", () => {
    const errors = validateMhTestReceptors(new Set<MhTestScenarioCode>(["CONT01_FE"]), {}, null, false, { contingencyTypeCode: "5", reason: "" });
    expect(errors.some((e) => e.includes("tipo 5"))).toBe(true);
  });
});
