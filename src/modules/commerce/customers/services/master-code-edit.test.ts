import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { updateCustomer } from "./customer.service";
import { updateSupplier } from "../../suppliers/services/supplier.service";
import { updateCustomerSchema } from "../schemas/customer.schemas";
import { updateSupplierSchema } from "../../suppliers/schemas/update-supplier.schema";

const id = "11111111-1111-4111-8111-111111111111";
const collision = () => new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6.19.2" });

beforeEach(() => vi.clearAllMocks());
describe.each(["customer", "supplier"] as const)("edición de código %s", entity => {
  const field = `${entity}_code`;
  function setup(duplicate = false) {
    const row = { id, tenant_id: "tenant-a", [field]: "OLD", name: "Registro", is_foreign: false };
    const findFirst = vi.fn().mockResolvedValueOnce(row).mockResolvedValue(duplicate ? { id: "other" } : null);
    const update = vi.fn().mockResolvedValue(row);
    return { db: { [entity]: { findFirst, update } } as never, findFirst, update };
  }
  function run(db: never, code: string | undefined = "NEW") {
    return entity === "customer"
      ? updateCustomer(id, "tenant-a", "admin", code === undefined ? {} : { customer_code: code }, db)
      : updateSupplier("tenant-a", "admin", { id, name: "Registro", taxpayer_type: "SMALL_TAXPAYER", ...(code === undefined ? {} : { supplier_code: code }) }, db);
  }
  it("cambia solo el código manteniendo el ID y el tenant; excluye el mismo registro de duplicados", async () => {
    const { db, findFirst, update } = setup();
    expect(await run(db)).toEqual({ ok: true });
    expect(findFirst).toHaveBeenNthCalledWith(2, { where: { tenant_id: "tenant-a", [field]: "NEW", id: { not: id } }, select: { id: true } });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id }, data: expect.objectContaining({ [field]: "NEW", updated_by: "admin" }) }));
    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("id"); expect(data).not.toHaveProperty("tenant_id");
  });
  it("permite guardar el mismo código", async () => {
    const { db } = setup(); expect(await run(db, "OLD")).toEqual({ ok: true });
  });
  it("rechaza duplicados incluidos inactivos sin escribir", async () => {
    const { db, update } = setup(true);
    expect(await run(db)).toMatchObject({ ok: false, field }); expect(update).not.toHaveBeenCalled();
  });
  it("captura la colisión concurrente de la restricción única de PostgreSQL", async () => {
    const { db, update } = setup(); update.mockRejectedValue(collision());
    expect(await run(db)).toMatchObject({ ok: false, field });
  });
  it("rechaza IDs de otro tenant antes de consultar códigos o escribir", async () => {
    const { db, findFirst, update } = setup(); findFirst.mockReset().mockResolvedValue(null);
    expect(await run(db)).toMatchObject({ ok: false });
    expect(findFirst).toHaveBeenCalledTimes(1); expect(update).not.toHaveBeenCalled();
  });
});

it("los schemas normalizan espacios y rechazan códigos vacíos", () => {
  expect(updateCustomerSchema.parse({ customer_code: " NEW " }).customer_code).toBe("NEW");
  expect(updateCustomerSchema.safeParse({ customer_code: "  " }).success).toBe(false);
  const supplier = { id, name: "Registro", taxpayer_type: "SMALL_TAXPAYER" };
  expect(updateSupplierSchema.parse({ ...supplier, supplier_code: " NEW " }).supplier_code).toBe("NEW");
  expect(updateSupplierSchema.safeParse({ ...supplier, supplier_code: "  " }).success).toBe(false);
});
