// ─────────────────────────────────────────────────────────────────
// commerce/sales/export/actions — export-writes.runtime.test.ts
//
// FEX11-RUNTIME-WRITES-FINAL-CLOSURE — una identidad RUNTIME_CLIENT
// tenant-wide (location_id null) no podía escribir en
// /dashboard/sales/export porque todas las writes exigían
// context.locationId. Ahora cada write respeta el alcance real de su
// entidad:
//   - Customer / UnitOfMeasure (tenant-level) → sin location;
//   - Sale (location-level) → location del contexto o location activa
//     runtime validada contra la DB runtime; si no hay → fail closed.
// Los services de cliente/unidad corren reales contra una DB runtime
// falsa; Prisma global es una trampa que no debe tocarse nunca.
// createExportSale se mockea: no se crean ventas ni DTE.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { sessionUser, globalPrisma, OperationalContextErrorMock } = vi.hoisted(() => {
  class OperationalContextErrorMock extends Error {
    constructor(public code: string, public userMessage: string, public httpStatus: number) {
      super(userMessage);
    }
  }
  const trap = () => {
    throw new Error("Prisma global no debe usarse desde RUNTIME_CLIENT");
  };
  return {
    sessionUser: { id: "user-1", tenant_id: "tenant-RT", location_id: null, auth_scope: "RUNTIME_CLIENT" },
    globalPrisma: new Proxy({}, { get: trap }),
    OperationalContextErrorMock,
  };
});

vi.mock("@/lib/permissions/guards", () => ({ requireAdmin: vi.fn(async () => sessionUser) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: globalPrisma }));

const requireOperationalContextMock = vi.fn();
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: (...args: unknown[]) => requireOperationalContextMock(...args),
  OperationalContextError: OperationalContextErrorMock,
}));

const getEffectiveLocationIdMock = vi.fn();
vi.mock("@/lib/location/active-location", () => ({
  getEffectiveLocationId: (...args: unknown[]) => getEffectiveLocationIdMock(...args),
}));

vi.mock("../../../dte/queries/list-dte-catalog-items", () => ({
  listDteCatalogItems: vi.fn(async ({ catalog_code }: { catalog_code: string }) =>
    catalog_code.includes("029")
      ? [{ item_code: "1" }, { item_code: "2" }]
      : [{ item_code: "36" }, { item_code: "13" }, { item_code: "02" }, { item_code: "03" }, { item_code: "37" }],
  ),
}));

const createExportSaleMock = vi.fn();
vi.mock("../services/export-sale.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/export-sale.service")>();
  return { ...actual, createExportSale: (...args: unknown[]) => createExportSaleMock(...args) };
});

import {
  createForeignCustomerAction,
  updateForeignCustomerCountryAction,
  configureExportUnitMhCodeAction,
  createExportSaleAction,
} from "./export-sale.actions";

// ── DB runtime falsa ──────────────────────────────────────────────

function makeRuntimeDb() {
  return {
    country: {
      findFirst: vi.fn(async ({ where }: { where: { code: string } }) =>
        ["US", "GT"].includes(where.code) ? { code: where.code, name: where.code === "US" ? "Estados Unidos" : "Guatemala" } : null,
      ),
    },
    customer: {
      create: vi.fn(async () => ({ id: "cust-new", customer_code: "EXP-1" })),
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenant_id: string } }) =>
        where.id === "cust-legacy" && where.tenant_id === "tenant-RT" ? { id: "cust-legacy", is_foreign: true } : null,
      ),
      update: vi.fn(async () => ({})),
    },
    unitOfMeasure: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "unit-1" ? { id: "unit-1" } : null)),
      update: vi.fn(async () => ({ mh_unit_code: "59" })),
    },
  };
}

let runtimeDb: ReturnType<typeof makeRuntimeDb>;

function runtimeHandle(overrides: Record<string, unknown> = {}) {
  const dispose = vi.fn();
  return {
    dispose,
    value: {
      context: {
        runtimeMode: "RUNTIME_CLIENT",
        tenantId: "tenant-RT",
        locationId: null,
        client: runtimeDb,
        effectiveUser: { id: "user-1" },
        commercialContext: {
          effectiveModules: new Map([["fiscal.dte", { code: "fiscal.dte", enabled: true }]]),
        },
        ...overrides,
      },
      dispose,
    },
  };
}

function rejectReadOnly() {
  requireOperationalContextMock.mockImplementation(async (_u: unknown, opts: { write?: boolean }) => {
    if (opts.write) throw new OperationalContextErrorMock("READ_ONLY", "Sesión de soporte en solo lectura.", 403);
    return runtimeHandle().value;
  });
}

const foreignCustomerInput = {
  name: "PRUEBA FEX 2",
  id_type_code: "03",
  document_number: "P1234567",
  country_code: "US",
  country_name: "Estados Unidos",
  customer_person_type: "2",
  activity_name: "Comercio internacional",
  address_complement: "Main St 100, Miami",
} as const;

const saleInput = {
  sale_date: "2026-10-02",
  customer_id: "11111111-1111-4111-8111-111111111111",
  items: [{ product_id: "22222222-2222-4222-8222-222222222222", quantity: 1, unit_price: 10 }],
  item_type_export: 2,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  runtimeDb = makeRuntimeDb();
});

// ── Tenant-level writes ───────────────────────────────────────────

describe("createForeignCustomerAction — tenant-level, sin location", () => {
  it("RUNTIME_CLIENT tenant-wide crea en la DB runtime con el tenant efectivo", async () => {
    const h = runtimeHandle();
    requireOperationalContextMock.mockResolvedValue(h.value);

    const res = await createForeignCustomerAction(foreignCustomerInput as never);

    expect(res).toEqual({ ok: true, id: "cust-new", customer_code: "EXP-1" });
    expect(requireOperationalContextMock).toHaveBeenCalledWith(sessionUser, { module: "commerce.sales", write: true });
    expect(getEffectiveLocationIdMock).not.toHaveBeenCalled();
    const data = (runtimeDb.customer.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data).toMatchObject({ tenant_id: "tenant-RT", created_by: "user-1", country_code: "US", is_foreign: true });
    expect(h.dispose).toHaveBeenCalledTimes(1);
  });

  it("Support Session read-only → bloquea sin escribir", async () => {
    rejectReadOnly();

    const res = await createForeignCustomerAction(foreignCustomerInput as never);

    expect(res).toEqual({ ok: false, error: "Sesión de soporte en solo lectura." });
    expect(runtimeDb.customer.create).not.toHaveBeenCalled();
  });
});

describe("updateForeignCustomerCountryAction — tenant-level, sin location", () => {
  it("corrige el país en la DB runtime aunque context.locationId sea null", async () => {
    requireOperationalContextMock.mockResolvedValue(runtimeHandle().value);

    const res = await updateForeignCustomerCountryAction("cust-legacy", "GT");

    expect(res).toEqual({ ok: true, country_code: "GT", country_name: "Guatemala" });
    expect(runtimeDb.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cust-legacy", tenant_id: "tenant-RT", status: "active" } }),
    );
    expect(runtimeDb.customer.update).toHaveBeenCalledWith({
      where: { id: "cust-legacy" },
      data: { country_code: "GT", country_name: "Guatemala", updated_by: "user-1" },
    });
    expect(getEffectiveLocationIdMock).not.toHaveBeenCalled();
  });

  it("no toca clientes de otro tenant", async () => {
    requireOperationalContextMock.mockResolvedValue(runtimeHandle().value);

    const res = await updateForeignCustomerCountryAction("cust-other-tenant", "GT");

    expect(res).toEqual({ ok: false, error: "El cliente no existe o está inactivo en este tenant." });
    expect(runtimeDb.customer.update).not.toHaveBeenCalled();
  });

  it("Support Session read-only → bloquea", async () => {
    rejectReadOnly();

    const res = await updateForeignCustomerCountryAction("cust-legacy", "GT");

    expect(res.ok).toBe(false);
    expect(runtimeDb.customer.update).not.toHaveBeenCalled();
  });
});

describe("configureExportUnitMhCodeAction — sin location", () => {
  it("asigna CAT-014 en la DB runtime aunque context.locationId sea null", async () => {
    requireOperationalContextMock.mockResolvedValue(runtimeHandle().value);

    const res = await configureExportUnitMhCodeAction("unit-1", "59");

    expect(res).toEqual({ ok: true, unit_id: "unit-1", mh_unit_code: "59" });
    expect(runtimeDb.unitOfMeasure.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "unit-1" }, data: { mh_unit_code: "59" } }),
    );
    expect(getEffectiveLocationIdMock).not.toHaveBeenCalled();
  });

  it("la validación CAT-014 se mantiene: código inexistente no escribe", async () => {
    requireOperationalContextMock.mockResolvedValue(runtimeHandle().value);

    const res = await configureExportUnitMhCodeAction("unit-1", "9999");

    expect(res.ok).toBe(false);
    expect(runtimeDb.unitOfMeasure.update).not.toHaveBeenCalled();
  });

  it("Support Session read-only → bloquea", async () => {
    rejectReadOnly();

    const res = await configureExportUnitMhCodeAction("unit-1", "59");

    expect(res.ok).toBe(false);
    expect(runtimeDb.unitOfMeasure.update).not.toHaveBeenCalled();
  });
});

// ── Location-level write ──────────────────────────────────────────

describe("createExportSaleAction — location-level", () => {
  const NO_LOCATION = "Selecciona una location activa para crear la venta de exportación.";

  it("RUNTIME_CLIENT tenant-wide resuelve la location activa contra la DB runtime y la pasa a createExportSale", async () => {
    const h = runtimeHandle();
    requireOperationalContextMock.mockResolvedValue(h.value);
    getEffectiveLocationIdMock.mockResolvedValue("loc-selected");
    createExportSaleMock.mockResolvedValue({ ok: true, sale_id: "s1" });

    const res = await createExportSaleAction(saleInput);

    expect(res).toEqual({ ok: true, sale_id: "s1" });
    expect(getEffectiveLocationIdMock).toHaveBeenCalledWith(sessionUser, runtimeDb, "tenant-RT");
    expect(createExportSaleMock).toHaveBeenCalledWith(
      "tenant-RT", "loc-selected", "user-1", expect.any(Object), runtimeDb,
    );
    expect(h.dispose).toHaveBeenCalledTimes(1);
  });

  // getEffectiveLocationId devuelve null para cookie ausente, cookie que no
  // existe en la DB runtime o location de otro tenant — en los tres casos
  // la action falla cerrada sin elegir una location por su cuenta.
  it.each(["cookie ausente", "cookie inválida", "location de otro tenant"])("%s → fail closed", async () => {
    const h = runtimeHandle();
    requireOperationalContextMock.mockResolvedValue(h.value);
    getEffectiveLocationIdMock.mockResolvedValue(null);

    const res = await createExportSaleAction(saleInput);

    expect(res).toEqual({ ok: false, error: NO_LOCATION });
    expect(createExportSaleMock).not.toHaveBeenCalled();
    expect(h.dispose).toHaveBeenCalledTimes(1);
  });

  it("context.locationId presente → se usa sin consultar cookie", async () => {
    requireOperationalContextMock.mockResolvedValue(runtimeHandle({ locationId: "loc-jwt" }).value);
    createExportSaleMock.mockResolvedValue({ ok: true, sale_id: "s2" });

    await createExportSaleAction(saleInput);

    expect(getEffectiveLocationIdMock).not.toHaveBeenCalled();
    expect(createExportSaleMock).toHaveBeenCalledWith("tenant-RT", "loc-jwt", "user-1", expect.any(Object), runtimeDb);
  });

  it("PLATFORM_NATIVE conserva su comportamiento: location del contexto, sin lookup runtime", async () => {
    requireOperationalContextMock.mockResolvedValue(runtimeHandle({ runtimeMode: "PLATFORM_NATIVE" }).value);

    const res = await createExportSaleAction(saleInput);

    expect(res).toEqual({ ok: false, error: NO_LOCATION });
    expect(getEffectiveLocationIdMock).not.toHaveBeenCalled();
    expect(createExportSaleMock).not.toHaveBeenCalled();
  });

  it("Support Session read-only → bloquea antes de resolver location", async () => {
    rejectReadOnly();

    const res = await createExportSaleAction(saleInput);

    expect(res.ok).toBe(false);
    expect(getEffectiveLocationIdMock).not.toHaveBeenCalled();
    expect(createExportSaleMock).not.toHaveBeenCalled();
  });
});
