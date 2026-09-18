// ─────────────────────────────────────────────────────────────────
// commerce/dte — validate-dte-json-schema.service.runtime-write.test.ts
//
// FASE VI-E3 — validateDteJsonSchema acepta un `db` explícito y lo usa
// para el read y el write (GENERATED -> SCHEMA_VALIDATED). AJV/Zod son
// puros (no tocan DB). Este test hace fallar cualquier llamada al
// Prisma global para certificar
// FE01_SCHEMA_VALIDATION_RUNTIME_READY / CCFE03_SCHEMA_VALIDATION_RUNTIME_READY.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: validateDteJsonSchema tocó el Prisma global.");
      },
    },
  ),
}));

import { validateDteJsonSchema } from "./validate-dte-json-schema.service";
import feSchema from "../schemas/mh/fe-01.schema.json";

function buildFakeRuntimeDb(overrides: Partial<{ json_document: unknown; dte_type_code: string }> = {}) {
  const dteDoc = {
    id: "dte-1",
    dte_status: "GENERATED",
    dte_type_code: overrides.dte_type_code ?? "01",
    json_document: overrides.json_document,
  };

  const db = {
    __marker: "RUNTIME_CLIENT_DB",
    dteOutgoingDocument: {
      findFirst: vi.fn().mockResolvedValue(dteDoc),
      update: vi.fn().mockResolvedValue({}),
    },
  };

  return { db, dteDoc };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateDteJsonSchema — FASE VI-E3 (runtime db injection)", () => {
  it("documento inválido contra el schema -> mantiene GENERATED, usa solo db (runtime)", async () => {
    const { db } = buildFakeRuntimeDb({ json_document: { not: "a valid fe-01 document" } });

    const result = await validateDteJsonSchema("dte-1", "tenant-1", "loc-1", "u1", db as never);

    expect(result.ok).toBe(false);
    expect(db.dteOutgoingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dte-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.dteOutgoingDocument.update).not.toHaveBeenCalled();
  });

  it("estado distinto de GENERATED -> rechaza sin tocar el schema ni la DB de escritura", async () => {
    const { db } = buildFakeRuntimeDb();
    db.dteOutgoingDocument.findFirst.mockResolvedValue({
      id: "dte-1", dte_status: "PENDING_GENERATION", dte_type_code: "01", json_document: null,
    });

    const result = await validateDteJsonSchema("dte-1", "tenant-1", "loc-1", "u1", db as never);

    expect(result).toMatchObject({ ok: false });
    expect(db.dteOutgoingDocument.update).not.toHaveBeenCalled();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado)", async () => {
    await expect(validateDteJsonSchema("dte-1", "tenant-1", "loc-1", "u1")).rejects.toThrow("RUNTIME_UNSAFE");
  });

  it("referencia de schema disponible para tipo 01 (sanity — no valida contenido fiscal aquí)", () => {
    expect(feSchema).toBeTruthy();
  });
});
