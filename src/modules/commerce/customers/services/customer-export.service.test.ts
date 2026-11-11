import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
import { createCustomer, updateCustomer } from "./customer.service";
import { createCustomerSchema, updateCustomerSchema } from "../schemas/customer.schemas";
import { searchForeignCustomers } from "../../sales/export/queries/search-foreign-customers";

const foreignInput = {
  is_foreign: true, country_code: "US", customer_person_type: "1" as const,
  name: "DH APPS", taxpayer_type: "REGISTERED_TAXPAYER" as const,
  id_type_code: "36" as const, nit: "06140000000000", nrc: "1234567",
  activity_name: "Desarrollo de software", address_complement: "Dirección del receptor de prueba",
};

function makeDb(existing: Record<string, unknown> = {}) {
  let row = { id: "customer-1", tenant_id: "meta", customer_code: "000001", status: "active", ...foreignInput, ...existing };
  const customer = {
    findFirst: vi.fn(async () => row),
    create: vi.fn(async ({ data }) => ({ ...data, id: "new-customer" })),
    update: vi.fn(async ({ data }) => { row = { ...row, ...data }; return row; }),
    findMany: vi.fn(async ({ where }) =>
      row.tenant_id === where.tenant_id && row.status === where.status && row.is_foreign === where.is_foreign ? [row] : []),
  };
  const country = { findFirst: vi.fn(async () => ({ code: "US", name: "Estados Unidos" })) };
  return { customer, country, db: { customer, country } as unknown as PrismaClient };
}

beforeEach(() => vi.clearAllMocks());

describe("cliente fiscal extranjero desde el maestro", () => {
  it("preserva campos de exportación en los schemas de alta y edición", () => {
    expect(createCustomerSchema.parse(foreignInput)).toMatchObject({ is_foreign: true, country_code: "US", customer_person_type: "1" });
    expect(updateCustomerSchema.parse({ country_code: "US" })).toEqual({ country_code: "US" });
    expect(updateCustomerSchema.parse({ name: "Nacional" })).not.toHaveProperty("is_foreign");
  });

  it("hace seleccionable el mismo cliente después de editarlo, sin duplicarlo ni cambiar sus identificadores nacionales", async () => {
    const { db, customer } = makeDb({ is_foreign: false, country_code: null, customer_person_type: null });
    expect(await searchForeignCustomers("meta", "DH", 20, db)).toEqual([]);
    const result = await updateCustomer("customer-1", "meta", "admin", updateCustomerSchema.parse(foreignInput), db);
    expect(result).toEqual({ ok: true });
    expect(customer.create).not.toHaveBeenCalled();
    expect(customer.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "customer-1" }, data: expect.objectContaining({ country_name: "Estados Unidos", nit: foreignInput.nit, nrc: foreignInput.nrc }) }));
    expect(await searchForeignCustomers("meta", "DH", 20, db)).toEqual([expect.objectContaining({ id: "customer-1", is_foreign: true })]);
    expect(await searchForeignCustomers("other-tenant", "DH", 20, db)).toEqual([]);
  });

  it("permite editar parcialmente un extranjero conservando su país y tipo de persona", async () => {
    const { db, customer } = makeDb();
    expect(await updateCustomer("customer-1", "meta", "admin", { name: "DH APPS TEST" }, db)).toEqual({ ok: true });
    expect(customer.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ country_code: "US", customer_person_type: "1" }) }));
  });

  it.each(["SV", "9999", "XX"])("bloquea país nacional o fuera del catálogo: %s", async (code) => {
    const { db, country, customer } = makeDb();
    country.findFirst.mockResolvedValue(code === "SV" ? { code: "SV", name: "El Salvador" } : null as never);
    expect(await updateCustomer("customer-1", "meta", "admin", { country_code: code }, db)).toMatchObject({ ok: false, field: "country_code" });
    expect(customer.update).not.toHaveBeenCalled();
  });

  it.each([
    { customer_person_type: null }, { nit: null }, { activity_name: "" }, { address_complement: "" },
  ])("rechaza datos extranjeros incompletos antes de guardar: %j", async (changes) => {
    const { db, customer } = makeDb();
    expect(await updateCustomer("customer-1", "meta", "admin", changes, db)).toMatchObject({ ok: false });
    expect(customer.update).not.toHaveBeenCalled();
  });

  it("mantiene el tenant al editar un cliente y no escribe si no existe", async () => {
    const { db, customer } = makeDb();
    customer.findFirst.mockResolvedValue(null as never);
    expect(await updateCustomer("customer-1", "other", "admin", foreignInput, db)).toMatchObject({ ok: false });
    expect(customer.findFirst).toHaveBeenCalledWith({ where: { id: "customer-1", tenant_id: "other" } });
    expect(customer.update).not.toHaveBeenCalled();
  });

  it("permite volver a nacional conservando sus datos previos y lo quita de la búsqueda FEX", async () => {
    const { db, customer } = makeDb();
    expect(await updateCustomer("customer-1", "meta", "admin", { is_foreign: false }, db)).toEqual({ ok: true });
    expect(customer.update).toHaveBeenCalledWith({ where: { id: "customer-1" }, data: { is_foreign: false, updated_by: "admin" } });
    expect(await searchForeignCustomers("meta", "DH", 20, db)).toEqual([]);
  });

  it("crea un extranjero desde el maestro con país oficial de la DB runtime", async () => {
    const { db, customer } = makeDb();
    customer.findFirst.mockResolvedValue(null as never);
    expect(await createCustomer("meta", "admin", { ...foreignInput, customer_code: "EXP-TEST" }, db)).toMatchObject({ ok: true });
    expect(customer.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenant_id: "meta", is_foreign: true, country_name: "Estados Unidos" }) }));
  });
});
