// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fex-json-pipeline.service.v3.test.ts
//
// FEX-PROD-0B — pipeline local FEX 11 v3 con DB in-memory:
//   DteOutgoingDocument 11 TEST (PENDING_GENERATION)
//   → generateFexJsonForSale (builder v3 real + resolver territorial real)
//   → persist json_document (GENERATED)
//   → validateDteJsonSchema real (AJV contra fex-11-v3.schema.json)
//   → SCHEMA_VALIDATED
// Sin firma, sin MH, sin MariaDB. El Prisma global lanza si se toca.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, {
    get() {
      throw new Error("RUNTIME_UNSAFE: el pipeline FEX tocó el Prisma global.");
    },
  }),
}));

import { generateAndPersistFexJsonForDte } from "./generate-fex-json-pipeline.service";
import { makeFexV3LoadedData, validateAgainstFexV3 } from "./fex11-v3.test-fixture";

type DocState = Record<string, unknown>;

function buildInMemoryDb(overrides?: { countryCode?: string; environment?: "TEST" | "PRODUCTION" }) {
  const loaded = makeFexV3LoadedData();
  if (overrides?.countryCode) loaded.sale.customer!.country_code = overrides.countryCode;

  const doc: DocState = {
    id:               "dte-11-1",
    tenant_id:        "tenant-1",
    location_id:      "loc-1",
    dte_type_code:    "11",
    environment:      overrides?.environment ?? "TEST",
    sale_id:          "sale-1",
    issuer_config_id: "cfg-1",
    signed_jws:       null,
    dte_status:       "PENDING_GENERATION",
    control_number:   loaded.dteDoc.control_number,
    generation_code:  loaded.dteDoc.generation_code,
    json_document:    null,
    schema_validated_at: null,
  };

  const scoped = (where: { id?: string; tenant_id?: string; location_id?: string }) =>
    where.id === doc.id && where.tenant_id === doc.tenant_id && where.location_id === doc.location_id;

  const db = {
    dteOutgoingDocument: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenant_id: string; location_id: string } }) =>
        scoped(where) ? { ...doc } : null),
      update: vi.fn(async ({ data }: { data: DocState }) => {
        // Prisma Json: persistir una copia (no la referencia del builder).
        Object.assign(doc, data, data.json_document ? { json_document: JSON.parse(JSON.stringify(data.json_document)) } : {});
        return { ...doc };
      }),
    },
    sale: {
      findFirst: vi.fn(async ({ where }: { where: { tenant_id: string; location_id: string } }) =>
        where.tenant_id === "tenant-1" && where.location_id === "loc-1"
          ? { id: "sale-1", location_id: "loc-1", ...loaded.sale }
          : null),
    },
    dteIssuerConfig: {
      findFirst: vi.fn(async () => ({ ...loaded.issuerConfig, environment: overrides?.environment ?? "TEST" })),
    },
    municipality: {
      findFirst: vi.fn(async ({ where }: { where: { dept_code: string; code: string } }) =>
        where.dept_code === "05" && where.code === "11"
          ? {
              dept_code: "05", code: "11", district_code: "050611",
              district_name: "Santa Tecla antes: Nueva San Salvador",
              new_municipality_code: "0506", new_municipality_name: "La Libertad Sur",
            }
          : null),
    },
    country: {
      findFirst: vi.fn(async ({ where }: { where: { code: string } }) =>
        where.code === "US" ? { code: "US", name: "Estados Unidos" } : null),
    },
  };

  return { db, doc };
}

const PARAMS = { tenant_id: "tenant-1", location_id: "loc-1", dte_document_id: "dte-11-1", user_id: "user-1" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pipeline FEX 11 v3 local (in-memory, sin MH)", () => {
  it("PENDING_GENERATION → GENERATED → AJV v3 PASS → SCHEMA_VALIDATED", async () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    const { db, doc } = buildInMemoryDb();

    const result = await generateAndPersistFexJsonForDte(PARAMS, db as never);

    expect(result.validation_errors ?? []).toEqual([]);
    expect(result).toMatchObject({ ok: true, dte_status: "SCHEMA_VALIDATED" });
    expect(doc.dte_status).toBe("SCHEMA_VALIDATED");
    expect(doc.schema_validated_at).toBeInstanceOf(Date);

    const persisted = doc.json_document as { identificacion: { version: number; ambiente: string }; emisor: { direccion: { departamento: string; municipio: string; distrito: string } } };
    expect(persisted.identificacion.version).toBe(3);
    expect(persisted.identificacion.ambiente).toBe("00");
    expect(persisted.emisor.direccion).toMatchObject({ departamento: "05", municipio: "06", distrito: "11" });
    expect(validateAgainstFexV3(persisted).ok).toBe(true);
  });

  it("cliente con país legado FEX v1 → no persiste JSON, queda PENDING_GENERATION", async () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    const { db, doc } = buildInMemoryDb({ countryCode: "9540" });

    const result = await generateAndPersistFexJsonForDte(PARAMS, db as never);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("CAT-020");
    expect(db.dteOutgoingDocument.update).not.toHaveBeenCalled();
    expect(doc.dte_status).toBe("PENDING_GENERATION");
  });

  it("sin flag FEX 11 TEST → bloqueado antes del builder", async () => {
    const { db } = buildInMemoryDb();

    const result = await generateAndPersistFexJsonForDte(PARAMS, db as never);

    expect(result.ok).toBe(false);
    expect(db.sale.findFirst).not.toHaveBeenCalled();
  });

  it("otro tenant → documento no encontrado, sin lecturas de venta", async () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    const { db } = buildInMemoryDb();

    const result = await generateAndPersistFexJsonForDte({ ...PARAMS, tenant_id: "tenant-otro" }, db as never);

    expect(result.ok).toBe(false);
    expect(db.sale.findFirst).not.toHaveBeenCalled();
  });
});

// FEX-PROD-1 — mismo pipeline en PRODUCTION, gobernado solo por el flag PROD.
describe("pipeline FEX 11 v3 — PRODUCTION (FEX-PROD-1)", () => {
  function clearFexFlags() {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "");
    vi.stubEnv("DTE_FEX11_ENABLED", "");
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "");
  }

  it("documento PROD + flag PROD → SCHEMA_VALIDATED con ambiente 01 y AJV v3 PASS", async () => {
    clearFexFlags();
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    const { db, doc } = buildInMemoryDb({ environment: "PRODUCTION" });

    const result = await generateAndPersistFexJsonForDte(PARAMS, db as never);

    expect(result).toMatchObject({ ok: true, dte_status: "SCHEMA_VALIDATED" });
    const persisted = doc.json_document as { identificacion: { version: number; ambiente: string } };
    expect(persisted.identificacion.ambiente).toBe("01");
    expect(persisted.identificacion.version).toBe(3);
    expect(validateAgainstFexV3(persisted).ok).toBe(true);
  });

  it("documento PROD con solo flags TEST/comercial → bloqueado antes del builder", async () => {
    clearFexFlags();
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    const { db } = buildInMemoryDb({ environment: "PRODUCTION" });

    const result = await generateAndPersistFexJsonForDte(PARAMS, db as never);

    expect(result.ok).toBe(false);
    expect(db.sale.findFirst).not.toHaveBeenCalled();
    expect(db.dteOutgoingDocument.update).not.toHaveBeenCalled();
  });
});
