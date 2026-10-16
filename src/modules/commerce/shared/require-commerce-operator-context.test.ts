// ─────────────────────────────────────────────────────────────────
// commerce/shared — require-commerce-operator-context.test.ts
//
// Frontera central assertCommerceOperatorAccess: rol LIVE + sucursal
// fija VIGENTE (User.branch_id en la DB efectiva, dentro del tenant
// efectivo). DB sintética en memoria.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const users = [
    { id: "u-A", tenant_id: "tenant-A", branch_id: "loc-A" },
    { id: "u-moved", tenant_id: "tenant-A", branch_id: "loc-B" },
    { id: "u-none", tenant_id: "tenant-A", branch_id: null },
    { id: "u-foreign", tenant_id: "tenant-B", branch_id: "loc-A" },
  ];
  const makeDb = () => ({
    user: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenant_id: string } }) => {
        const u = users.find((x) => x.id === where.id && x.tenant_id === where.tenant_id);
        return u ? { branch_id: u.branch_id } : null;
      }),
    },
  });
  return { makeDb, platformDb: makeDb() };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: h.platformDb }));
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  OperationalContextError: class extends Error {},
  requireOperationalContext: vi.fn(),
}));

import { COMMERCE_ACCESS_MESSAGES as M } from "@/core/permissions/commerce-access";
import {
  assertCommerceOperatorAccess,
  assertCommerceOperatorLive,
} from "./require-commerce-operator-context";

let db: ReturnType<typeof h.makeDb>;
beforeEach(() => {
  db = h.makeDb();
  h.platformDb.user.findFirst.mockClear();
});

const check = (userId: string, role: string, locationId: string | null, tenantId = "tenant-A") =>
  assertCommerceOperatorAccess({ db: db as never, tenantId, userId, role, locationId });

describe("assertCommerceOperatorAccess", () => {
  it("reception asignada a A con sesión A → permitido", async () => {
    expect(await check("u-A", "reception", "loc-A")).toBeNull();
  });

  it("reception reasignada a B con sesión A → BRANCH_REASSIGNED", async () => {
    expect(await check("u-moved", "reception", "loc-A")).toBe(M.BRANCH_REASSIGNED);
  });

  it("branch_admin reasignado → BRANCH_REASSIGNED", async () => {
    expect(await check("u-moved", "branch_admin", "loc-A")).toBe(M.BRANCH_REASSIGNED);
  });

  it("sucursal de sesión activa pero distinta de la asignada → denegado", async () => {
    expect(await check("u-A", "reception", "loc-B")).toBe(M.BRANCH_REASSIGNED);
  });

  it("usuario sin sucursal asignada → LOCATION_REQUIRED", async () => {
    expect(await check("u-none", "reception", "loc-A")).toBe(M.LOCATION_REQUIRED);
  });

  it("usuario de otro tenant (consulta acotada al tenant efectivo) → denegado", async () => {
    expect(await check("u-foreign", "reception", "loc-A")).toBe(M.LOCATION_REQUIRED);
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { id: "u-foreign", tenant_id: "tenant-A" },
      select: { branch_id: true },
    });
  });

  it("sin sucursal en sesión → denegado sin consultar DB", async () => {
    expect(await check("u-A", "reception", null)).toBe(M.LOCATION_REQUIRED);
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it.each(["trainer", "client", "otro"])("rol LIVE %s → ROLE sin consultar DB", async (role) => {
    expect(await check("u-A", role, "loc-A")).toBe(M.ROLE);
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it("super_admin (global) → permitido sin consultar asignación", async () => {
    expect(await check("u-moved", "super_admin", null)).toBeNull();
    expect(await check("u-moved", "super_admin", "loc-A")).toBeNull();
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });
});

describe("assertCommerceOperatorLive", () => {
  it("usa context.client (DB runtime efectiva) cuando existe", async () => {
    const r = await assertCommerceOperatorLive(
      { effectiveRole: "reception", locationId: "loc-A", tenantId: "tenant-A", client: db as never },
      "u-moved",
    );
    expect(r).toBe(M.BRANCH_REASSIGNED);
    expect(db.user.findFirst).toHaveBeenCalled();
    expect(h.platformDb.user.findFirst).not.toHaveBeenCalled();
  });

  it("PLATFORM_NATIVE (sin client) → DB de la instancia", async () => {
    const r = await assertCommerceOperatorLive(
      { effectiveRole: "reception", locationId: "loc-A", tenantId: "tenant-A" },
      "u-A",
    );
    expect(r).toBeNull();
    expect(h.platformDb.user.findFirst).toHaveBeenCalled();
  });
});
