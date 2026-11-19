import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationalContext } from "@/modules/platform/runtime/require-operational-context";

vi.mock("./customer-gym.service", () => ({
  CustomerGymError: class extends Error {},
  normalizeDocument: (v?: string | null) => (v || "").replace(/[^a-z0-9]/gi, "").toUpperCase(),
}));
const create = vi.hoisted(() => vi.fn());
vi.mock("./customer.service", () => ({ createCustomer: create }));
import { prepareGymFiscalCustomer, saveGymFiscalCustomer, validateGymFiscalInput } from "./gym-fiscal-customer.service";

function makeDb() {
  const db = {
    client: { findFirst: vi.fn().mockResolvedValue({ id: "member", status: "active", first_name: "Leo", last_name: "Montiel", document_id: "01234567-8", email: "leo@example.com", phone: "12345678", address: "Casa" }) },
    customer: { findFirst: vi.fn().mockResolvedValue({ id: "fiscal", customer_code: "F1" }) },
    gymCustomerLink: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    $executeRaw: vi.fn().mockResolvedValue(1), $queryRaw: vi.fn().mockResolvedValue([]), $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (run: (tx: unknown) => unknown) => run(db));
  return db;
}
let db: ReturnType<typeof makeDb>;
let context: OperationalContext;
const input = { name: "Leo Montiel", taxpayer_type: "FINAL_CONSUMER" as const, id_type_code: "13" as const, dui: "01234567-8" };
beforeEach(() => {
  db = makeDb();
  context = { tenantId: "rec", gymId: "gym", locationId: "branch", readOnly: false, client: db,
    effectiveUser: { id: "admin", role: "super_admin" } } as unknown as OperationalContext;
  create.mockReset().mockResolvedValue({ ok: true, id: "new-fiscal", customer_code: "F2" });
});

describe("Gym to fiscal customer", () => {
  it("prefills personal data without guessing the document type", async () => {
    const result = await prepareGymFiscalCustomer(context, "member");
    expect(result.defaults).toEqual({ name: "Leo Montiel", email: "leo@example.com", phone: "12345678", address_complement: "Casa" });
    expect(result.document).toBe("01234567-8");
    expect(result.defaults).not.toHaveProperty("id_type_code");
  });
  it("recognizes the link made from the fiscal side", async () => {
    db.gymCustomerLink.findUnique.mockResolvedValue({ customer: { id: "fiscal", customer_code: "F1", name: "Leo Montiel" } });
    const result = await prepareGymFiscalCustomer(context, "member");
    expect(result.linkedCustomer?.id).toBe("fiscal");
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it("creates and links in the same transaction using the effective tenant and database", async () => {
    expect(await saveGymFiscalCustomer(context, "member", { input })).toEqual({ id: "new-fiscal", customer_code: "F2" });
    expect(create).toHaveBeenCalledWith("rec", "admin", input, db);
    expect(db.gymCustomerLink.create).toHaveBeenCalledWith({ data: { tenant_id: "rec", client_id: "member", customer_id: "new-fiscal", created_by: "admin" } });
  });
  it("links an existing fiscal customer without creating another", async () => {
    expect(await saveGymFiscalCustomer(context, "member", { customerId: "fiscal" })).toEqual({ id: "fiscal", customer_code: "F1" });
    expect(create).not.toHaveBeenCalled();
  });
  it("returns the existing link on retry", async () => {
    db.gymCustomerLink.findUnique.mockResolvedValue({ customer: { id: "already", customer_code: "A" } });
    expect(await saveGymFiscalCustomer(context, "member", { input })).toEqual({ id: "already", customer_code: "A" });
    expect(create).not.toHaveBeenCalled();
    expect(db.gymCustomerLink.create).not.toHaveBeenCalled();
  });
  it("rejects linking a customer already used by a different Gym profile", async () => {
    db.gymCustomerLink.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ client_id: "other" });
    await expect(saveGymFiscalCustomer(context, "member", { customerId: "fiscal" })).rejects.toThrow("otra ficha");
    expect(db.gymCustomerLink.create).not.toHaveBeenCalled();
  });
  it("rejects document/email duplicates even when the operator clears or changes the new fiscal values", async () => {
    db.$queryRaw.mockResolvedValue([{ id: "duplicate" }]);
    await expect(saveGymFiscalCustomer(context, "member", { input: { ...input, dui: "different" } })).rejects.toThrow("Ya existe");
    expect(create).not.toHaveBeenCalled();
  });
  it("rejects a foreign tenant fiscal customer or an inactive one", async () => {
    db.customer.findFirst.mockResolvedValue(null);
    await expect(saveGymFiscalCustomer(context, "member", { customerId: "foreign" })).rejects.toThrow("no encontrado");
    expect(db.customer.findFirst).toHaveBeenCalledWith({ where: { id: "foreign", tenant_id: "rec", status: "active" }, select: { id: true, customer_code: true } });
  });
  it("scopes branch admins to their current branch", async () => {
    context.effectiveUser.role = "branch_admin"; db.client.findFirst.mockResolvedValue(null);
    await expect(saveGymFiscalCustomer(context, "member", { input })).rejects.toThrow("sucursal");
    expect(db.client.findFirst).toHaveBeenCalledWith({ where: { id: "member", tenant_id: "rec", gym_id: "gym", branch_id: "branch" } });
  });
  it.each(["trainer", "client", "reception"])("rejects role %s", async role => {
    context.effectiveUser.role = role;
    await expect(saveGymFiscalCustomer(context, "member", { input })).rejects.toThrow("Sin permisos");
  });
  it("rejects read-only support and tenants without Gym", async () => {
    context.readOnly = true;
    await expect(prepareGymFiscalCustomer(context, "member")).rejects.toThrow("Sin permisos");
    context.readOnly = false; context.gymId = null;
    await expect(saveGymFiscalCustomer(context, "member", { input })).rejects.toThrow("Sin permisos");
  });
  it("does not save the link if fiscal creation fails", async () => {
    create.mockResolvedValue({ ok: false, error: "Código ocupado" });
    await expect(saveGymFiscalCustomer(context, "member", { input })).rejects.toThrow("Código ocupado");
    expect(db.gymCustomerLink.create).not.toHaveBeenCalled();
  });
  it("requires explicit document type and its corresponding number", () => {
    expect(validateGymFiscalInput({ ...input, id_type_code: null }).ok).toBe(false);
    expect(validateGymFiscalInput({ ...input, id_type_code: "36", nit: null }).ok).toBe(false);
    expect(validateGymFiscalInput(input).ok).toBe(true);
  });
  it("reports the missing registered taxpayer fields", () => {
    const result = validateGymFiscalInput({ ...input, taxpayer_type: "REGISTERED_TAXPAYER" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.objectContaining({ nit: expect.any(Array), nrc: expect.any(Array), activity_code: expect.any(Array) }));
  });
});
