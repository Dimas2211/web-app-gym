// ─────────────────────────────────────────────────────────────────
// operational-authorization — run-supervisor-authorization.reception.test.ts
//
// - `isRoleAllowed` permite a Sales dejar que reception SOLICITE la Clave
//   de Supervisor (SALE_EDIT); sin el predicado, Products/Customers/
//   Purchases siguen en canManageStaff.
// - SALE_EDIT es location-scoped: el grant solo se emite para ventas de
//   la sucursal EFECTIVA (contexto operacional, nunca el navegador). Una
//   venta de otra sucursal o de otro tenant se rechaza ANTES de verificar
//   la clave / emitir el grant.
// - La clave sigue siendo obligatoria (authorizeWithSupervisorPin).
// DB sintética en memoria — sin bases reales.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  type Row = { id: string; tenant_id: string; location_id?: string; status?: string };
  const VALID_PIN = "1234";
  // Respeta TODOS los campos del `where` (id, tenant_id, location_id).
  const table = (rows: Row[]) => ({
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((r) => Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v)) ?? null,
    ),
  });
  return {
    VALID_PIN,
    liveRole: "reception",
    locationId: "loc-REC" as string | null,
    cookieLocation: "loc-OTRA" as string | null,
    /** Asignación ACTUAL en la DB efectiva (User.branch_id). */
    assignedBranch: "loc-REC" as string | null,
    authorize: vi.fn(async (_ctx: unknown, _scope: string, _id: string, pin: string) =>
      pin === VALID_PIN ? { ok: true } : { ok: false, error: "Clave de supervisor incorrecta." },
    ),
    db: {
      sale: table([
        { id: "a0000000-0000-4000-8000-000000000001", tenant_id: "tenant-A", location_id: "loc-REC", status: "DRAFT" },
        { id: "a0000000-0000-4000-8000-000000000002", tenant_id: "tenant-A", location_id: "loc-OTRA", status: "DRAFT" },
        { id: "a0000000-0000-4000-8000-000000000003", tenant_id: "tenant-B", location_id: "loc-REC", status: "DRAFT" },
        { id: "a0000000-0000-4000-8000-000000000004", tenant_id: "tenant-A", location_id: "loc-REC", status: "CONFIRMED" },
      ]),
      product: table([{ id: "b0000000-0000-4000-8000-000000000001", tenant_id: "tenant-A" }]),
      customer: table([{ id: "c0000000-0000-4000-8000-000000000001", tenant_id: "tenant-A" }]),
      user: {
        findFirst: vi.fn(async ({ where }: { where: { id: string; tenant_id: string } }) =>
          where.id === "u1" && where.tenant_id === "tenant-A" ? { branch_id: h.assignedBranch } : null,
        ),
      },
      purchase: table([{ id: "d0000000-0000-4000-8000-000000000001", tenant_id: "tenant-A", location_id: "loc-OTRA", status: "DRAFT" }]),
    },
    getEffectiveLocationId: vi.fn(async () => null as string | null),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  OperationalContextError: class extends Error {},
  requireOperationalContext: vi.fn(async () => ({
    context: {
      tenantId: "tenant-A",
      locationId: h.locationId,
      client: h.db,
      effectiveUser: { id: "u1", role: h.liveRole },
    },
    dispose: vi.fn(async () => {}),
  })),
}));
vi.mock("./operational-authorization", () => ({ authorizeWithSupervisorPin: h.authorize }));
vi.mock("@/lib/location/active-location", () => ({ getEffectiveLocationId: h.getEffectiveLocationId }));
vi.mock("@/lib/permissions/guards", () => ({
  requireCommerceOperator: vi.fn(async () => ({ id: "u1", role: h.liveRole, tenant_id: "tenant-A", location_id: h.locationId })),
  requireAdmin: vi.fn(async () => ({ id: "u1", role: h.liveRole, tenant_id: "tenant-A", location_id: h.locationId })),
}));

import { runSupervisorAuthorization } from "./run-supervisor-authorization";
import { OPERATIONAL_SCOPES } from "./scopes";
import { OPERATIONAL_AUTH_MESSAGES } from "./messages";
import { COMMERCE_ACCESS_MESSAGES } from "@/core/permissions/commerce-access";
import { editSaleAuthAction } from "@/modules/commerce/sales/actions/edit-sale-auth.action";
import { verifyEditKeyAction } from "@/modules/commerce/products/actions/verify-edit-key.action";
import { authorizeCustomerEditAction } from "@/modules/commerce/customers/actions/authorize-customer-edit.action";
import { editPurchaseAuthAction } from "@/modules/commerce/purchases/actions/edit-purchase-auth.action";

// isValidGrantEntityId exige un formato de id; usamos UUIDs y los mapeamos.
const ID = {
  "sale-own": "a0000000-0000-4000-8000-000000000001",
  "sale-other-branch": "a0000000-0000-4000-8000-000000000002",
  "sale-foreign-tenant": "a0000000-0000-4000-8000-000000000003",
  "sale-confirmed": "a0000000-0000-4000-8000-000000000004",
  "prod-1": "b0000000-0000-4000-8000-000000000001",
  "cust-1": "c0000000-0000-4000-8000-000000000001",
  "pur-1": "d0000000-0000-4000-8000-000000000001",
} as const;
type Key = keyof typeof ID;

function form(entity: Key, pin = h.VALID_PIN) {
  const f = new FormData();
  f.set("entity_id", ID[entity]);
  f.set("supervisor_pin", pin);
  return f;
}

function resetState() {
  h.liveRole = "reception";
  h.locationId = "loc-REC";
  h.assignedBranch = "loc-REC";
  h.db.user.findFirst.mockClear();
  h.db.sale.findFirst.mockClear();
  h.getEffectiveLocationId.mockReset();
  h.getEffectiveLocationId.mockResolvedValue(null);
  h.authorize.mockClear();
}

describe("runSupervisorAuthorization — predicado de rol y scope", () => {
  beforeEach(resetState);

  const base = {
    scope: OPERATIONAL_SCOPES.SALE_EDIT,
    module: "commerce.sales",
    entityId: ID["sale-own"],
    pin: h.VALID_PIN,
  };
  const user = { id: "u1", role: "reception", tenant_id: "tenant-A", location_id: "loc-REC" } as never;

  it("sin isRoleAllowed (Products/Customers/Purchases): reception sigue denegada", async () => {
    const r = await runSupervisorAuthorization(user, { ...base, assertEntity: async () => null });
    expect(r).toEqual({ ok: false, error: OPERATIONAL_AUTH_MESSAGES.GRANT_MISSING });
    expect(h.authorize).not.toHaveBeenCalled();
  });

  it("assertEntity recibe el scope efectivo del contexto operacional (location + rol LIVE)", async () => {
    const assertEntity = vi.fn(async () => null);
    await runSupervisorAuthorization(user, { ...base, isRoleAllowed: () => true, assertEntity });
    expect(assertEntity).toHaveBeenCalledWith(h.db, "tenant-A", ID["sale-own"], {
      locationId: "loc-REC",
      effectiveRole: "reception",
    });
  });
});

describe("editSaleAuthAction — SALE_EDIT location-scoped", () => {
  beforeEach(resetState);

  it("venta de su propia sucursal + PIN válido → grant emitido", async () => {
    const r = await editSaleAuthAction(undefined as never, form("sale-own"));
    expect(r).toEqual({ ok: true });
    expect(h.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-A", client: h.db }),
      OPERATIONAL_SCOPES.SALE_EDIT,
      ID["sale-own"],
      h.VALID_PIN,
    );
  });

  it("la consulta de la venta filtra por la sucursal efectiva", async () => {
    await editSaleAuthAction(undefined as never, form("sale-own"));
    expect(h.db.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ID["sale-own"], tenant_id: "tenant-A", location_id: "loc-REC" },
      }),
    );
  });

  it("venta de OTRA sucursal del mismo tenant → denegado antes de verificar clave / emitir grant", async () => {
    const r = await editSaleAuthAction(undefined as never, form("sale-other-branch"));
    expect(r).toEqual({ ok: false, error: "La venta no existe o no pertenece a esta sucursal." });
    expect(h.authorize).not.toHaveBeenCalled();
  });

  it("venta de tenant ajeno → denegado", async () => {
    const r = await editSaleAuthAction(undefined as never, form("sale-foreign-tenant"));
    expect(r).toMatchObject({ ok: false });
    expect(h.authorize).not.toHaveBeenCalled();
  });

  it("PIN inválido → denegado (la clave sigue siendo obligatoria)", async () => {
    const r = await editSaleAuthAction(undefined as never, form("sale-own", "0000"));
    expect(r).toEqual({ ok: false, error: "Clave de supervisor incorrecta." });
  });

  it("venta CONFIRMED de su sucursal → denegado sin grant", async () => {
    const r = await editSaleAuthAction(undefined as never, form("sale-confirmed"));
    expect(r).toEqual({ ok: false, error: "Solo las ventas en borrador pueden editarse." });
    expect(h.authorize).not.toHaveBeenCalled();
  });

  it("branch_admin: misma regla de sucursal (propia sí, otra no)", async () => {
    h.liveRole = "branch_admin";
    expect(await editSaleAuthAction(undefined as never, form("sale-own"))).toEqual({ ok: true });
    expect((await editSaleAuthAction(undefined as never, form("sale-other-branch")))?.ok).toBe(false);
  });

  it("no global sin sucursal efectiva → denegado, nunca usa la cookie", async () => {
    h.locationId = null;
    h.getEffectiveLocationId.mockResolvedValue("loc-OTRA");
    const r = await editSaleAuthAction(undefined as never, form("sale-other-branch"));
    // Denegado por la frontera central de Commerce, antes de consultar la venta.
    expect(r).toEqual({ ok: false, error: COMMERCE_ACCESS_MESSAGES.LOCATION_REQUIRED });
    expect(h.getEffectiveLocationId).not.toHaveBeenCalled();
    expect(h.authorize).not.toHaveBeenCalled();
  });

  it("super_admin (global): grant para ventas de su sucursal efectiva (selector validado en DB efectiva)", async () => {
    h.liveRole = "super_admin";
    h.locationId = null;
    h.getEffectiveLocationId.mockResolvedValue("loc-OTRA");
    expect(await editSaleAuthAction(undefined as never, form("sale-other-branch"))).toEqual({ ok: true });
    expect(h.getEffectiveLocationId).toHaveBeenCalledWith(expect.anything(), h.db, "tenant-A");
    // Fuera de su sucursal efectiva → denegado.
    expect((await editSaleAuthAction(undefined as never, form("sale-own")))?.ok).toBe(false);
  });

  it("super_admin sin sucursal efectiva seleccionada → denegado (fail closed)", async () => {
    h.liveRole = "super_admin";
    h.locationId = null;
    const r = await editSaleAuthAction(undefined as never, form("sale-own"));
    expect(r).toEqual({ ok: false, error: "La sesión no tiene una location activa." });
  });

  it("rol LIVE trainer → denegado sin verificar clave", async () => {
    h.liveRole = "trainer";
    const r = await editSaleAuthAction(undefined as never, form("sale-own"));
    expect(r).toEqual({ ok: false, error: OPERATIONAL_AUTH_MESSAGES.GRANT_MISSING });
    expect(h.authorize).not.toHaveBeenCalled();
  });
});

describe("no regresión — Products/Customers/Purchases siguen tenant-level y admin-only", () => {
  beforeEach(resetState);

  const CASES = [
    ["verifyEditKeyAction", verifyEditKeyAction, "prod-1", OPERATIONAL_SCOPES.PRODUCT_EDIT],
    ["authorizeCustomerEditAction", authorizeCustomerEditAction, "cust-1", OPERATIONAL_SCOPES.CUSTOMER_EDIT],
    // La compra vive en otra sucursal: Purchases NO adopta el filtro de sucursal.
    ["editPurchaseAuthAction", editPurchaseAuthAction, "pur-1", OPERATIONAL_SCOPES.PURCHASE_EDIT],
  ] as const;

  it.each(CASES)("%s: branch_admin + PIN válido → grant (sin filtro de sucursal)", async (_n, action, entity, scope) => {
    h.liveRole = "branch_admin";
    const r = await action(undefined as never, form(entity));
    expect(r).toEqual({ ok: true });
    expect(h.authorize).toHaveBeenCalledWith(expect.anything(), scope, ID[entity], h.VALID_PIN);
  });

  it.each(CASES)("%s: rol LIVE reception → denegado (canManageStaff intacto)", async (_n, action, entity) => {
    const r = await action(undefined as never, form(entity));
    expect(r).toEqual({ ok: false, error: OPERATIONAL_AUTH_MESSAGES.GRANT_MISSING });
    expect(h.authorize).not.toHaveBeenCalled();
  });

  it.each(CASES)("%s: PIN inválido → denegado", async (_n, action, entity) => {
    h.liveRole = "branch_admin";
    expect((await action(undefined as never, form(entity, "0000")))?.ok).toBe(false);
  });
});

describe("editSaleAuthAction — sucursal fija vigente (User.branch_id)", () => {
  beforeEach(resetState);

  it("reception asignada a A, JWT A, venta de A → grant emitido", async () => {
    expect(await editSaleAuthAction(undefined as never, form("sale-own"))).toEqual({ ok: true });
    expect(h.db.user.findFirst).toHaveBeenCalledWith({
      where: { id: "u1", tenant_id: "tenant-A" },
      select: { branch_id: true },
    });
  });

  it("reception reasignada a B con JWT A → NO emite SALE_EDIT para la venta de A (caso 9)", async () => {
    h.assignedBranch = "loc-B";
    const r = await editSaleAuthAction(undefined as never, form("sale-own"));
    expect(r).toEqual({ ok: false, error: COMMERCE_ACCESS_MESSAGES.BRANCH_REASSIGNED });
    expect(h.authorize).not.toHaveBeenCalled();
    expect(h.db.sale.findFirst).not.toHaveBeenCalled();
  });

  it("branch_admin reasignado → NO emite SALE_EDIT", async () => {
    h.liveRole = "branch_admin";
    h.assignedBranch = "loc-B";
    expect((await editSaleAuthAction(undefined as never, form("sale-own")))?.ok).toBe(false);
    expect(h.authorize).not.toHaveBeenCalled();
  });

  it("cuenta sin sucursal asignada → denegado", async () => {
    h.assignedBranch = null;
    const r = await editSaleAuthAction(undefined as never, form("sale-own"));
    expect(r).toEqual({ ok: false, error: COMMERCE_ACCESS_MESSAGES.LOCATION_REQUIRED });
    expect(h.authorize).not.toHaveBeenCalled();
  });

  it("super_admin con sucursal activa válida → grant, sin consulta de asignación", async () => {
    h.liveRole = "super_admin";
    h.locationId = null;
    h.getEffectiveLocationId.mockResolvedValue("loc-OTRA");
    expect(await editSaleAuthAction(undefined as never, form("sale-other-branch"))).toEqual({ ok: true });
    expect(h.db.user.findFirst).not.toHaveBeenCalled();
  });
});
