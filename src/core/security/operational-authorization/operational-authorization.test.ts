// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — operational-authorization.test.ts
//
// Motor end-to-end (clave → cookie HttpOnly → verificación) contra una
// Runtime DB falsa. Certifica ligadura tenant/user/scope/entidad,
// expiración, revocación al cambiar/quitar la clave, no escalación
// entre scopes y que nunca se usa Prisma global.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { jar } = vi.hoisted(() => ({
  jar: new Map<string, { value: string; options?: Record<string, unknown> }>(),
}));

vi.mock("next/headers", async () => {
  const { cookieStoreFrom } = await import("./operational-authorization.test-fixtures");
  return { cookies: async () => cookieStoreFrom(jar) };
});

// (19) Ningún camino del motor puede tocar Prisma global.
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get() { throw new Error("Prisma global NO debe usarse"); } }),
}));

import {
  authorizeWithSupervisorPin,
  checkOperationalGrant,
  issueDraftOwnerGrant,
  revokeOperationalGrants,
  verifySupervisorPinForOperation,
  type OperationalAuthContext,
} from "./operational-authorization";
import { setSupervisorPin } from "./supervisor-pin";
import { OPERATIONAL_AUTH_MESSAGES as M } from "./messages";
import { SALE_DRAFT_WRITE_SCOPES, PURCHASE_DRAFT_WRITE_SCOPES, type PinGrantScope } from "./scopes";
import {
  createFakeSecurityDb,
  seedSupervisorPin,
  TEST_AUTH_SECRET,
  type FakeSecurityDb,
} from "./operational-authorization.test-fixtures";

let db: FakeSecurityDb;
const ORIGINAL_SECRET = process.env.AUTH_SECRET;

function ctx(over: Partial<{ tenantId: string; userId: string }> = {}): OperationalAuthContext {
  return {
    tenantId: over.tenantId ?? "tenant-A",
    client: db.client,
    effectiveUser: { id: over.userId ?? "user-A" },
  };
}

beforeEach(async () => {
  jar.clear();
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  db = createFakeSecurityDb();
  await seedSupervisorPin(db, "tenant-A", "123456");
});

afterEach(() => {
  vi.useRealTimers();
  process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("authorizeWithSupervisorPin", () => {
  it("(1) clave correcta emite cookie HttpOnly/SameSite=strict de corta duración", async () => {
    const r = await authorizeWithSupervisorPin(ctx(), "SALE_EDIT", "sale-A", "123456");
    expect(r).toEqual({ ok: true });
    const cookie = jar.get("zoa_sale_edit_sale-A");
    expect(cookie).toBeDefined();
    expect(cookie!.options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 600 });
    expect(cookie!.value).not.toContain("123456");
  });

  it("(2) clave incorrecta no emite grant", async () => {
    const r = await authorizeWithSupervisorPin(ctx(), "SALE_EDIT", "sale-A", "000000");
    expect(r).toEqual({ ok: false, error: M.PIN_INVALID });
    expect(jar.size).toBe(0);
  });

  it("(3) tenant sin clave configurada falla cerrado", async () => {
    const r = await authorizeWithSupervisorPin(ctx({ tenantId: "tenant-sin-pin" }), "PRODUCT_EDIT", "p-1", "123456");
    expect(r).toEqual({ ok: false, error: M.PIN_NOT_CONFIGURED });
    expect(jar.size).toBe(0);
  });

  it("fail closed sin AUTH_SECRET: no consume intento ni emite grant", async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    const r = await authorizeWithSupervisorPin(ctx(), "SALE_EDIT", "sale-A", "123456");
    expect(r).toEqual({ ok: false, error: M.UNAVAILABLE });
    expect(db.calls.findUnique).toBe(0);
    expect(jar.size).toBe(0);
  });

  it("rechaza entity_id inseguro sin consultar la DB", async () => {
    const r = await authorizeWithSupervisorPin(ctx(), "SALE_EDIT", "x;Path=/", "123456");
    expect(r.ok).toBe(false);
    expect(db.calls.findUnique).toBe(0);
  });
});

describe("checkOperationalGrant — ligadura", () => {
  it("grant válido autoriza la entidad para el mismo tenant/user", async () => {
    await authorizeWithSupervisorPin(ctx(), "SALE_EDIT", "sale-A", "123456");
    expect(await checkOperationalGrant(ctx(), ["SALE_EDIT"], "sale-A")).toEqual({ ok: true, scope: "SALE_EDIT" });
  });

  it("(5) autorización de tenant A no funciona en tenant B (aunque B tenga la misma clave)", async () => {
    await seedSupervisorPin(db, "tenant-B", "123456");
    await authorizeWithSupervisorPin(ctx(), "SALE_EDIT", "sale-A", "123456");
    const r = await checkOperationalGrant(ctx({ tenantId: "tenant-B" }), ["SALE_EDIT"], "sale-A");
    expect(r).toMatchObject({ ok: false, error: M.GRANT_MISSING });
  });

  it("(6) autorización de user A no funciona para user B", async () => {
    await authorizeWithSupervisorPin(ctx(), "SALE_EDIT", "sale-A", "123456");
    const r = await checkOperationalGrant(ctx({ userId: "user-B" }), ["SALE_EDIT"], "sale-A");
    expect(r).toMatchObject({ ok: false, error: M.GRANT_MISSING });
  });

  it.each([
    ["PRODUCT_EDIT", "product"],
    ["PURCHASE_EDIT", "purchase"],
    ["SALE_EDIT", "sale"],
    ["CUSTOMER_EDIT", "customer"],
  ] as const)("(7-10) %s para %s A no autoriza %s B", async (scope: PinGrantScope, kind) => {
    await authorizeWithSupervisorPin(ctx(), scope, `${kind}-A`, "123456");
    expect((await checkOperationalGrant(ctx(), [scope], `${kind}-A`)).ok).toBe(true);
    expect(await checkOperationalGrant(ctx(), [scope], `${kind}-B`)).toMatchObject({
      ok: false,
      error: M.GRANT_MISSING,
    });
  });

  it("no escalación: PRODUCT_EDIT no autoriza CUSTOMER_EDIT del mismo id", async () => {
    await authorizeWithSupervisorPin(ctx(), "PRODUCT_EDIT", "same-id", "123456");
    expect((await checkOperationalGrant(ctx(), ["CUSTOMER_EDIT"], "same-id")).ok).toBe(false);
  });

  it("no escalación: SALE_EDIT (clave) no equivale a SALE_DRAFT_OWNER (descartar)", async () => {
    await authorizeWithSupervisorPin(ctx(), "SALE_EDIT", "sale-A", "123456");
    expect((await checkOperationalGrant(ctx(), SALE_DRAFT_WRITE_SCOPES, "sale-A")).ok).toBe(true);
    expect((await checkOperationalGrant(ctx(), ["SALE_DRAFT_OWNER"], "sale-A")).ok).toBe(false);
  });

  it("grant de creador del borrador autoriza su captura sin clave, pero solo para ese borrador", async () => {
    await issueDraftOwnerGrant(ctx(), "PURCHASE_DRAFT_OWNER", "pur-A");
    expect(await checkOperationalGrant(ctx(), PURCHASE_DRAFT_WRITE_SCOPES, "pur-A")).toEqual({
      ok: true,
      scope: "PURCHASE_DRAFT_OWNER",
    });
    expect((await checkOperationalGrant(ctx(), PURCHASE_DRAFT_WRITE_SCOPES, "pur-B")).ok).toBe(false);
    expect((await checkOperationalGrant(ctx({ userId: "user-B" }), PURCHASE_DRAFT_WRITE_SCOPES, "pur-A")).ok).toBe(false);
  });

  it("grant de creador funciona aunque el tenant no tenga clave (crear borradores no se bloquea)", async () => {
    const c = ctx({ tenantId: "tenant-sin-pin" });
    await issueDraftOwnerGrant(c, "SALE_DRAFT_OWNER", "sale-N");
    expect((await checkOperationalGrant(c, SALE_DRAFT_WRITE_SCOPES, "sale-N")).ok).toBe(true);
  });

  it("cookie falsificada/no firmada no autoriza", async () => {
    jar.set("zoa_sale_edit_sale-A", { value: "eyJmYWtlIjp0cnVlfQ.forged" });
    expect((await checkOperationalGrant(ctx(), ["SALE_EDIT"], "sale-A")).ok).toBe(false);
  });

  it("sin entity id válido → no autorizado", async () => {
    expect((await checkOperationalGrant(ctx(), ["SALE_EDIT"], null)).ok).toBe(false);
    expect((await checkOperationalGrant(ctx(), ["SALE_EDIT"], "")).ok).toBe(false);
  });
});

describe("checkOperationalGrant — vigencia y revocación", () => {
  it("(11) grant expirado falla con mensaje de expiración", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    await authorizeWithSupervisorPin(ctx(), "SALE_EDIT", "sale-A", "123456");

    vi.setSystemTime(new Date("2026-10-05T10:10:01Z"));
    expect(await checkOperationalGrant(ctx(), ["SALE_EDIT"], "sale-A")).toMatchObject({
      ok: false,
      error: M.GRANT_EXPIRED,
      reason: "EXPIRED",
    });
  });

  it("el uso renueva la ventana de inactividad, con tope absoluto de 60 min", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-10-05T10:00:00Z").getTime();
    vi.setSystemTime(t0);
    await authorizeWithSupervisorPin(ctx(), "PURCHASE_EDIT", "pur-A", "123456");

    for (let m = 8; m <= 56; m += 8) {
      vi.setSystemTime(t0 + m * 60_000);
      expect((await checkOperationalGrant(ctx(), ["PURCHASE_EDIT"], "pur-A")).ok).toBe(true);
    }
    vi.setSystemTime(t0 + 60 * 60_000);
    expect(await checkOperationalGrant(ctx(), ["PURCHASE_EDIT"], "pur-A")).toMatchObject({ ok: false, reason: "EXPIRED" });
  });

  it("renew:false (páginas) no reescribe la cookie", async () => {
    await authorizeWithSupervisorPin(ctx(), "SALE_EDIT", "sale-A", "123456");
    const before = jar.get("zoa_sale_edit_sale-A")!.value;
    await new Promise((r) => setTimeout(r, 1100));
    await checkOperationalGrant(ctx(), ["SALE_EDIT"], "sale-A", { renew: false });
    expect(jar.get("zoa_sale_edit_sale-A")!.value).toBe(before);
  });

  it("cambiar/restablecer la clave revoca los grants emitidos con la anterior", async () => {
    await authorizeWithSupervisorPin(ctx(), "CUSTOMER_EDIT", "cust-A", "123456");
    await setSupervisorPin(db.client, "tenant-A", "admin", "nueva-clave");
    expect(await checkOperationalGrant(ctx(), ["CUSTOMER_EDIT"], "cust-A")).toMatchObject({
      ok: false,
      error: M.GRANT_EXPIRED,
    });
  });

  it("quitar la clave (hash null) invalida grants: fail closed", async () => {
    await authorizeWithSupervisorPin(ctx(), "PRODUCT_EDIT", "p-1", "123456");
    db.rows.get("tenant-A")!.supervisor_pin_hash = null;
    expect(await checkOperationalGrant(ctx(), ["PRODUCT_EDIT"], "p-1")).toMatchObject({
      ok: false,
      error: M.PIN_NOT_CONFIGURED,
    });
  });

  it("renovación solo cuando queda menos de la mitad de la ventana", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-10-05T10:00:00Z").getTime();
    vi.setSystemTime(t0);
    await authorizeWithSupervisorPin(ctx(), "SALE_EDIT", "sale-A", "123456");
    const original = jar.get("zoa_sale_edit_sale-A")!.value;

    vi.setSystemTime(t0 + 2 * 60_000); // quedan 8 min > 5 → no reescribe
    await checkOperationalGrant(ctx(), ["SALE_EDIT"], "sale-A");
    expect(jar.get("zoa_sale_edit_sale-A")!.value).toBe(original);

    vi.setSystemTime(t0 + 6 * 60_000); // quedan 4 min < 5 → renueva
    await checkOperationalGrant(ctx(), ["SALE_EDIT"], "sale-A");
    expect(jar.get("zoa_sale_edit_sale-A")!.value).not.toBe(original);
  });

  it("grants de creador acotados: se conservan solo los 5 más recientes por scope", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-10-05T10:00:00Z").getTime();
    for (let i = 1; i <= 7; i++) {
      vi.setSystemTime(t0 + i * 1000);
      await issueDraftOwnerGrant(ctx(), "SALE_DRAFT_OWNER", `sale-${i}`);
    }
    await issueDraftOwnerGrant(ctx(), "PURCHASE_DRAFT_OWNER", "pur-1");
    const saleOwners = [...jar.keys()].filter((k) => k.startsWith("zoa_sale_draft_owner_"));
    expect(saleOwners.sort()).toEqual(["sale-3", "sale-4", "sale-5", "sale-6", "sale-7"].map((id) => `zoa_sale_draft_owner_${id}`));
    expect(jar.has("zoa_purchase_draft_owner_pur-1")).toBe(true);
    expect((await checkOperationalGrant(ctx(), SALE_DRAFT_WRITE_SCOPES, "sale-7")).ok).toBe(true);
    expect((await checkOperationalGrant(ctx(), SALE_DRAFT_WRITE_SCOPES, "sale-1")).ok).toBe(false);
  });

  it("revokeOperationalGrants elimina las cookies de la entidad", async () => {
    await issueDraftOwnerGrant(ctx(), "SALE_DRAFT_OWNER", "sale-A");
    await revokeOperationalGrants(SALE_DRAFT_WRITE_SCOPES, "sale-A");
    expect((await checkOperationalGrant(ctx(), SALE_DRAFT_WRITE_SCOPES, "sale-A")).ok).toBe(false);
  });

  it("fail closed sin AUTH_SECRET al verificar", async () => {
    await authorizeWithSupervisorPin(ctx(), "SALE_EDIT", "sale-A", "123456");
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    expect(await checkOperationalGrant(ctx(), ["SALE_EDIT"], "sale-A")).toMatchObject({ ok: false, reason: "UNAVAILABLE" });
  });
});

describe("verifySupervisorPinForOperation (un solo uso)", () => {
  it("clave correcta autoriza sin emitir grant reutilizable", async () => {
    expect(await verifySupervisorPinForOperation(ctx(), "SALE_DELETE_DRAFT", "123456")).toEqual({ ok: true });
    expect(jar.size).toBe(0);
  });

  it("clave incorrecta / tenant sin clave fallan", async () => {
    expect(await verifySupervisorPinForOperation(ctx(), "PURCHASE_CANCEL_CONFIRMED", "x")).toEqual({
      ok: false,
      error: M.PIN_INVALID,
    });
    expect(
      await verifySupervisorPinForOperation(ctx({ tenantId: "tenant-sin-pin" }), "PURCHASE_DELETE_DRAFT", "123456"),
    ).toEqual({ ok: false, error: M.PIN_NOT_CONFIGURED });
  });
});
