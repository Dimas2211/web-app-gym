import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const h = vi.hoisted(() => ({
  findFirst: vi.fn(), update: vi.fn(), dispose: vi.fn(), grant: vi.fn(), readOnly: false,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: new Proxy({}, { get() { throw new Error("Global DB forbidden"); } }) }));
vi.mock("@/lib/permissions/guards", () => ({ requireAdmin: vi.fn(async () => ({ id: "admin", role: "super_admin" })) }));
vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveTenantContext: vi.fn(async () => ({
    context: { tenantId: "tenant-a", readOnly: h.readOnly, client: {
      product: { findFirst: h.findFirst, update: h.update },
      productCategory: { findFirst: vi.fn(async () => ({ id: "category" })) },
      unitOfMeasure: { findFirst: vi.fn(async () => ({ id: "unit" })) },
    } }, dispose: h.dispose,
  })),
}));
vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: vi.fn(async () => ({})),
  assertOrganizationModule: vi.fn(), CommercialEnforcementError: class extends Error {},
}));
vi.mock("@/core/security/operational-authorization/operational-authorization", () => ({ checkOperationalGrant: h.grant }));
import { updateProductAction } from "./update-product.action";

const id = "11111111-1111-4111-8111-111111111111";
function form(code = "NEW") {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ id, product_code: code, name: "ELECTROLIT", product_type: "PRODUCT",
    category_id: id, unit_id: id, is_stockable: "true", allow_purchase: "true", allow_sale: "true" })) fd.set(k, v);
  return fd;
}
beforeEach(() => {
  vi.clearAllMocks(); h.readOnly = false; h.grant.mockResolvedValue({ ok: true });
  h.findFirst.mockReset().mockResolvedValueOnce({ id }).mockResolvedValue(null);
  h.update.mockReset().mockResolvedValue({ id });
});
describe("código editable de producto", () => {
  it("actualiza el mismo ID en la base operacional, conserva el tenant y libera el contexto", async () => {
    expect(await updateProductAction(undefined, form(" NEW "))).toBeUndefined();
    expect(h.findFirst).toHaveBeenNthCalledWith(2, { where: { tenant_id: "tenant-a", product_code: "NEW", id: { not: id } }, select: { id: true } });
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id }, data: expect.objectContaining({ product_code: "NEW", updated_by: "admin" }) }));
    expect(h.update.mock.calls[0][0].data).not.toHaveProperty("tenant_id");
    expect(h.dispose).toHaveBeenCalledOnce();
  });
  it("permite guardar el mismo código del registro", async () => {
    expect(await updateProductAction(undefined, form("OLD"))).toBeUndefined();
  });
  it("rechaza un código usado por otro registro sin escribir", async () => {
    h.findFirst.mockReset().mockResolvedValue({ id: "existing" });
    expect(await updateProductAction(undefined, form())).toMatchObject({ errors: { product_code: expect.any(Array) } });
    expect(h.update).not.toHaveBeenCalled();
  });
  it("captura el duplicado concurrente de la restricción única", async () => {
    h.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6.19.2" }));
    expect(await updateProductAction(undefined, form())).toMatchObject({ errors: { product_code: expect.any(Array) } });
  });
  it("rechaza código vacío después del trim", async () => {
    expect(await updateProductAction(undefined, form("  "))).toMatchObject({ errors: { product_code: expect.any(Array) } });
    expect(h.update).not.toHaveBeenCalled();
  });
  it("mantiene el control de supervisor y bloquea antes de escribir", async () => {
    h.grant.mockResolvedValue({ ok: false, error: "Sin autorización" });
    expect(await updateProductAction(undefined, form())).toEqual({ error: "Sin autorización" });
    expect(h.findFirst).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });
  it("mantiene el aislamiento de tenant y el modo de solo lectura", async () => {
    h.findFirst.mockReset().mockResolvedValue(null);
    expect(await updateProductAction(undefined, form())).toHaveProperty("error");
    expect(h.update).not.toHaveBeenCalled();
    h.readOnly = true; h.findFirst.mockClear();
    expect(await updateProductAction(undefined, form())).toHaveProperty("error");
    expect(h.findFirst).not.toHaveBeenCalled();
  });
});
