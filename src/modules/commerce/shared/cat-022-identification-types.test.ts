// ─────────────────────────────────────────────────────────────────
// commerce/shared — cat-022-identification-types.test.ts
//
// SHARED-PILOT-4C-C1 (addendum) — CAT-022 oficial v1.2 solo contiene
// 02, 03, 13, 36, 37. "00 — Consumidor final" no es un tipo de
// documento: se retira de schemas, fallbacks de UI y seeds.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/modules/commerce/suppliers/actions/create-supplier.action", () => ({ createSupplierAction: vi.fn() }));
vi.mock("@/modules/commerce/suppliers/actions/update-supplier.action", () => ({ updateSupplierAction: vi.fn() }));
vi.mock("@/modules/commerce/customers/actions/create-customer.action", () => ({ createCustomerAction: vi.fn() }));
vi.mock("@/modules/commerce/customers/actions/update-customer.action", () => ({ updateCustomerAction: vi.fn() }));

import { CAT022_ID_TYPE_CODES, CAT022_ID_TYPE_OPTIONS } from "./cat-022-identification-types";
import { createCustomerSchema, updateCustomerSchema } from "@/modules/commerce/customers/schemas/customer.schemas";
import { createSupplierSchema } from "@/modules/commerce/suppliers/schemas/create-supplier.schema";
import { updateSupplierSchema } from "@/modules/commerce/suppliers/schemas/update-supplier.schema";
import { ID_TYPE_FALLBACK as NEW_CUSTOMER_FALLBACK } from "@/modules/commerce/customers/components/new-customer-dialog";
import { ID_TYPE_FALLBACK as EDIT_CUSTOMER_FALLBACK } from "@/modules/commerce/customers/components/edit-customer-dialog";
import { ID_TYPE_OPTIONS as NEW_SUPPLIER_OPTIONS } from "@/modules/commerce/suppliers/components/new-supplier-dialog";
import { ID_TYPE_FALLBACK as EDIT_SUPPLIER_FALLBACK } from "@/modules/commerce/suppliers/components/edit-supplier-dialog";

const OFFICIAL = ["02", "03", "13", "36", "37"];
const ROOT = path.resolve(__dirname, "../../../..");

const CUSTOMER = { name: "Cliente Test", taxpayer_type: "FINAL_CONSUMER" };
const SUPPLIER = { supplier_code: "PROV-CAT022", name: "Supplier Test", taxpayer_type: "SMALL_TAXPAYER" };
const SUPPLIER_UPDATE = { id: "7f1c1f0e-7a55-4c8e-9a0d-2f3b7a1f5e11", name: "Supplier Test", taxpayer_type: "SMALL_TAXPAYER" };

describe("CAT-022 — fuente única", () => {
  it("contiene exactamente los cinco códigos oficiales", () => {
    expect([...CAT022_ID_TYPE_CODES].sort()).toEqual(OFFICIAL);
    expect(CAT022_ID_TYPE_OPTIONS.map((o) => o.code)).toEqual(["36", "13", "02", "03", "37"]);
  });
});

describe("Customer schema — id_type_code", () => {
  it.each(OFFICIAL)("acepta %s", (code) => {
    expect(createCustomerSchema.safeParse({ ...CUSTOMER, id_type_code: code }).success).toBe(true);
    expect(updateCustomerSchema.safeParse({ id_type_code: code }).success).toBe(true);
  });

  it.each(["00", "99", "1", ""])("rechaza %j", (code) => {
    const r = createCustomerSchema.safeParse({ ...CUSTOMER, id_type_code: code });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.id_type_code).toBeTruthy();
    expect(updateCustomerSchema.safeParse({ id_type_code: code }).success).toBe(false);
  });

  it("FINAL_CONSUMER con id_type_code=null (o ausente) sigue válido", () => {
    expect(createCustomerSchema.safeParse({ ...CUSTOMER, id_type_code: null }).success).toBe(true);
    expect(createCustomerSchema.safeParse(CUSTOMER).success).toBe(true);
    expect(updateCustomerSchema.safeParse({ taxpayer_type: "FINAL_CONSUMER", id_type_code: null }).success).toBe(true);
  });

  it("REGISTERED_TAXPAYER + id_type_code=36 sigue válido", () => {
    const r = createCustomerSchema.safeParse({
      name: "Empresa Test", taxpayer_type: "REGISTERED_TAXPAYER", id_type_code: "36", nit: "0614-010268-009-9", nrc: "160466-8",
    });
    expect(r.success).toBe(true);
  });

  it("EXCLUDED_SUBJECT se conserva como taxpayer_type", () => {
    expect(createCustomerSchema.safeParse({ ...CUSTOMER, taxpayer_type: "EXCLUDED_SUBJECT" }).success).toBe(true);
  });
});

describe("Supplier schema — id_type_code", () => {
  it.each(OFFICIAL)("acepta %s (create y update)", (code) => {
    expect(createSupplierSchema.safeParse({ ...SUPPLIER, id_type_code: code }).success).toBe(true);
    expect(updateSupplierSchema.safeParse({ ...SUPPLIER_UPDATE, id_type_code: code }).success).toBe(true);
  });

  it("rechaza 00 (create y update)", () => {
    const c = createSupplierSchema.safeParse({ ...SUPPLIER, id_type_code: "00" });
    expect(c.success).toBe(false);
    if (!c.success) expect(c.error.flatten().fieldErrors.id_type_code?.[0]).toBe("Tipo de identificación inválido.");
    expect(updateSupplierSchema.safeParse({ ...SUPPLIER_UPDATE, id_type_code: "00" }).success).toBe(false);
  });
});

describe("Fallbacks / opciones de UI sin 00", () => {
  it("customer create/edit fallback = CAT-022 oficial", () => {
    for (const list of [NEW_CUSTOMER_FALLBACK, EDIT_CUSTOMER_FALLBACK]) {
      const codes = list.map((o) => o.code);
      expect(codes).not.toContain("00");
      expect([...codes].sort()).toEqual(OFFICIAL);
    }
  });

  it("supplier create options / edit fallback = CAT-022 oficial (+ 'sin tipo')", () => {
    const createCodes = NEW_SUPPLIER_OPTIONS.map((o) => o.value);
    expect(createCodes).not.toContain("00");
    expect(createCodes.filter(Boolean).sort()).toEqual(OFFICIAL);
    expect(createCodes).toContain("");

    const editCodes = EDIT_SUPPLIER_FALLBACK.map((o) => o.code);
    expect(editCodes).not.toContain("00");
    expect([...editCodes].sort()).toEqual(OFFICIAL);
  });

  it("ningún mapa de labels de customers/suppliers declara la clave \"00\"", () => {
    for (const rel of [
      "src/modules/commerce/customers/components/customer-detail-tabs.tsx",
      "src/modules/commerce/customers/components/customer-summary-panel.tsx",
      "src/modules/commerce/suppliers/components/supplier-detail-tabs.tsx",
      "src/modules/commerce/suppliers/components/supplier-summary-panel.tsx",
    ]) {
      const src = readFileSync(path.join(ROOT, rel), "utf-8");
      expect(src, rel).not.toMatch(/["']00["']\s*:/);
      expect(src, rel).not.toMatch(/code:\s*["']00["']/);
    }
  });
});

describe("Seeds CAT-022 sin 00", () => {
  function cat022Codes(rel: string): string[] {
    const src = readFileSync(path.join(ROOT, rel), "utf-8");
    return [...src.matchAll(/catalog_code:\s*"CAT-022",\s*item_code:\s*"(\w+)"/g)].map((m) => m[1]);
  }

  it.each([
    "prisma/seeds/seed.dte-catalog-items.ts",
    "src/modules/platform/lib/seed-runners/dte-catalog-items-runner.ts",
  ])("%s — CAT-022 = oficial", (rel) => {
    const codes = cat022Codes(rel);
    expect(codes).not.toContain("00");
    expect([...codes].sort()).toEqual(OFFICIAL);
  });

  it("seed.commerce-catalogs.ts — IDENTIFICATION_TYPES = oficial", () => {
    const src = readFileSync(path.join(ROOT, "prisma/seeds/seed.commerce-catalogs.ts"), "utf-8");
    const block = src.match(/const IDENTIFICATION_TYPES = \[([\s\S]*?)\];/)?.[1] ?? "";
    const codes = [...block.matchAll(/code:\s*"(\w+)"/g)].map((m) => m[1]);
    expect(codes).not.toContain("00");
    expect([...codes].sort()).toEqual(OFFICIAL);
  });
});
