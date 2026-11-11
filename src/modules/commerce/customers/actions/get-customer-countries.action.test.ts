import { beforeEach, describe, expect, it, vi } from "vitest";
const { requireContext, dispose, findMany } = vi.hoisted(() => ({
  requireContext: vi.fn(), dispose: vi.fn(), findMany: vi.fn(),
}));
vi.mock("@/lib/permissions/guards", () => ({ requireAdmin: vi.fn(async () => ({ id: "meta-admin" })) }));
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireContext,
  OperationalContextError: class extends Error {},
}));
import { getCustomerCountriesAction } from "./get-customer-countries.action";

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ context: { client: { country: { findMany } } }, dispose });
});
describe("países del cliente en la base operacional", () => {
  it("consulta el catálogo runtime activo y libera el contexto", async () => {
    findMany.mockResolvedValue([{ code: "US", name: "Estados Unidos" }]);
    expect(await getCustomerCountriesAction()).toEqual({ ok: true, items: [{ code: "US", name: "Estados Unidos" }] });
    expect(requireContext).toHaveBeenCalledWith({ id: "meta-admin" }, { module: "core.customers", write: false });
    expect(findMany).toHaveBeenCalledWith({ where: { status: "active" }, select: { code: true, name: true }, orderBy: { name: "asc" } });
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("libera el contexto aunque falle el catálogo", async () => {
    findMany.mockRejectedValue(new Error("database unavailable"));
    await expect(getCustomerCountriesAction()).rejects.toThrow("database unavailable");
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("no consulta otra base si se deniega el contexto", async () => {
    requireContext.mockRejectedValue(new Error("denied"));
    await expect(getCustomerCountriesAction()).rejects.toThrow("denied");
    expect(findMany).not.toHaveBeenCalled();
  });
});
