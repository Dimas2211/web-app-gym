import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  dispose: vi.fn(),
  vertical: vi.fn(),
  prepare: vi.fn(),
  save: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ role: "super_admin" })),
}));
vi.mock("@/modules/platform/runtime/require-live-operational-context", () => ({
  requireLiveOperationalContext: mocks.open,
}));
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  OperationalContextError: class extends Error {},
}));
vi.mock("@/modules/platform/runtime/effective-vertical", () => ({
  resolveEffectiveVerticalCode: mocks.vertical,
  hasEffectiveVertical: (_: unknown, code: string) => code === "GYM",
}));
vi.mock("../services/customer-gym.service", () => ({
  CustomerGymError: class extends Error {},
  prepareCustomerGym: mocks.prepare,
  saveCustomerGym: mocks.save,
}));
import { prepareCustomerGymAction, saveCustomerGymAction } from "./customer-gym.action";
const id = "11111111-1111-4111-8111-111111111111";
let context: {
  tenantId: string;
  gymId: string | null;
  effectiveUser: { role: string };
  commercialContext: object;
};
beforeEach(() => {
  vi.clearAllMocks();
  context = {
    tenantId: "rec",
    gymId: "rec-gym",
    effectiveUser: { role: "super_admin" },
    commercialContext: {},
  };
  mocks.open.mockResolvedValue({ context, dispose: mocks.dispose });
  mocks.vertical.mockResolvedValue("GYM");
  mocks.save.mockResolvedValue("gym-client");
  mocks.prepare.mockResolvedValue({ linkedClientId: null });
});
describe("Gym bridge entry points", () => {
  it("resolves LIVE write context and the fiscal module before saving", async () => {
    const result = await saveCustomerGymAction({ customer_id: id });
    expect(result).toEqual({ ok: true, clientId: "gym-client" });
    expect(mocks.open).toHaveBeenCalledWith(expect.anything(), {
      module: "core.customers",
      write: true,
    });
    expect(mocks.save).toHaveBeenCalledWith(context, { customer_id: id });
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
  it("requires Gym vertical even for a tenant with an old Gym row", async () => {
    mocks.vertical.mockResolvedValue("RETAIL");
    expect((await saveCustomerGymAction({ customer_id: id })).ok).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
  it("rejects a downgraded live role despite an administrator JWT", async () => {
    context.effectiveUser.role = "trainer";
    expect((await saveCustomerGymAction({ customer_id: id })).ok).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects Commerce-only tenants", async () => {
    context.gymId = null;
    expect((await prepareCustomerGymAction(id)).ok).toBe(false);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs before opening a context", async () => {
    expect((await prepareCustomerGymAction("invalid")).ok).toBe(false);
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("disposes the context when a service rejects a save", async () => {
    mocks.save.mockRejectedValue({ code: "P2002" });
    expect((await saveCustomerGymAction({ customer_id: id })).ok).toBe(false);
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
});
