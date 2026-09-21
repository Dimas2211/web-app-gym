// ─────────────────────────────────────────────────────────────────
// commerce/dte — persist-contingency-event-json.service.runtime-write.test.ts
//
// FASE VI-E6C — buildAndPersistContingencyEventJson acepta un `db`
// explícito y usa db.* para TODO (DteContingencyEvent, DteIssuerConfig).
// Este test hace fallar CUALQUIER llamada al Prisma global para
// certificar que el paso de construcción/persistencia del JSON del
// evento también es runtime-safe. El builder puro
// (buildContingencyEventJson) se mockea — no depende de DB.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: buildAndPersistContingencyEventJson tocó el Prisma global.");
      },
    },
  ),
}));

const { buildContingencyEventJsonSpy } = vi.hoisted(() => ({
  buildContingencyEventJsonSpy: vi.fn(),
}));

vi.mock("./build-contingency-event-json.service", () => ({
  buildContingencyEventJson: buildContingencyEventJsonSpy,
}));

import { buildAndPersistContingencyEventJson } from "./persist-contingency-event-json.service";

const EVENT_DRAFT = {
  id: "evt-1",
  status: "DRAFT",
  generation_code: "EVT-GEN-1",
  contingency_type_code: "1",
  reason: "",
  period_start_date: new Date("2026-01-15T00:00:00Z"),
  period_start_time: "00:00:00",
  period_end_date: new Date("2026-01-15T00:00:00Z"),
  period_end_time: "23:59:59",
  items: [
    {
      no_item: 1,
      dte_document: { id: "dte-1", dte_type_code: "01", generation_code: "GEN-1", issuer_config_id: "cfg-1" },
    },
  ],
};

const ISSUER_CONFIG = {
  nit: "06141234567890",
  name: "Emisor Prueba",
  establishment_type_code: "02",
  cod_estable_mh: "0001",
  point_of_sale_code: "0001",
  cod_punto_venta_mh: "0001",
  phone: "22222222",
  email: "test@example.com",
  environment: "TEST",
};

const BASE_PARAMS = {
  contingencyEventId: "evt-1",
  tenantId: "tenant-1",
  locationId: "loc-1",
  responsable: { nombre: "Responsable Prueba", tipoDocumento: "13", numeroDocumento: "12345678-9" },
};

function buildFakeRuntimeDb() {
  return {
    __marker: "RUNTIME_CLIENT_DB",
    dteContingencyEvent: {
      findFirst: vi.fn().mockResolvedValue(EVENT_DRAFT),
      update: vi.fn().mockResolvedValue({}),
    },
    dteIssuerConfig: {
      findFirst: vi.fn().mockResolvedValue(ISSUER_CONFIG),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  buildContingencyEventJsonSpy.mockReturnValue({ ok: true, eventJson: { detalleDTE: [] } });
});

describe("buildAndPersistContingencyEventJson — FASE VI-E6C (runtime db injection)", () => {
  it("usa db.* (runtime) para evento + emisor + persistencia, nunca el Prisma global", async () => {
    const db = buildFakeRuntimeDb();

    const result = await buildAndPersistContingencyEventJson(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: true, status: "PENDING_SIGNATURE" });
    expect(db.dteContingencyEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "evt-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.dteIssuerConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cfg-1" } }),
    );
    expect(db.dteContingencyEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "evt-1" }, data: expect.objectContaining({ status: "PENDING_SIGNATURE" }) }),
    );
  });

  it("evento no encontrado (cross-tenant/location) -> bloquea, no construye ni persiste JSON", async () => {
    const db = buildFakeRuntimeDb();
    db.dteContingencyEvent.findFirst = vi.fn().mockResolvedValue(null);

    const result = await buildAndPersistContingencyEventJson(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(buildContingencyEventJsonSpy).not.toHaveBeenCalled();
    expect(db.dteContingencyEvent.update).not.toHaveBeenCalled();
  });

  it("evento en estado distinto a DRAFT -> bloquea", async () => {
    const db = buildFakeRuntimeDb();
    db.dteContingencyEvent.findFirst = vi.fn().mockResolvedValue({ ...EVENT_DRAFT, status: "SIGNED" });

    const result = await buildAndPersistContingencyEventJson(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(db.dteContingencyEvent.update).not.toHaveBeenCalled();
  });

  it("AJV falla en el builder -> NO persiste, mantiene DRAFT implícito", async () => {
    const db = buildFakeRuntimeDb();
    buildContingencyEventJsonSpy.mockReturnValue({ ok: false, error: "AJV validation failed" });

    const result = await buildAndPersistContingencyEventJson(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false, error: "AJV validation failed" });
    expect(db.dteContingencyEvent.update).not.toHaveBeenCalled();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado para callers PLATFORM_NATIVE no migrados)", async () => {
    const result = await buildAndPersistContingencyEventJson(BASE_PARAMS);
    expect(result).toMatchObject({ ok: false });
  });
});
