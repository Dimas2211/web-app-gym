// MH20 — Fase 8: onboarding MH TEST con perfil normativo por corrida, preset
// MF 2.0, cadena ≤ 200 ítems, escenarios BLOCKED y dry-run 2.0 real contra
// los builders puros y los schemas oficiales v2. Sin BD, sin red, sin MH.
// Los datos de receptor son FIXTURES de test.

import { describe, it, expect, vi } from "vitest";
import {
  MH20_ONBOARDING_PRESET,
  buildMhTestQuantityPlan,
  chainMhTestPlan,
  listMhTestScenarioReadiness,
  validateMhTestRunProfileReadiness,
} from "./mh-test-minimums";
import { planMhTestRun, MAX_MH_TEST_RUN_ITEMS } from "./mh-test-run.planner";
import { advanceMhTestRun } from "./mh-test-run.engine";
import { createInMemoryMhTestRunRepository } from "./mh-test-run.repository";
import { MH20_TEST_RUNS_BLOCKED_MESSAGE, isMhTestRunsM4Applied } from "./mh-test-run.flags";
import {
  buildMhTestScenarioJson,
  dryRunMhTestScenarios,
  mhTestBuildOptionsForProfile,
  type MhTestBuildContext,
  type MhTestReceptors,
  type MhTestScenarioCode,
} from "@/modules/commerce/dte/mh-test-runs/mh-test-scenarios";
import { validateDteJsonAgainstOfficialSchema } from "@/modules/commerce/dte/services/validate-dte-json-schema.service";
import type { MhTestRuntimePort } from "./mh-test-run.runtime-port";

const issuer = {
  id: "iss-1", tenant_id: "t1", location_id: "l1", environment: "TEST", is_active: true,
  nit: "06141234567890", nrc: "1234567", name: "EMISOR DE PRUEBA SA DE CV", legal_name: null,
  activity_code: "93110", activity_name: "Gestión de instalaciones deportivas",
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
const NOW = new Date("2026-11-16T15:00:00Z");

describe("Fase 8 — readiness por perfil", () => {
  it("MH_2_0: FE v2, CCF v4, NC v4, FSE v2, FEX v3, Invalidación v3 READY; Contingencia v4, Retorno y OE BLOCKED", () => {
    const r = Object.fromEntries(listMhTestScenarioReadiness("MH_2_0").map((x) => [x.kind, x]));
    expect([r.FE.version, r.CCF.version, r.NC.version, r.FSE.version, r.FEX.version, r.INVALIDATION.version]).toEqual([2, 4, 4, 2, 3, 3]);
    for (const k of ["FE", "CCF", "NC", "FSE", "FEX", "INVALIDATION"]) expect(r[k].status).toBe("READY");
    for (const k of ["CONTINGENCY", "RETURN", "SPECIAL_OPS"]) {
      expect(r[k].status).toBe("BLOCKED");
      expect(r[k].blocker).toBeTruthy();
    }
    expect(r.NC.dependsOn).toEqual(["CCF"]);
    expect(r.RETURN.dependsOn).toEqual(["FE", "FEX", "FSE"]);
  });
  it("MH_1_2: Retorno y OE no existen (BLOCKED); contingencia v3 READY", () => {
    const r = Object.fromEntries(listMhTestScenarioReadiness("MH_1_2").map((x) => [x.kind, x]));
    expect(r.RETURN.status).toBe("BLOCKED");
    expect(r.SPECIAL_OPS.status).toBe("BLOCKED");
    expect(r.CONTINGENCY).toMatchObject({ status: "READY", version: 3 });
  });
});

describe("Fase 8 — preset configurable", () => {
  it("preset MF 2.0 completo: 330 documentos + 5 invalidaciones; contingencia y retorno informados como BLOCKED", () => {
    const q = buildMhTestQuantityPlan({ profile: "MH_2_0", applicableDocs: ["FE", "CCF", "NC", "FEX", "FSE"] });
    expect(q.errors).toEqual([]);
    expect(q.docs).toEqual({ FE: 90, CCF: 75, NC: 50, FEX: 90, FSE: 25 });
    expect(q.invalidations).toEqual({ FE: 5, CCF: 0 });
    expect(q.blockedEvents.map((b) => b.kind).sort()).toEqual(["CONTINGENCY", "RETURN"]);
    expect(MH20_ONBOARDING_PRESET.eventsPerApplicable).toBe(5);
  });
  it("no exige documentos que el emisor no necesita y respeta overrides", () => {
    const q = buildMhTestQuantityPlan({ profile: "MH_2_0", applicableDocs: ["CCF"], quantities: { CCF: 10 }, eventsPerApplicable: 5 });
    expect(q.docs).toEqual({ FE: 0, CCF: 10, NC: 0, FEX: 0, FSE: 0 });
    expect(q.invalidations).toEqual({ FE: 0, CCF: 5 });
    expect(q.blockedEvents.find((b) => b.kind === "RETURN")).toBeUndefined(); // Retorno no aplica sin FE/FEX/FSE
  });
  it("errores: NC sin CCF, NC > CCF, invalidaciones insuficientes", () => {
    expect(buildMhTestQuantityPlan({ profile: "MH_2_0", applicableDocs: ["NC"] }).errors.join(" ")).toMatch(/NC requiere CCF/);
    expect(buildMhTestQuantityPlan({ profile: "MH_2_0", applicableDocs: ["CCF", "NC"], quantities: { CCF: 3, NC: 4 } }).errors.join(" ")).toMatch(/no puede exceder/);
    expect(buildMhTestQuantityPlan({ profile: "MH_2_0", applicableDocs: ["CCF", "NC"], quantities: { CCF: 5, NC: 3 } }).errors.join(" ")).toMatch(/suficientes/);
  });
  it("eventos 0 → sin invalidaciones ni bloqueos informados", () => {
    const q = buildMhTestQuantityPlan({ profile: "MH_2_0", applicableDocs: ["FE"], eventsPerApplicable: 0 });
    expect(q.invalidations).toEqual({ FE: 0, CCF: 0 });
    expect(q.blockedEvents).toEqual([]);
  });
});

describe("Fase 8 — corridas encadenadas (≤ 200 ítems)", () => {
  const firsts = { "01": 100, "03": 200, "05": 300, "11": 400, "14": 500 } as const;
  const q = buildMhTestQuantityPlan({ profile: "MH_2_0", applicableDocs: ["FE", "CCF", "NC", "FEX", "FSE"] });

  it("totales exactos, rangos contiguos y disjuntos, cada segmento ≤ 200 y válido para el planner", () => {
    const c = chainMhTestPlan(q, firsts);
    if (!c.ok) throw new Error(c.errors.join("; "));
    expect(c.segments.length).toBeGreaterThan(1);
    const seen = new Map<string, number[]>();
    let inv = 0;
    for (const s of c.segments) {
      expect(s.itemCount).toBeLessThanOrEqual(MAX_MH_TEST_RUN_ITEMS);
      expect(s.total).toBe(c.segments.length);
      inv += s.invalidations.reduce((a, x) => a + x.count, 0);
      for (const b of s.blocks) {
        const n = b.scenarios.reduce((a, x) => a + x.count, 0);
        const arr = seen.get(b.dteTypeCode) ?? [];
        for (let i = 0; i < n; i++) arr.push(b.firstSequence + i);
        seen.set(b.dteTypeCode, arr);
      }
      const planned = planMhTestRun({
        version: 2, specProfile: "MH_2_0", chain: { chainId: "chain-test-1", index: s.index, total: s.total },
        blocks: s.blocks, invalidations: s.invalidations, receptors,
        responsible: { name: "Responsable Fixture", docTypeCode: "13", documentNumber: "000000000" }, contingency: null,
      });
      if (!planned.ok) throw new Error(planned.errors.join("; "));
      expect(planned.items.length).toBe(s.itemCount);
      expect(planned.profile).toBe("MH_2_0");
    }
    const expectCount = { "01": 90, "03": 75, "05": 50, "11": 90, "14": 25 } as Record<string, number>;
    for (const [type, seqs] of seen) {
      expect(seqs.length).toBe(expectCount[type]);
      expect(new Set(seqs).size).toBe(seqs.length);
      const sorted = [...seqs].sort((a, b) => a - b);
      expect(sorted[0]).toBe(firsts[type as keyof typeof firsts]);
      expect(sorted[sorted.length - 1] - sorted[0] + 1).toBe(sorted.length); // sin huecos
    }
    expect(inv).toBe(5);
  });

  it("NC y su CCF quedan siempre en el mismo segmento", () => {
    const c = chainMhTestPlan(q, firsts);
    if (!c.ok) throw new Error();
    for (const s of c.segments) {
      const nc = s.blocks.find((b) => b.dteTypeCode === "05")?.scenarios[0]?.count ?? 0;
      const ccf = s.blocks.find((b) => b.dteTypeCode === "03")?.scenarios[0]?.count ?? 0;
      expect(nc).toBeLessThanOrEqual(ccf);
    }
  });

  it("falta primer correlativo → error; límite configurable", () => {
    expect(chainMhTestPlan(q, { "01": 1 }).ok).toBe(false);
    const small = buildMhTestQuantityPlan({ profile: "MH_1_2", applicableDocs: ["FE"], quantities: { FE: 25 }, eventsPerApplicable: 0 });
    const c = chainMhTestPlan(small, { "01": 1 }, 10);
    expect(c.ok && c.segments.map((s) => s.itemCount)).toEqual([10, 10, 5]);
  });
});

describe("Fase 8 — planner v2 (perfil y cadena)", () => {
  const base = {
    blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 2 }] }],
    invalidations: [], receptors: {}, responsible: null, contingency: null,
  };
  it("v1 histórico sigue igual y resuelve MH_1_2", () => {
    const r = planMhTestRun({ version: 1, ...base });
    expect(r.ok && r.profile).toBe("MH_1_2");
  });
  it("v1 no admite perfil 2.0 ni cadena; v2 exige perfil", () => {
    expect(planMhTestRun({ version: 1, specProfile: "MH_2_0", ...base }).ok).toBe(false);
    expect(planMhTestRun({ version: 1, chain: { chainId: "chain-abc-1", index: 1, total: 1 }, ...base }).ok).toBe(false);
    expect(planMhTestRun({ version: 2, ...base }).ok).toBe(false);
    expect(planMhTestRun({ version: 2, specProfile: "MH_2_0", chain: { chainId: "chain-abc-1", index: 3, total: 2 }, ...base }).ok).toBe(false);
  });
  it("MH_2_0 rechaza escenarios de contingencia (BLOCKED)", () => {
    const r = planMhTestRun({
      version: 2, specProfile: "MH_2_0", ...base,
      blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "CONT01_FE", count: 1 }] }],
      responsible: { name: "Responsable Fixture", docTypeCode: "13", documentNumber: "000000000" },
      contingency: { contingencyTypeCode: "1", reason: null },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/BLOCKED con MH 2.0/);
  });
});

describe("Fase 8 — readiness 2.0 de emisor y receptores", () => {
  const snap = { cod_estable_mh: "M001", cod_punto_venta_mh: "P001", dept_code: "05", municipality_code: "11" };
  it("MH_1_2 no agrega reglas", () => {
    expect(validateMhTestRunProfileReadiness({ profile: "MH_1_2", issuer: { ...snap, cod_estable_mh: "0001" }, receptors })).toEqual([]);
  });
  it("MH_2_0: emisor y receptores válidos → sin errores", () => {
    expect(validateMhTestRunProfileReadiness({ profile: "MH_2_0", issuer: snap, receptors })).toEqual([]);
  });
  it("MH_2_0: códigos AT inválidos y territorio inexistente → errores claros", () => {
    const errs = validateMhTestRunProfileReadiness({
      profile: "MH_2_0", issuer: { ...snap, cod_estable_mh: "0001" },
      receptors: { ...receptors, taxpayer: { ...receptors.taxpayer!, municipalityCode: "99" } },
    });
    expect(errs.some((e) => e.startsWith("Emisor:"))).toBe(true);
    expect(errs.some((e) => e.startsWith("Receptor contribuyente"))).toBe(true);
  });
});

describe("Fase 8 — dry-run 2.0 real (builders puros + schemas oficiales v2)", () => {
  const READY_20: MhTestScenarioCode[] = ["FE01_CONSUMIDOR_FINAL", "FE01_IDENTIFICADO", "CCFE03_ESTANDAR", "FEX11_SERVICIOS", "FSE14_SERVICIOS"];

  it("todos los escenarios 2.0 armables pasan builder + schema oficial", () => {
    expect(dryRunMhTestScenarios(ctx, new Set(READY_20), null, NOW, "MH_2_0")).toEqual([]);
  });
  it.each([["FE01_CONSUMIDOR_FINAL", 2], ["CCFE03_ESTANDAR", 4], ["FSE14_SERVICIOS", 2], ["FEX11_SERVICIOS", 3]] as const)(
    "%s con MH_2_0 lleva identificacion.version %i y valida", (scenario, version) => {
      const opts = mhTestBuildOptionsForProfile(ctx, scenario, "MH_2_0");
      if (!opts.ok) throw new Error(opts.error);
      const def = { FE01_CONSUMIDOR_FINAL: "01", CCFE03_ESTANDAR: "03", FSE14_SERVICIOS: "14", FEX11_SERVICIOS: "11" }[scenario];
      const built = buildMhTestScenarioJson(ctx, scenario, {
        control_number: `DTE-${def}-M001P001-000000000000001`, generation_code: "00000000-0000-4000-8000-000000000000",
        transmission_type_code: "1", contingency_type_code: null, contingency_reason: null,
      }, 3, NOW, opts.options);
      if (!built.ok) throw new Error(built.error);
      expect((built.json as { identificacion: { version: number } }).identificacion.version).toBe(version);
      expect(validateDteJsonAgainstOfficialSchema(def, built.json).ok).toBe(true);
    });
  it("MH_2_0 marca la contingencia como bloqueada en el dry-run", () => {
    const errs = dryRunMhTestScenarios(ctx, new Set<MhTestScenarioCode>(["CONT01_FE"]), { contingencyTypeCode: "1", reason: null }, NOW, "MH_2_0");
    expect(errs.join(" ")).toMatch(/bloqueado con MH 2.0/);
  });
  it("MH_1_2 conserva el dry-run histórico (versiones 1.2)", () => {
    expect(dryRunMhTestScenarios(ctx, new Set(READY_20), null, NOW)).toEqual([]);
    const opts = mhTestBuildOptionsForProfile(ctx, "FE01_CONSUMIDOR_FINAL", "MH_1_2");
    expect(opts).toEqual({ ok: true, options: {} });
  });
});

describe("Fase 8 — seguridad de ejecución", () => {
  it("el motor nunca procesa una corrida MH_2_0 (fail-closed, sin materializar ni preflight)", async () => {
    const planned = planMhTestRun({
      version: 2, specProfile: "MH_2_0",
      blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] }],
      invalidations: [], receptors: {}, responsible: null, contingency: null,
    });
    if (!planned.ok) throw new Error(planned.errors.join("; "));
    const repo = createInMemoryMhTestRunRepository();
    const created = await repo.createRun({
      organization_id: "org-1", tenant_id: "t1", location_id: "l1", issuer_config_id: "iss", plan: planned.plan,
      items: planned.items, created_by: "u1", authorized_by: "u1",
    }, new Date());
    if (!created.ok) throw new Error("create");
    const preflight = vi.fn(async () => ({ ok: true, errors: [] }));
    const materialize = vi.fn();
    const port = { preflight, materialize } as unknown as MhTestRuntimePort;
    const out = await advanceMhTestRun(created.runId, { repo, runtime: () => port, owner: "w1", budgetMs: 10_000_000 });
    expect(out.status).toBe("PREFLIGHT_FAILED");
    expect(preflight).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
    const run = await repo.getRun(created.runId);
    expect(run?.status).toBe("NEEDS_REVIEW");
    expect(run?.last_error).toMatch(/MH20_RUN_BLOCKED/);
  });
  it("flags: M4 apagado por defecto; mensaje de bloqueo 2.0 explícito", () => {
    expect(isMhTestRunsM4Applied({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isMhTestRunsM4Applied({ DTE_MH_TEST_RUNS_M4_APPLIED: "true" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(MH20_TEST_RUNS_BLOCKED_MESSAGE).toMatch(/dry-run/);
  });
});
