// MH20 (IMP20-008) — dry-run territorial: núcleo puro sobre fixtures en memoria.
import { describe, expect, it } from "vitest";
import { MUNICIPALITIES } from "../importers/generated/municipalities.data";
import { summarizeMh20TerritoryDryRun, type DryRunParty } from "./mh20-territory-dry-run";

describe("summarizeMh20TerritoryDryRun (solo fixtures locales)", () => {
  it("clasifica proyectados, sin dirección, Cabañas, inexistentes, incompletos y revisión Delgado", () => {
    const cabanas = MUNICIPALITIES.find((m) => m.dept_code === "09")!;
    const parties: DryRunParty[] = [
      { source: "issuer",   id: "i1", dept_code: "05", municipality_code: "11" },
      { source: "customer", id: "c1", dept_code: null, municipality_code: null },
      { source: "customer", id: "c2", dept_code: "06", municipality_code: "19" },
      { source: "supplier", id: "s1", dept_code: cabanas.dept_code, municipality_code: cabanas.code },
      { source: "supplier", id: "s2", dept_code: "06", municipality_code: "99" },
      { source: "supplier", id: "s3", dept_code: "06", municipality_code: null },
    ];
    const s = summarizeMh20TerritoryDryRun(parties, MUNICIPALITIES);
    expect(s.total).toBe(6);
    // Fase 6.1: Cabañas proyecta (CAT-013 v1.1) y queda en revisión.
    expect(s.projected).toBe(3);
    expect(s.noAddress).toBe(1);
    expect(s.review).toEqual([
      { source: "customer", id: "c2", key: "06|19" },
      { source: "supplier", id: "s1", key: `09|${cabanas.code}` },
    ]);
    expect(s.byCode).toEqual({ NOT_FOUND: 1, INCOMPLETE: 1 });
  });
});

// ── Fase 5.1B ─────────────────────────────────────────────────────
import { FEX11_CATALOG_ROWS } from "../seeds/data/fex11-catalog-rows";
import { classifyDryRunFailure, summarizeMh20ExportRegimes } from "./mh20-territory-dry-run";

describe("dry-run 5.1B — clasificación explícita", () => {
  it("byStatus: COMPATIBLE / REVIEW / AMBIGUOUS / INCOMPATIBLE / NO_ADDRESS", () => {
    const cabanas = MUNICIPALITIES.filter((m) => m.dept_code === "09");
    const parties: DryRunParty[] = [
      { source: "issuer",   id: "i1", dept_code: "05", municipality_code: "11" },
      { source: "customer", id: "c1", dept_code: null, municipality_code: null },
      { source: "customer", id: "c2", dept_code: "06", municipality_code: "19" },
      ...cabanas.map((m, i) => ({ source: "supplier" as const, id: `cab${i}`, dept_code: m.dept_code, municipality_code: m.code })),
      { source: "supplier", id: "s2", dept_code: "06", municipality_code: "99" },
    ];
    const s = summarizeMh20TerritoryDryRun(parties, MUNICIPALITIES);
    // Fase 6.1: Cabañas ya no es AMBIGUOUS; cada registro queda en REVIEW.
    expect(s.byStatus).toEqual({ COMPATIBLE: 1, REVIEW: 1 + cabanas.length, AMBIGUOUS: 0, INCOMPATIBLE: 1, NO_ADDRESS: 1 });
    expect(s.review.filter((r) => r.key.startsWith("09|")).map((r) => r.id).sort())
      .toEqual(cabanas.map((_, i) => `cab${i}`).sort());
  });

  it("ningún registro resulta AMBIGUOUS sobre las 262 filas (Fase 6.1: Cabañas en REVIEW)", () => {
    const parties: DryRunParty[] = MUNICIPALITIES.map((m) => ({
      source: "customer", id: `${m.dept_code}|${m.code}`, dept_code: m.dept_code, municipality_code: m.code,
    }));
    const s = summarizeMh20TerritoryDryRun(parties, MUNICIPALITIES);
    expect(s.failures).toEqual([]);
    expect(s.byStatus.INCOMPATIBLE).toBe(0);
    const cab = MUNICIPALITIES.filter((m) => m.dept_code === "09").map((m) => `09|${m.code}`);
    expect(s.review.map((r) => r.key).sort()).toEqual(["06|19", ...cab].sort());
  });

  it("clasificación de códigos de error", () => {
    expect(classifyDryRunFailure("CAT_INC_001_CABANAS")).toBe("AMBIGUOUS");
    expect(classifyDryRunFailure("CAT013_AMBIGUOUS")).toBe("AMBIGUOUS");
    expect(classifyDryRunFailure("NOT_FOUND")).toBe("INCOMPATIBLE");
    expect(classifyDryRunFailure("HIERARCHY_MISMATCH")).toBe("INCOMPATIBLE");
  });
});

describe("dry-run 5.1B — CAT-028 persistido (solo informa)", () => {
  it("V1.2 EX-n.cccc.ccc: 51 con candidato 2.0 (no confirmado) y 5 sin candidato", () => {
    const v12 = FEX11_CATALOG_ROWS.filter((r) => r.catalog_code === "CAT-028").map((r, i) => ({ id: `x${i}`, regime_code: r.item_code }));
    const findings = summarizeMh20ExportRegimes(v12);
    expect(findings).toHaveLength(56);
    const noCand = findings.filter((f) => f.status === "CAT028_NO_CANDIDATE").map((f) => f.regime_code).sort();
    expect(noCand).toEqual(["EX-3.3052.000", "EX-3.3054.000", "EX-3.3055.000", "EX-3.3056.000", "EX-3.3057.000"]);
    expect(findings.filter((f) => f.status === "CAT028_PENDING_EQUIVALENCE")).toHaveLength(51);
  });
  it("candidatos = posible_equivalente_2_0 del diff de Fase 3 (eje OFICIAL_V1.2→2.0)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const diff = JSON.parse(readFileSync(join(__dirname, "..", "..", "docs", "fiscal", "mh-normativa-2.0", "auditoria", "03-catalogos-diff.json"), "utf8")) as {
      diferencias: Array<{ catalogo: string; eje: string; clave: string; tipo_cambio: string; posible_equivalente_2_0?: string | null }>;
    };
    const removed = diff.diferencias.filter((e) => e.catalogo === "CAT-028" && e.tipo_cambio === "CODE_REMOVED" && e.eje === "OFICIAL_V1.2→2.0");
    const findings = summarizeMh20ExportRegimes(removed.map((e) => ({ id: e.clave, regime_code: e.clave })));
    for (const e of removed) {
      expect(findings.find((f) => f.id === e.clave)?.candidate ?? null, e.clave).toBe(e.posible_equivalente_2_0 ?? null);
    }
  });

  it("null se ignora; formato 2.0 se reconoce", () => {
    expect(summarizeMh20ExportRegimes([{ id: "a", regime_code: null }])).toEqual([]);
    expect(summarizeMh20ExportRegimes([{ id: "b", regime_code: "1000.000" }])[0].status).toBe("CAT028_V20_FORMAT");
  });
});
