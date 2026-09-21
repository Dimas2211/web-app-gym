// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-nc-json.service.runtime-write.test.ts
//
// FASE VI-E4B — generateNcJsonForDte acepta un `db` explícito y usa
// db.* para TODO (NC 05, relación CREDIT_NOTE_OF, CCFE 03 original,
// DteIssuerConfig, persistencia final). Este test hace fallar
// CUALQUIER llamada al Prisma global para certificar
// RUNTIME_CLIENT_NC05_GENERATION_CAN_HIT_GLOBAL_PRISMA = NO.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: generateNcJsonForDte tocó el Prisma global.");
      },
    },
  ),
}));

vi.mock("../utils/dte-territory.resolver", () => ({
  validateDteAddressCodes: vi.fn(async () => ({ ok: true })),
}));

import { generateNcJsonForDte } from "./generate-nc-json.service";
import { validateDteAddressCodes } from "../utils/dte-territory.resolver";

const NC_DOC = {
  id: "nc-1",
  dte_type_code: "05",
  dte_status: "PENDING_GENERATION",
  generation_code: "GEN-NC-1",
  control_number: "DTE-05-C001P001-000000000000001",
  environment: "TEST",
  issuer_config_id: "cfg-1",
  json_document: null,
};

const ORIGINAL_CCFE = {
  id: "ccfe-1",
  dte_type_code: "03",
  dte_status: "ACCEPTED",
  generation_code: "GEN-CCFE-1",
  control_number: "DTE-03-C001P001-000000000000001",
  reception_stamp: "STAMP-1",
  json_document: {
    identificacion: { fecEmi: "2026-01-01" },
    emisor: {},
    receptor: {
      nit: "06141234567890",
      nrc: "123456",
      nombre: "Cliente SA",
      codActividad: "01111",
      descActividad: "Actividad",
      direccion: { departamento: "06", municipio: "20", complemento: "Calle 1" },
    },
    cuerpoDocumento: [
      { numItem: 1, tipoItem: 1, cantidad: 1, precioUni: 100, ventaGravada: 100, uniMedida: 59 },
    ],
  },
};

function buildFakeRuntimeDb() {
  const db = {
    __marker: "RUNTIME_CLIENT_DB",
    dteOutgoingDocument: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === "nc-1") return NC_DOC;
        if (where.id === "ccfe-1") return ORIGINAL_CCFE;
        return null;
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    dteDocumentRelation: {
      findFirst: vi.fn().mockResolvedValue({ related_dte_document_id: "ccfe-1" }),
    },
    dteIssuerConfig: {
      findFirst: vi.fn().mockResolvedValue({
        nit: "06141234567890",
        nrc: "123456",
        name: "Emisor SA",
        legal_name: "Emisor",
        activity_code: "01111",
        activity_name: "Actividad",
        establishment_type_code: "02",
        dept_code: "06",
        municipality_code: "20",
        address_complement: "Calle 2",
        phone: "22222222",
        email: "emisor@test.com",
        environment: "TEST",
      }),
    },
  };
  return db;
}

const BASE_PARAMS = {
  dteDocumentId: "nc-1",
  userId: "u1",
  tenantId: "tenant-1",
  locationId: "loc-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateNcJsonForDte — FASE VI-E4B (runtime db injection)", () => {
  it("usa db.* (runtime), nunca el Prisma global, y persiste GENERATED", async () => {
    const db = buildFakeRuntimeDb();

    const result = await generateNcJsonForDte(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: true, dteStatus: "GENERATED", dteDocumentId: "nc-1" });
    expect(db.dteOutgoingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "nc-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.dteOutgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "nc-1" },
        data: expect.objectContaining({ dte_status: "GENERATED" }),
      }),
    );
    expect(validateDteAddressCodes).toHaveBeenCalledWith(expect.objectContaining({ role: "emisor" }), db);
  });

  it("relación CREDIT_NOTE_OF apunta a un original en otro tenant/location -> findFirst filtra fail closed", async () => {
    const db = buildFakeRuntimeDb();
    db.dteOutgoingDocument.findFirst = vi.fn(async ({ where }: { where: { id: string } }) => {
      if (where.id === "nc-1") return NC_DOC;
      return null; // el CCFE original no aparece con ese tenant/location
    });

    const result = await generateNcJsonForDte(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(db.dteOutgoingDocument.update).not.toHaveBeenCalled();
  });

  it("NC ya tiene json_document -> rechaza (idempotencia preservada)", async () => {
    const db = buildFakeRuntimeDb();
    db.dteOutgoingDocument.findFirst = vi.fn(async ({ where }: { where: { id: string } }) => {
      if (where.id === "nc-1") return { ...NC_DOC, json_document: { already: true } };
      if (where.id === "ccfe-1") return ORIGINAL_CCFE;
      return null;
    });

    const result = await generateNcJsonForDte(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(db.dteOutgoingDocument.update).not.toHaveBeenCalled();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado para callers no migrados)", async () => {
    await expect(generateNcJsonForDte(BASE_PARAMS)).rejects.toThrow("RUNTIME_UNSAFE");
  });
});
