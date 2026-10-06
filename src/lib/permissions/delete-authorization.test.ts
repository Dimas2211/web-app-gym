// ─────────────────────────────────────────────────────────────────
// lib/permissions — delete-authorization.test.ts
//
// (20) El helper legacy de eliminación sigue funcionando para los
// módulos NO migrados a la Autorización Operativa (Users, Clients GYM,
// Memberships, Trainers, Weekly Plans). Products, Customers, Purchases
// y Sales ya no lo usan.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";

vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findFirst: vi.fn(async () => null) } } }));
vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn() }));

import { checkDeleteAuth, verifyAdminDeleteCredentials } from "./delete-authorization";

let HASH: string;

beforeAll(async () => {
  HASH = await bcrypt.hash("admin-pass", 4);
});

function runtimeDb(user: unknown) {
  return { user: { findFirst: vi.fn(async () => user) } } as never;
}

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("(20) helpers legacy de eliminación — módulos no migrados", () => {
  it("verifyAdminDeleteCredentials autoriza con credenciales válidas contra la DB recibida", async () => {
    const db = runtimeDb({ id: "a1", password_hash: HASH, first_name: "Ana", last_name: "Admin" });
    expect(await verifyAdminDeleteCredentials({ email: "ANA@x.com ", password: "admin-pass" }, "tenant-A", db)).toEqual({
      authorized: true,
      authorized_by: "Ana Admin",
    });
  });

  it("verifyAdminDeleteCredentials rechaza contraseña incorrecta o usuario inexistente", async () => {
    const db = runtimeDb({ id: "a1", password_hash: HASH, first_name: "Ana", last_name: "Admin" });
    expect((await verifyAdminDeleteCredentials({ email: "ana@x.com", password: "otra" }, "tenant-A", db)).authorized).toBe(false);
    expect((await verifyAdminDeleteCredentials({ email: "x@x.com", password: "admin-pass" }, "tenant-A", runtimeDb(null))).authorized).toBe(false);
  });

  it("checkDeleteAuth: admin directo requiere la palabra ELIMINAR", async () => {
    const user = { role: "super_admin" as const, tenant_id: "tenant-A" };
    expect(await checkDeleteAuth(form({ confirmation_word: "ELIMINAR" }), user, runtimeDb(null))).toEqual({ ok: true });
    expect((await checkDeleteAuth(form({ confirmation_word: "eliminar" }), user, runtimeDb(null))).ok).toBe(false);
  });

  it("checkDeleteAuth: rol sin permiso directo requiere credenciales administrativas", async () => {
    const user = { role: "reception" as const, tenant_id: "tenant-A" };
    expect((await checkDeleteAuth(form({}), user, runtimeDb(null))).ok).toBe(false);
    const db = runtimeDb({ id: "a1", password_hash: HASH, first_name: "Ana", last_name: "Admin" });
    expect(await checkDeleteAuth(form({ admin_email: "ana@x.com", admin_password: "admin-pass" }), user, db)).toEqual({ ok: true });
  });

  it("los flujos migrados (Products/Customers/Purchases/Sales) ya no importan el helper legacy", () => {
    const root = join(__dirname, "..", "..");
    const migrated = [
      "modules/commerce/products/actions/verify-edit-key.action.ts",
      "modules/commerce/purchases/actions/edit-purchase-auth.action.ts",
      "modules/commerce/purchases/actions/cancel-confirmed-purchase.action.ts",
      "modules/commerce/sales/actions/edit-sale-auth.action.ts",
      "modules/commerce/sales/actions/delete-draft-sale-with-auth.action.ts",
    ];
    for (const rel of migrated) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src, rel).not.toContain("delete-authorization");
      expect(src, rel).not.toContain("EDIT_CATALOG_PIN\n");
      expect(src, rel).not.toMatch(/process\.env\.EDIT_CATALOG_PIN/);
    }
  });
});
