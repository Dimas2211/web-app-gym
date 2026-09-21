// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-invalidation-event.service.runtime-write.test.ts
//
// FASE VI-E6B — createInvalidationEvent acepta un `db` explícito y usa
// db.* para TODO (DteOutgoingDocument, DteIssuerConfig, DteInvalidationEvent
// existente/nuevo). Este test hace fallar CUALQUIER llamada al Prisma
// global para certificar
// RUNTIME_CLIENT_DTE_INVALIDATION_CREATE_CAN_HIT_GLOBAL_PRISMA = NO.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: createInvalidationEvent tocó el Prisma global.");
      },
    },
  ),
}));

const { buildInvalidationEventJsonSpy } = vi.hoisted(() => ({
  buildInvalidationEventJsonSpy: vi.fn(),
}));

vi.mock("./build-invalidation-event-json.service", () => ({
  buildInvalidationEventJson: buildInvalidationEventJsonSpy,
}));

import { createInvalidationEvent } from "./create-invalidation-event.service";

const DTE_DOC = {
  id: "dte-1",
  tenant_id: "tenant-1",
  location_id: "loc-1",
  dte_type_code: "01",
  dte_status: "ACCEPTED",
  generation_code: "GEN-1",
  control_number: "DTE-01-0001-0000000001",
  reception_stamp: "S".repeat(40),
  json_document: { identificacion: { fecEmi: "2026-01-01" } },
  issuer_config_id: "cfg-1",
  environment: "TEST",
};

const ISSUER_CONFIG_TEST = {
  id: "cfg-1",
  nit: "06141234567890",
  name: "Emisor Test",
  legal_name: "Emisor Test S.A. de C.V.",
  establishment_type_code: "01",
  establishment_code: null,
  cod_estable_mh: null,
  point_of_sale_code: null,
  cod_punto_venta_mh: null,
  phone: "22223333",
  email: "emisor@test.com",
  environment: "TEST",
};

const ISSUER_CONFIG_PROD = { ...ISSUER_CONFIG_TEST, environment: "PRODUCTION" };

const RESPONSABLE = { nombre: "Juan Perez", tipoDocumento: "13", numeroDocumento: "12345678-9" };

const BASE_PARAMS = {
  dteDocumentId: "dte-1",
  invalidationTypeCode: "2" as const,
  reason: "Error de digitación",
  responsable: RESPONSABLE,
  solicita: RESPONSABLE,
  userId: "u1",
  tenantId: "tenant-1",
  locationId: "loc-1",
};

function buildFakeRuntimeDb(issuerConfig: unknown = ISSUER_CONFIG_TEST) {
  return {
    __marker: "RUNTIME_CLIENT_DB",
    dteOutgoingDocument: {
      findFirst: vi.fn().mockResolvedValue(DTE_DOC),
    },
    dteIssuerConfig: {
      findFirst: vi.fn().mockResolvedValue(issuerConfig),
    },
    dteInvalidationEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "inv-1" }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  buildInvalidationEventJsonSpy.mockReturnValue({ ok: true, eventJson: { foo: "bar" } });
});

describe("createInvalidationEvent — FASE VI-E6B (runtime db injection)", () => {
  it("usa db.* (runtime) para documento + emisor + evento existente + evento nuevo, nunca el Prisma global", async () => {
    const db = buildFakeRuntimeDb();

    const result = await createInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: true, status: "DRAFT" });
    expect(db.dteOutgoingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dte-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.dteIssuerConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cfg-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.dteInvalidationEvent.findFirst).toHaveBeenCalledTimes(1);
    expect(db.dteInvalidationEvent.create).toHaveBeenCalledTimes(1);
  });

  it("documento no encontrado en la runtime db (cross-tenant/location) -> bloquea, no crea evento", async () => {
    const db = buildFakeRuntimeDb();
    db.dteOutgoingDocument.findFirst = vi.fn().mockResolvedValue(null);

    const result = await createInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(db.dteInvalidationEvent.create).not.toHaveBeenCalled();
  });

  it("documento no ACCEPTED -> bloquea, no crea evento", async () => {
    const db = buildFakeRuntimeDb();
    db.dteOutgoingDocument.findFirst = vi.fn().mockResolvedValue({ ...DTE_DOC, dte_status: "SIGNED" });

    const result = await createInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(db.dteInvalidationEvent.create).not.toHaveBeenCalled();
  });

  it("ya existe un evento activo -> bloquea, no crea uno nuevo (idempotencia/duplicado)", async () => {
    const db = buildFakeRuntimeDb();
    db.dteInvalidationEvent.findFirst = vi.fn().mockResolvedValue({ id: "inv-existing", status: "SIGNED" });

    const result = await createInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(db.dteInvalidationEvent.create).not.toHaveBeenCalled();
  });

  it("emisor no encontrado en la misma runtime DB -> bloquea", async () => {
    const db = buildFakeRuntimeDb();
    db.dteIssuerConfig.findFirst = vi.fn().mockResolvedValue(null);

    const result = await createInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(db.dteInvalidationEvent.create).not.toHaveBeenCalled();
  });

  it("ambiente del emisor (PRODUCTION) no coincide con ambiente del documento (TEST) -> bloquea antes de crear", async () => {
    const db = buildFakeRuntimeDb(ISSUER_CONFIG_PROD);

    const result = await createInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(db.dteInvalidationEvent.create).not.toHaveBeenCalled();
    expect(buildInvalidationEventJsonSpy).not.toHaveBeenCalled();
  });

  it("tipo de DTE no invalidable (ej. 04) -> bloquea, no crea evento", async () => {
    const db = buildFakeRuntimeDb();
    db.dteOutgoingDocument.findFirst = vi.fn().mockResolvedValue({ ...DTE_DOC, dte_type_code: "04" });

    const result = await createInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(db.dteInvalidationEvent.create).not.toHaveBeenCalled();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado para callers PLATFORM_NATIVE no migrados)", async () => {
    // No debe lanzar sincrónicamente — el proxy lanza al primer acceso a una propiedad.
    const result = await createInvalidationEvent(BASE_PARAMS);
    expect(result).toMatchObject({ ok: false });
  });
});
