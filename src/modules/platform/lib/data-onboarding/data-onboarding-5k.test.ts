// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — data-onboarding-5k.test.ts
//
// ONBOARDING-5K. Pruebas sintéticas (sin base de datos) del contrato de
// capacidad: el parser conserva TODAS las filas hasta 5,000 y rechaza
// 5,001 entero; la vista para el navegador es solo una muestra; la
// escritura por lotes nunca informa éxito parcial. La certificación
// contra PostgreSQL real vive en data-onboarding-5k.integration.test.ts.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { parseDataOnboardingWorkbook, DataOnboardingRowLimitError } from "./excel-preview-parser";
import { toPreviewResultView, toDbAwareResultView, toRunnerResultView, sampleRowsByPriority } from "./data-onboarding-view";
import {
  DATA_ONBOARDING_MAX_IMPORT_ROWS,
  DATA_ONBOARDING_MAX_FILE_BYTES,
  DATA_ONBOARDING_VIEW_ROWS_LIMIT,
} from "./data-onboarding-limits";
import { chunkRows, createManyInBatches } from "./import-runners/batch-write";
import { analysisCoverageError } from "./data-onboarding-coverage";
import {
  ONBOARDING_DATASETS,
  buildWorkbookBuffer,
  fixtureRow,
} from "./testing/onboarding-5k-fixtures";
import type { DataOnboardingDbAwarePreviewResult } from "../../types/platform.types";

const BOUNDARY_SIZES = [199, 200, 201, 500, 999, 1000, 1001, 2000, 2500, 5000];

describe("parser — todas las filas hasta 5,000, por dataset", () => {
  for (const dataset of ONBOARDING_DATASETS) {
    it(`${dataset}: cantidades exactas en ${BOUNDARY_SIZES.join(", ")}`, () => {
      for (const n of BOUNDARY_SIZES) {
        const r = parseDataOnboardingWorkbook({ datasetKey: dataset, fileBuffer: buildWorkbookBuffer(dataset, n) });
        expect(r.summary.totalRows, `${dataset} n=${n}`).toBe(n);
        expect(r.rows.length, `${dataset} n=${n}`).toBe(n);
        expect(r.sample).toBeUndefined();
        expect(r.summary.invalidRows, `${dataset} n=${n} sin errores`).toBe(0);
        expect(r.rows[0].rowNumber).toBe(2);
        expect(r.rows[n - 1].rowNumber).toBe(n + 1);
      }
    }, 120_000);

    it(`${dataset}: 5,001 registros → rechazo explícito (sin subconjunto)`, () => {
      const buf = buildWorkbookBuffer(dataset, DATA_ONBOARDING_MAX_IMPORT_ROWS + 1);
      expect(() => parseDataOnboardingWorkbook({ datasetKey: dataset, fileBuffer: buf })).toThrow(DataOnboardingRowLimitError);
      expect(() => parseDataOnboardingWorkbook({ datasetKey: dataset, fileBuffer: buf })).toThrow(/5,001.*5,000/);
    }, 60_000);
  }

  it("filas vacías intercaladas no cuentan: 5,000 registros + vacías → aceptado", () => {
    const r = parseDataOnboardingWorkbook({
      datasetKey: "customers",
      fileBuffer: buildWorkbookBuffer("customers", 5000, { emptyEvery: 50 }),
    });
    expect(r.summary.totalRows).toBe(5000);
    // 100 vacías generadas; la última queda después del último dato (fuera del rango con valores).
    expect(r.summary.emptyRowsIgnored).toBe(99);
  });

  it("rango declarado de 1,000,000 filas (formato en filas vacías) → solo las filas con valor", () => {
    const buf = buildWorkbookBuffer("products", 300, { phantomRows: 1_000_000 });
    const started = Date.now();
    const r = parseDataOnboardingWorkbook({ datasetKey: "products", fileBuffer: buf });
    expect(r.summary.totalRows).toBe(300);
    expect(r.summary.emptyRowsIgnored).toBe(0);
    expect(Date.now() - started).toBeLessThan(2_000);
  }, 120_000);
});

describe("duplicados en todo el archivo (incluidos lotes distintos)", () => {
  it("products: product_code repetido al principio y al final del archivo → ERROR en la última", () => {
    const n = 5000;
    const r = parseDataOnboardingWorkbook({
      datasetKey: "products",
      fileBuffer: buildWorkbookBuffer("products", n, { overrides: { [n]: fixtureRow("products", 1) } }),
    });
    expect(r.summary.totalRows).toBe(n);
    expect(r.rows[0].status).toBe("VALID");
    expect(r.rows[n - 1].errors.map((e) => e.code)).toContain("DUPLICATE_IN_FILE");
    expect(r.summary.invalidRows).toBe(1);
  });

  it("gym_clients: document_id repetido en filas 10 y 4,900 (lotes de escritura distintos) → ERROR", () => {
    const dup = fixtureRow("gym_clients", 4900);
    dup[4] = fixtureRow("gym_clients", 10)[4];
    const r = parseDataOnboardingWorkbook({
      datasetKey: "gym_clients",
      fileBuffer: buildWorkbookBuffer("gym_clients", 5000, { overrides: { 4900: dup } }),
    });
    const row = r.rows.find((x) => x.rowNumber === 4901)!;
    expect(row.errors.some((e) => e.code === "DUPLICATE_IN_FILE" && e.message.includes("fila 11"))).toBe(true);
  });

  it("inventory_initial: product_code+location repetidos en filas 1 y 5,000 → ERROR", () => {
    const r = parseDataOnboardingWorkbook({
      datasetKey: "inventory_initial",
      fileBuffer: buildWorkbookBuffer("inventory_initial", 5000, { overrides: { 5000: fixtureRow("inventory_initial", 1) } }),
    });
    expect(r.rows[4999].errors.map((e) => e.code)).toContain("DUPLICATE_IN_FILE");
  });

  it("gym_trainers: email repetido entre filas 2 y 3,000 → ERROR", () => {
    const dup = fixtureRow("gym_trainers", 3000);
    dup[3] = fixtureRow("gym_trainers", 2)[3];
    const r = parseDataOnboardingWorkbook({
      datasetKey: "gym_trainers",
      fileBuffer: buildWorkbookBuffer("gym_trainers", 3000, { overrides: { 3000: dup } }),
    });
    expect(r.rows[2999].errors.some((e) => e.field === "email")).toBe(true);
  });
});

describe("vista para el navegador — muestra acotada, totales completos", () => {
  it("5,000 filas → 200 en la vista, con la fila con error del final incluida", () => {
    const n = 5000;
    const full = parseDataOnboardingWorkbook({
      datasetKey: "products",
      fileBuffer: buildWorkbookBuffer("products", n, { overrides: { [n]: fixtureRow("products", 1) } }),
    });
    const view = toPreviewResultView(full);
    expect(view.rows.length).toBe(DATA_ONBOARDING_VIEW_ROWS_LIMIT);
    expect(view.sample).toEqual({ shownRows: DATA_ONBOARDING_VIEW_ROWS_LIMIT, totalRows: n });
    expect(view.summary).toEqual(full.summary);
    expect(view.rows.some((r) => r.rowNumber === n + 1 && r.status === "ERROR")).toBe(true);
    // El resultado completo no se modifica (el servidor sigue teniendo todas las filas).
    expect(full.rows.length).toBe(n);
    expect(full.sample).toBeUndefined();
  });

  it("≤ 200 filas → sin muestra", () => {
    const full = parseDataOnboardingWorkbook({ datasetKey: "categories", fileBuffer: buildWorkbookBuffer("categories", 200) });
    expect(toPreviewResultView(full)).toBe(full);
  });

  it("DB-aware: prioriza ERROR y conserva summary", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      rowNumber: i + 2, resolution: i === 999 ? "ERROR" : "CREATE", naturalKey: String(i), existsInDb: false,
      errors: [], warnings: [], dependencyChecks: [],
    })) as DataOnboardingDbAwarePreviewResult["rows"];
    const full: DataOnboardingDbAwarePreviewResult = {
      datasetKey: "products", importPolicy: "CREATE_ONLY", status: "BLOCKED",
      summary: { analyzedRows: 1000, createRows: 999, updateRows: 0, skipRows: 0, errorRows: 1, missingDependencies: 0, duplicatesInDatabase: 0 },
      rows,
    };
    const view = toDbAwareResultView(full);
    expect(view.rows.length).toBe(200);
    expect(view.rows.at(-1)!.rowNumber).toBe(1001);
    expect(view.summary.analyzedRows).toBe(1000);
  });

  it("resultado de runner: rows acotado, conteos intactos", () => {
    const result = { created: 5000, totalRows: 5000, rows: Array.from({ length: 5000 }, (_, i) => ({ rowNumber: i + 2, resolution: "CREATED" })) };
    const view = toRunnerResultView(result);
    expect(view.rows.length).toBe(200);
    expect(view.created).toBe(5000);
    expect(view.totalRows).toBe(5000);
  });

  it("sampleRowsByPriority devuelve filas ordenadas por número", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ rowNumber: i, p: i % 3 }));
    const s = sampleRowsByPriority(rows, (r) => r.p, 4);
    expect(s.map((r) => r.rowNumber)).toEqual([0, 3, 6, 9]);
  });
});

describe("cobertura del análisis — nunca un subconjunto", () => {
  const parsed = parseDataOnboardingWorkbook({ datasetKey: "categories", fileBuffer: buildWorkbookBuffer("categories", 1001) });
  const analysis = (count: number): DataOnboardingDbAwarePreviewResult => ({
    datasetKey: "categories", importPolicy: "CREATE_ONLY", status: "READY",
    summary: { analyzedRows: count, createRows: count, updateRows: 0, skipRows: 0, errorRows: 0, missingDependencies: 0, duplicatesInDatabase: 0 },
    rows: parsed.rows.slice(0, count).map((r) => ({
      rowNumber: r.rowNumber, resolution: "CREATE" as const, naturalKey: "", existsInDb: false, errors: [], warnings: [], dependencyChecks: [],
    })),
  });

  it("análisis completo → null", () => {
    expect(analysisCoverageError(parsed, analysis(1001))).toBeNull();
  });
  it("análisis de 1,000 de 1,001 → rechazo", () => {
    expect(analysisCoverageError(parsed, analysis(1000))).toContain("1000 de 1001");
  });
  it("parseo que es una muestra de vista → rechazo", () => {
    expect(analysisCoverageError(toPreviewResultView(parsed), analysis(1001))).not.toBeNull();
  });
});

describe("escritura por lotes", () => {
  it("chunkRows: 5,000 → 10 lotes de 500; 1,001 → 500/500/1", () => {
    expect(chunkRows(Array.from({ length: 5000 })).map((b) => b.length)).toEqual(Array(10).fill(500));
    expect(chunkRows(Array.from({ length: 1001 })).map((b) => b.length)).toEqual([500, 500, 1]);
  });

  it("createManyInBatches: conteo correcto → total exacto", async () => {
    const sizes: number[] = [];
    const total = await createManyInBatches(Array.from({ length: 2500 }, (_, i) => i), async (b) => {
      sizes.push(b.length);
      return { count: b.length };
    }, "x");
    expect(total).toBe(2500);
    expect(sizes).toEqual([500, 500, 500, 500, 500]);
  });

  it("createManyInBatches: un lote insertó menos filas → lanza (rollback), nunca éxito parcial", async () => {
    let call = 0;
    await expect(createManyInBatches(Array.from({ length: 2000 }), async (b) => {
      call += 1;
      return { count: call === 3 ? b.length - 1 : b.length };
    }, "productos")).rejects.toThrow(/499 de 500/);
  });
});

describe("tamaño de archivo — 5,000 registros caben en el límite de transporte", () => {
  for (const dataset of ONBOARDING_DATASETS) {
    it(`${dataset}: 5,000 filas (todas las columnas) < ${DATA_ONBOARDING_MAX_FILE_BYTES / 1024 / 1024} MB`, () => {
      const size = buildWorkbookBuffer(dataset, 5000).length;
      expect(size).toBeLessThan(DATA_ONBOARDING_MAX_FILE_BYTES);
    });
  }
});
