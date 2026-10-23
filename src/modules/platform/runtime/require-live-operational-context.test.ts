import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { assertLiveIdentity, LIVE_IDENTITY_CHANGED_MESSAGE } from "./require-live-operational-context";

type Live = { status: string; tenant_id: string | null; role: string; branch_id: string | null } | null;

function ctx(opts: { role: string; tenantId?: string; locationId?: string | null; readOnly?: boolean; live: Live; branchActive?: boolean }) {
  const findUnique = vi.fn(async () => opts.live);
  const findFirst = vi.fn(async () => (opts.branchActive === false ? null : { id: "b1" }));
  return {
    context: {
      effectiveUser: { id: "u1", tenant_id: opts.tenantId ?? "t1", location_id: opts.locationId ?? null, role: opts.role, auth_scope: "PLATFORM" as const },
      tenantId: opts.tenantId ?? "t1",
      locationId: opts.locationId === undefined ? "b1" : opts.locationId,
      readOnly: opts.readOnly ?? false,
      client: { user: { findUnique }, branch: { findFirst } } as unknown as PrismaClient,
    },
    findUnique,
    findFirst,
  };
}

const active = (role: string, branch: string | null = "b1", tenant: string | null = "t1") => ({ status: "active", tenant_id: tenant, role, branch_id: branch });

describe("assertLiveIdentity (LIVE-3)", () => {
  it("identidad coherente: SA, BA y recepción de su sede activa pasan", async () => {
    expect(await assertLiveIdentity(ctx({ role: "super_admin", locationId: null, live: active("super_admin", null) }).context)).toBeNull();
    expect(await assertLiveIdentity(ctx({ role: "branch_admin", live: active("branch_admin") }).context)).toBeNull();
    expect(await assertLiveIdentity(ctx({ role: "reception", live: active("reception") }).context)).toBeNull();
  });

  it("entrenador y alumno no dependen de la sede de la sesión (su alcance es el perfil o el Client)", async () => {
    const t = ctx({ role: "trainer", live: active("trainer", "otra-sede") });
    expect(await assertLiveIdentity(t.context)).toBeNull();
    expect(t.findFirst).not.toHaveBeenCalled();
    expect(await assertLiveIdentity(ctx({ role: "client", locationId: null, live: active("client", null) }).context)).toBeNull();
  });

  it("usuario inexistente, inactivo, de otro tenant o con otro rol → identidad cambiada", async () => {
    for (const live of [null, { ...active("branch_admin"), status: "inactive" }, active("branch_admin", "b1", "t2"), active("reception")]) {
      expect(await assertLiveIdentity(ctx({ role: "branch_admin", live }).context)).toBe(LIVE_IDENTITY_CHANGED_MESSAGE);
    }
  });

  it("promoción posterior al login también exige sesión nueva (rol vigente ≠ rol de la sesión)", async () => {
    expect(await assertLiveIdentity(ctx({ role: "reception", live: active("branch_admin") }).context)).toBe(LIVE_IDENTITY_CHANGED_MESSAGE);
  });

  it("rol de sede: sede reasignada, sin sede en la sesión o sede inactiva → identidad cambiada", async () => {
    expect(await assertLiveIdentity(ctx({ role: "branch_admin", live: active("branch_admin", "b2") }).context)).toBe(LIVE_IDENTITY_CHANGED_MESSAGE);
    expect(await assertLiveIdentity(ctx({ role: "reception", locationId: null, live: active("reception", null) }).context)).toBe(LIVE_IDENTITY_CHANGED_MESSAGE);
    expect(await assertLiveIdentity(ctx({ role: "branch_admin", live: active("branch_admin"), branchActive: false }).context)).toBe(LIVE_IDENTITY_CHANGED_MESSAGE);
  });

  it("usuario heredado con tenant_id NULL coherente con su sesión sigue operando", async () => {
    const c = ctx({ role: "super_admin", locationId: null, live: active("super_admin", null, null) });
    c.context.tenantId = null as unknown as string;
    expect(await assertLiveIdentity(c.context)).toBeNull();
  });

  it("Support Session (readOnly) no consulta la base: sus escrituras ya las rechaza requireOperationalContext", async () => {
    const c = ctx({ role: "super_admin", readOnly: true, live: null });
    expect(await assertLiveIdentity(c.context)).toBeNull();
    expect(c.findUnique).not.toHaveBeenCalled();
  });
});
