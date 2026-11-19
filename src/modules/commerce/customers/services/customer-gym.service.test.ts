import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationalContext } from "@/modules/platform/runtime/require-operational-context";
vi.mock("@/lib/utils/operational-codes", () => ({
  generateQrToken: () => "stable-qr",
  getClientCodeSettings: async () => ({ prefix: "C", start: 1010, digits: 4 }),
}));
import {
  normalizeDocument,
  prepareCustomerGym,
  saveCustomerGym,
  suggestGymName,
} from "./customer-gym.service";

const customerId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const input = {
  customer_id: customerId,
  branch_id: branchId,
  first_name: "Leo",
  last_name: "Montiel",
  email: "leo@example.com",
  document_id: "01234567-8",
};
let db: ReturnType<typeof makeDb>;
let context: OperationalContext;
function makeDb() {
  const db = {
    customer: {
      findFirst: vi.fn().mockResolvedValue({
        id: customerId,
        name: "Leo Montiel",
        dui: "01234567-8",
        status: "active",
      }),
    },
    client: {
      findFirst: vi.fn().mockResolvedValue({ id: "existing", branch_id: branchId }),
      findMany: vi.fn().mockResolvedValue([{ operational_code: "C1012" }]),
      create: vi.fn().mockResolvedValue({ id: "new-client" }),
    },
    branch: {
      findFirst: vi.fn().mockResolvedValue({ id: branchId }),
      findMany: vi.fn().mockResolvedValue([{ id: branchId, name: "Central" }]),
    },
    gymCustomerLink: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (run: (tx: unknown) => unknown) => run(db));
  return db;
}
beforeEach(() => {
  db = makeDb();
  context = {
    tenantId: "rec",
    gymId: "gym-rec",
    locationId: branchId,
    readOnly: false,
    client: db,
    effectiveUser: { id: "admin", role: "super_admin" },
  } as unknown as OperationalContext;
});

describe("Customer → Gym bridge", () => {
  it("suggests personal names without discarding any part of the fiscal name", () => {
    expect(suggestGymName("Leo Montiel")).toEqual({ first_name: "Leo", last_name: "Montiel" });
    expect(suggestGymName("  Juan Carlos Pérez López  ")).toEqual({
      first_name: "Juan Carlos",
      last_name: "Pérez López",
    });
    expect(suggestGymName("Leo")).toEqual({ first_name: "Leo", last_name: "" });
  });
  it("normalizes formatted documents for comparison", () => {
    expect(normalizeDocument("01234567-8")).toBe("012345678");
    expect(normalizeDocument("ab 123")).toBe("AB123");
  });
  it("creates only a Gym profile, assigning tenant, branch, code and QR on the server", async () => {
    expect(await saveCustomerGym(context, input)).toBe("new-client");
    expect(db.client.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gym_id: "gym-rec",
        tenant_id: "rec",
        branch_id: branchId,
        location_id: branchId,
        first_name: "Leo",
        modality: "NORMAL",
        operational_code: "C1013",
        qr_token: "stable-qr",
      }),
    });
    expect(db.gymCustomerLink.create).toHaveBeenCalledWith({
      data: {
        tenant_id: "rec",
        customer_id: customerId,
        client_id: "new-client",
        created_by: "admin",
      },
    });
  });
  it("returns the saved link on retries without creating another client", async () => {
    db.gymCustomerLink.findUnique.mockResolvedValue({
      client_id: "already-linked",
      client: { branch_id: branchId },
    });
    expect(await saveCustomerGym(context, input)).toBe("already-linked");
    expect(db.client.create).not.toHaveBeenCalled();
    expect(db.gymCustomerLink.create).not.toHaveBeenCalled();
  });
  it("links an explicitly chosen existing client without changing its personal data", async () => {
    expect(
      await saveCustomerGym(context, { customer_id: customerId, existing_client_id: "existing" })
    ).toBe("existing");
    expect(db.client.create).not.toHaveBeenCalled();
  });
  it("rejects a client that is already linked to another fiscal customer", async () => {
    db.gymCustomerLink.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ customer_id: "other" });
    await expect(
      saveCustomerGym(context, { customer_id: customerId, existing_client_id: "existing" })
    ).rejects.toThrow("otro cliente fiscal");
    expect(db.gymCustomerLink.create).not.toHaveBeenCalled();
  });
  it("rejects duplicate document/email even if the user clears the prefilled identity", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ id: "duplicate" }]);
    await expect(
      saveCustomerGym(context, { ...input, document_id: "", email: "" })
    ).rejects.toThrow("Ya existe");
    expect(db.client.create).not.toHaveBeenCalled();
  });
  it("rejects foreign-tenant fiscal customer IDs", async () => {
    db.customer.findFirst.mockResolvedValue(null);
    await expect(saveCustomerGym(context, input)).rejects.toThrow("no encontrado");
    expect(db.customer.findFirst).toHaveBeenCalledWith({
      where: { id: customerId, tenant_id: "rec" },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each(["trainer", "client", "reception"])("denies the live role %s", async (role) => {
    context.effectiveUser.role = role;
    await expect(saveCustomerGym(context, input)).rejects.toThrow("Sin permisos");
    expect(db.customer.findFirst).not.toHaveBeenCalled();
  });
  it("denies read-only support and organizations without Gym", async () => {
    context.readOnly = true;
    await expect(saveCustomerGym(context, input)).rejects.toThrow("Sin permisos");
    context.readOnly = false;
    context.gymId = null;
    await expect(saveCustomerGym(context, input)).rejects.toThrow("Sin permisos");
  });
  it("branch admins cannot create in a different branch", async () => {
    context.effectiveUser.role = "branch_admin";
    await expect(saveCustomerGym(context, { ...input, branch_id: customerId })).rejects.toThrow(
      "tu sucursal"
    );
    expect(db.client.create).not.toHaveBeenCalled();
  });
  it("branch admins cannot link another branch or tenant client", async () => {
    context.effectiveUser.role = "branch_admin";
    db.client.findFirst.mockResolvedValue(null);
    await expect(
      saveCustomerGym(context, { customer_id: customerId, existing_client_id: "foreign" })
    ).rejects.toThrow("no encontrado");
    expect(db.client.findFirst).toHaveBeenCalledWith({
      where: {
        id: "foreign",
        tenant_id: "rec",
        gym_id: "gym-rec",
        branch_id: branchId,
      },
    });
  });
  it("does not expose a link to another branch", async () => {
    context.effectiveUser.role = "branch_admin";
    db.gymCustomerLink.findUnique.mockResolvedValue({
      client_id: "hidden",
      client: { branch_id: "other-branch" },
    });
    await expect(prepareCustomerGym(context, customerId)).rejects.toThrow("otra sucursal");
  });
  it("does not permit linking inactive fiscal customers", async () => {
    db.customer.findFirst.mockResolvedValue({ id: customerId, status: "inactive" });
    await expect(saveCustomerGym(context, input)).rejects.toThrow("Activa");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("validates the new client's required names and branch ownership", async () => {
    await expect(saveCustomerGym(context, { ...input, last_name: " " })).rejects.toThrow(
      "apellido"
    );
    db.branch.findFirst.mockResolvedValue(null);
    await expect(saveCustomerGym(context, input)).rejects.toThrow("Sucursal no válida");
    expect(db.client.create).not.toHaveBeenCalled();
  });
});
