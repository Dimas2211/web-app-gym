// ─────────────────────────────────────────────────────────────────
// MH20 — registro de perfiles, schemas versionados, interruptor global,
// guardas de coherencia, política de transición y proyección territorial
// (IMP20-001..008, IMP20-012, IMP20-020).
// ─────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  dteSpecTransmissionBlockedError,
  getDteSchemaByVersion,
  getDteSpec,
  getDteSpecVersion,
  inferProfileFromDocument,
  listDteSpecEntries,
  listKnownDteVersions,
} from "./dte-spec-registry";
import { parseDteSpecProfile, DEFAULT_DTE_SPEC_PROFILE } from "./dte-spec-profile";
import { readDteJsonVersion } from "./dte-json-version";
import { assertDteSpecGenerationAllowed, resolveActiveDteSpecProfile } from "./resolve-active-dte-spec-profile";
import { checkDteDocumentSpecCoherence } from "./dte-spec-guard";
import { decideDteTransition } from "./dte-transition-policy";
import { isDteMh20ProfileEnabled, mh20ProfileSelect, mh20ProfileWriteData, resolveDteMh20PendingPolicy } from "../config/dte-mh20.flags";
import {
  __compiledDteValidatorCountForTests,
  validateDteJsonAgainstOfficialSchema,
} from "../services/validate-dte-json-schema.service";
import { mhTerritoryOptionsForProfile, projectMhTerritory } from "../utils/dte-territory-projection";
import { CAT013_V1_2, CAT013_V2_0 } from "../utils/cat013-municipalities";
import { MUNICIPALITIES } from "../../../../../prisma/importers/generated/municipalities.data";
import { MH_SEMANTIC_RULES } from "../rules/mh-semantic-rules.catalog";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const V2_DIR = join(__dirname, "..", "schemas", "mh", "v2_0");
const ORIG = join(ROOT, "docs", "fiscal", "mh-normativa-2.0", "originales", "svfe-json-schemas");
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

describe("schemas 2.0 — copia literal con SHA-256", () => {
  const sums = readFileSync(join(V2_DIR, "SHA256SUMS.md"), "utf8");
  const rows = [...sums.matchAll(/^\| (\S+\.json) \| (\S+) \| ([0-9a-f]{64}) \|$/gm)];

  it("SHA256SUMS lista los 8 schemas", () => expect(rows).toHaveLength(8));

  it.each(rows.map((r) => [r[1], r[2], r[3]]))("%s", (file, origin, hash) => {
    expect(sha(join(V2_DIR, file))).toBe(hash);
    expect(sha(join(ORIG, origin))).toBe(hash);
  });

  it("FEX v3 oficial = fex-11-v3.schema.json vigente", () => {
    expect(sha(join(ORIG, "v3", "fe-fex-v3.json"))).toBe(sha(join(V2_DIR, "..", "fex-11-v3.schema.json")));
  });
});

describe("registro de perfiles", () => {
  it("default MH_1_2; NULL → MH_1_2; desconocido → null", () => {
    expect(DEFAULT_DTE_SPEC_PROFILE).toBe("MH_1_2");
    expect(parseDteSpecProfile(null)).toBe("MH_1_2");
    expect(parseDteSpecProfile("MH_9_9")).toBeNull();
  });

  it("versiones por perfil", () => {
    expect([["01", 1], ["03", 3], ["05", 3], ["11", 3], ["14", 1], ["INV", 2], ["CONT", 3]].map(
      ([k]) => getDteSpecVersion("MH_1_2", k as never))).toEqual([1, 3, 3, 3, 1, 2, 3]);
    expect([["01"], ["03"], ["05"], ["11"], ["14"], ["INV"], ["CONT"]].map(
      ([k]) => getDteSpecVersion("MH_2_0", k as never))).toEqual([2, 4, 4, 3, 2, 3, 4]);
  });

  it("schema por versión del documento; versión desconocida → null", () => {
    expect(getDteSchemaByVersion("01", 2)?.schemaId).toBe("v2_0/fe-f-v2.json");
    expect(getDteSchemaByVersion("05", 3)?.schemaId).toBe("fe-nc-v3.json");
    expect(getDteSchemaByVersion("01", 7)).toBeNull();
    expect(listKnownDteVersions("03")).toEqual([3, 4]);
  });

  it("FEX v3 → AMBIGUOUS; v1/v2 inferidos", () => {
    expect(inferProfileFromDocument("11", 3)).toBe("AMBIGUOUS");
    expect(inferProfileFromDocument("01", 1)).toBe("MH_1_2");
    expect(inferProfileFromDocument("01", 2)).toBe("MH_2_0");
    expect(inferProfileFromDocument("01", 9)).toBeNull();
  });

  it("toda entrada apunta a un schema cargado", () => {
    for (const e of listDteSpecEntries()) expect(getDteSchemaByVersion(e.kind, e.version)?.schemaId).toBe(e.schemaId);
  });

  // Fase 6: INV v3 y Retorno 18 quedan implementados localmente (solo TEST,
  // PRODUCTION fail-closed por INC-004/006 e INC-013). CONT v4 (INC-005) y
  // OE 17 (autorización + INC-001) siguen bloqueados para generar.
  it("contingencia v4 / 17 siguen bloqueados con MH_2_0", () => {
    for (const k of ["CONT", "17"] as const) {
      expect(getDteSpec("MH_2_0", k)?.blocked).toBeTruthy();
      expect(assertDteSpecGenerationAllowed("MH_2_0", k, "TEST").ok).toBe(false);
    }
  });

  it("invalidación v3 / retorno 18: TEST con advertencia, PRODUCTION fail-closed", () => {
    for (const k of ["INV", "18"] as const) {
      expect(getDteSpec("MH_2_0", k)?.blocked).toBeUndefined();
      const test = assertDteSpecGenerationAllowed("MH_2_0", k, "TEST");
      expect(test.ok && test.warning).toBeTruthy();
      expect(assertDteSpecGenerationAllowed("MH_2_0", k, "PRODUCTION").ok).toBe(false);
    }
  });

  it("transmisión bloqueada en cualquier ambiente: CONT v4, 17 y 18", () => {
    for (const k of ["CONT", "17", "18"] as const) {
      expect(dteSpecTransmissionBlockedError("MH_2_0", k)).toBeTruthy();
    }
    expect(dteSpecTransmissionBlockedError("MH_2_0", "INV")).toBeNull();
    expect(dteSpecTransmissionBlockedError("MH_1_2", "INV")).toBeNull();
    expect(dteSpecTransmissionBlockedError("MH_1_2", "CONT")).toBeNull();
  });

  it("pendingConfirmation: falla cerrado en PRODUCTION, advertencia en TEST", () => {
    const prod = assertDteSpecGenerationAllowed("MH_2_0", "11", "PRODUCTION");
    expect(prod.ok).toBe(false);
    const test = assertDteSpecGenerationAllowed("MH_2_0", "11", "TEST");
    expect(test.ok && test.warning).toBeTruthy();
    expect(assertDteSpecGenerationAllowed("MH_1_2", "11", "PRODUCTION")).toMatchObject({ ok: true, warning: null });
  });
});

describe("interruptor global DTE_MH20_PROFILE_ENABLED (apagado por defecto)", () => {
  afterEach(() => { delete process.env.DTE_MH20_PROFILE_ENABLED; });

  it("apagado: MH_1_2 aunque el emisor diga MH_2_0; no se lee ni escribe M1", () => {
    expect(isDteMh20ProfileEnabled({})).toBe(false);
    expect(isDteMh20ProfileEnabled({ DTE_MH20_PROFILE_ENABLED: "1" })).toBe(false);
    expect(resolveActiveDteSpecProfile({ mh_spec_profile: "MH_2_0" }, {})).toEqual({ ok: true, profile: "MH_1_2" });
    expect(mh20ProfileSelect({})).toEqual({});
    expect(mh20ProfileWriteData("MH_2_0", {})).toEqual({});
    expect(resolveDteMh20PendingPolicy({})).toBe("TRANSMIT_AS_IS");
  });

  it("encendido: perfil por emisor; valor desconocido → error", () => {
    const env = { DTE_MH20_PROFILE_ENABLED: "true" };
    expect(resolveActiveDteSpecProfile({ mh_spec_profile: "MH_2_0" }, env)).toEqual({ ok: true, profile: "MH_2_0" });
    expect(resolveActiveDteSpecProfile({ mh_spec_profile: null }, env)).toEqual({ ok: true, profile: "MH_1_2" });
    expect(resolveActiveDteSpecProfile({ mh_spec_profile: "X" }, env).ok).toBe(false);
    expect(mh20ProfileWriteData("MH_2_0", env)).toEqual({ mh_spec_profile: "MH_2_0" });
  });
});

describe("guarda de coherencia versión ↔ perfil ↔ schema", () => {
  it("versión enviada = identificacion.version del documento", () => {
    const r = checkDteDocumentSpecCoherence({ kind: "01", jsonDocument: { identificacion: { version: 2 } }, persistedProfile: "MH_2_0" });
    expect(r).toMatchObject({ ok: true, version: 2, versionSource: "DOCUMENT" });
  });

  it("histórico sin versión y sin perfil → fallback MH_1_2", () => {
    const r = checkDteDocumentSpecCoherence({ kind: "03", jsonDocument: null, persistedProfile: null });
    expect(r).toMatchObject({ ok: true, version: 3, versionSource: "LEGACY_FALLBACK" });
  });

  it("perfil persistido incoherente con la versión → error", () => {
    const r = checkDteDocumentSpecCoherence({ kind: "01", jsonDocument: { identificacion: { version: 1 } }, persistedProfile: "MH_2_0" });
    expect(r.ok).toBe(false);
  });

  it("versión desconocida → error explícito", () => {
    expect(checkDteDocumentSpecCoherence({ kind: "01", jsonDocument: { identificacion: { version: 9 } } }).ok).toBe(false);
    expect(readDteJsonVersion('{"identificacion":{"version":"2"}}')).toBeNull();
  });
});

describe("validador AJV por versión", () => {
  it("versión desconocida / ausente → error en /identificacion/version", () => {
    const r = validateDteJsonAgainstOfficialSchema("01", { identificacion: { version: 9 } });
    expect(r.ok).toBe(false);
    const missing = validateDteJsonAgainstOfficialSchema("01", {});
    expect(missing.ok).toBe(false);
  });

  it("compila cada schema una sola vez (caché)", () => {
    validateDteJsonAgainstOfficialSchema("03", { identificacion: { version: 4 } });
    const n = __compiledDteValidatorCountForTests();
    validateDteJsonAgainstOfficialSchema("03", { identificacion: { version: 4 } });
    expect(__compiledDteValidatorCountForTests()).toBe(n);
  });
});

describe("política de transición (D9)", () => {
  const d = (dteStatus: string, docProfile: "MH_1_2" | "MH_2_0" | "AMBIGUOUS", policy: "TRANSMIT_AS_IS" | "REGENERATE_REQUIRED" = "TRANSMIT_AS_IS") =>
    decideDteTransition({ dteStatus, docProfile, activeProfile: "MH_2_0", policy });
  it("estados", () => {
    expect(decideDteTransition({ dteStatus: "PENDING_GENERATION", docProfile: null, activeProfile: "MH_2_0", policy: "TRANSMIT_AS_IS" })).toBe("GENERATE_WITH_ACTIVE");
    expect(d("GENERATED", "MH_1_2")).toBe("REGENERATE");
    expect(d("SCHEMA_VALIDATED", "MH_2_0")).toBe("PROCEED");
    expect(d("SIGNED", "MH_1_2")).toBe("TRANSMIT_AS_IS");
    expect(d("SIGNED", "MH_1_2", "REGENERATE_REQUIRED")).toBe("REGENERATE_REQUIRED");
    expect(d("SIGNED", "AMBIGUOUS")).toBe("PROCEED");
    expect(d("ACCEPTED", "MH_1_2")).toBe("IMMUTABLE");
  });
});

describe("proyección territorial canónica sobre todo el catálogo Municipality", () => {
  const resolved = (m: (typeof MUNICIPALITIES)[number]) => ({
    departmentCode: m.dept_code, newMunicipalityCode: m.new_municipality_code,
    newMunicipalityName: m.new_municipality_name, districtCode: m.district_code,
  });

  it("MH_1_2 (FEX histórico): todas las filas proyectan; distrito = código anterior", () => {
    let ok = 0;
    for (const m of MUNICIPALITIES) {
      const r = projectMhTerritory(resolved(m), { cat013: CAT013_V1_2 });
      expect(r.ok, `${m.dept_code}|${m.code}`).toBe(true);
      if (r.ok) { expect(r.territory.distrito).toBe(m.code); ok++; }
    }
    expect(ok).toBe(MUNICIPALITIES.length);
  });

  // Fase 6.1: Cabañas resuelto documentalmente (CAT-013 v1.1). Cambio de
  // expectativa justificado: antes fallaba cerrado con CAT_INC_001_CABANAS.
  it("MH_2_0: todas las filas proyectan; Cabañas REVIEW_CAT013_CHANGED; Delgado REVIEW_LABEL", () => {
    let review = 0; let changed = 0;
    for (const m of MUNICIPALITIES) {
      const r = projectMhTerritory(resolved(m), mhTerritoryOptionsForProfile("MH_2_0"));
      expect(r.ok, `${m.dept_code}|${m.code}`).toBe(true);
      if (!r.ok) continue;
      if (r.review.includes("REVIEW_LABEL")) { expect(`${m.dept_code}|${m.code}`).toBe("06|19"); review++; }
      if (r.review.includes("REVIEW_CAT013_CHANGED")) { expect(m.dept_code).toBe("09"); changed++; }
    }
    expect(review).toBe(1);
    expect(changed).toBe(9);
  });

  it("bloqueo explícito blockCabanas sigue disponible como opción (compatibilidad)", () => {
    const m = MUNICIPALITIES.find((x) => x.dept_code === "09")!;
    const r = projectMhTerritory(resolved(m), { cat013: CAT013_V2_0, blockCabanas: true });
    expect(r.ok).toBe(false);
  });

  it("MH_2_0 fuera de Cabañas coincide con V1.2 (sin cambios de código)", () => {
    for (const m of MUNICIPALITIES.filter((x) => x.dept_code !== "09")) {
      const a = projectMhTerritory(resolved(m), { cat013: CAT013_V1_2 });
      const b = projectMhTerritory(resolved(m), mhTerritoryOptionsForProfile("MH_2_0"));
      expect(b.ok && a.ok && b.territory).toEqual(a.ok && a.territory);
    }
  });
});

describe("catálogo de reglas semánticas", () => {
  it("cada regla clasificada con estado y referencia", () => {
    const statuses = new Set(["VIGENTE_CONFIRMADA", "MODIFICADA", "ELIMINADA_CONFIRMADA", "PENDIENTE_ACLARACION"]);
    for (const r of MH_SEMANTIC_RULES) {
      expect(statuses.has(r.status), r.id).toBe(true);
    }
    expect(MH_SEMANTIC_RULES.length).toBeGreaterThanOrEqual(15);
  });
});
