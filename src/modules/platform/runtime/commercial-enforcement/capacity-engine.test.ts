// ─────────────────────────────────────────────────────────────────
// platform/runtime/commercial-enforcement — capacity-engine.test.ts
//
// Bloque B — matriz completa de getCapacityStatus/assertCapacityAvailable:
// unlimited, finito, límite exacto, over-limit, unconfigured, override
// organización vs plan, y LEGACY_UNMANAGED (nunca reportado como unlimited).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { getCapacityStatus, assertCapacityAvailable } from "./capacity-engine";
import { CommercialEnforcementError, type CommercialEnforcementContext } from "./types";
import type { EffectiveEntitlement } from "../../types/platform.types";

const CODE = "commerce.products.max";

function entitlement(overrides: Partial<EffectiveEntitlement> = {}): EffectiveEntitlement {
  return {
    entitlement_definition_id: "def-1",
    code: CODE,
    name: "Productos",
    category: "commerce",
    value_type: "COUNT",
    period_type: "NONE",
    numeric_value: 10,
    is_unlimited: false,
    source: "PLAN",
    ...overrides,
  };
}

function managedCtx(ent: EffectiveEntitlement | undefined): CommercialEnforcementContext {
  return {
    mode: "MANAGED",
    tenantId: "tenant-1",
    organizationId: "org-1",
    planId: "plan-1",
    verticalId: null,
    effectiveModules: new Map(),
    effectiveEntitlements: ent ? new Map([[CODE, ent]]) : new Map(),
  };
}

function legacyCtx(): CommercialEnforcementContext {
  return {
    mode: "LEGACY_UNMANAGED",
    tenantId: "tenant-legacy",
    organizationId: null,
    planId: null,
    verticalId: null,
    effectiveModules: new Map(),
    effectiveEntitlements: new Map(),
  };
}

function dbWithUsage(used: number) {
  return { product: { count: vi.fn().mockResolvedValue(used) } } as any;
}

describe("getCapacityStatus", () => {
  it("9. limit 10, usage 9 -> FINITE, remaining 1", async () => {
    const status = await getCapacityStatus(CODE, managedCtx(entitlement({ numeric_value: 10 })), dbWithUsage(9));
    expect(status).toMatchObject({ status: "FINITE", limit: 10, used: 9, remaining: 1, isUnlimited: false });
  });

  it("10/11. limit 10, usage 11 -> OVER_LIMIT, remaining 0", async () => {
    const status = await getCapacityStatus(CODE, managedCtx(entitlement({ numeric_value: 10 })), dbWithUsage(11));
    expect(status).toMatchObject({ status: "OVER_LIMIT", limit: 10, used: 11, remaining: 0 });
  });

  it("13. is_unlimited=true (PLAN) -> UNLIMITED, nunca limit numérico", async () => {
    const status = await getCapacityStatus(
      CODE,
      managedCtx(entitlement({ is_unlimited: true, numeric_value: null, source: "PLAN" })),
      dbWithUsage(999),
    );
    expect(status).toMatchObject({ status: "UNLIMITED", isUnlimited: true, limit: null, remaining: null });
  });

  it("16/17. override de organización manda sobre plan", async () => {
    const status = await getCapacityStatus(
      CODE,
      managedCtx(entitlement({ numeric_value: 20, source: "ORGANIZATION_OVERRIDE" })),
      dbWithUsage(15),
    );
    expect(status).toMatchObject({ status: "FINITE", limit: 20, used: 15, remaining: 5, source: "ORGANIZATION_OVERRIDE" });
  });

  it("14. MANAGED + UNCONFIGURED -> configured:false, remaining 0, nunca ilimitado", async () => {
    const status = await getCapacityStatus(CODE, managedCtx(entitlement({ source: "UNCONFIGURED", numeric_value: null })), dbWithUsage(3));
    expect(status).toMatchObject({ status: "UNCONFIGURED", configured: false, remaining: 0, isUnlimited: false });
  });

  it("sin entitlement definido -> lanza ENTITLEMENT_NOT_CONFIGURED", async () => {
    await expect(getCapacityStatus(CODE, managedCtx(undefined), dbWithUsage(0))).rejects.toMatchObject({
      code: "ENTITLEMENT_NOT_CONFIGURED",
    });
  });

  it("LEGACY_UNMANAGED -> status LEGACY_UNMANAGED_BYPASS, isUnlimited SIEMPRE false (nunca se reporta como unlimited comercial)", async () => {
    const status = await getCapacityStatus(CODE, legacyCtx(), dbWithUsage(999));
    expect(status).toMatchObject({
      status: "LEGACY_UNMANAGED_BYPASS",
      source: "LEGACY_UNMANAGED_BYPASS",
      isUnlimited: false,
      configured: false,
      limit: null,
      remaining: null,
    });
  });
});

describe("assertCapacityAvailable", () => {
  it("9. limit 10, usage 9, delta 1 -> allowed", async () => {
    await expect(
      assertCapacityAvailable(CODE, 1, managedCtx(entitlement({ numeric_value: 10 })), dbWithUsage(9)),
    ).resolves.toBeUndefined();
  });

  it("10. limit 10, usage 10, delta 1 -> blocked CAPACITY_LIMIT_REACHED", async () => {
    await expect(
      assertCapacityAvailable(CODE, 1, managedCtx(entitlement({ numeric_value: 10 })), dbWithUsage(10)),
    ).rejects.toMatchObject({ code: "CAPACITY_LIMIT_REACHED" });
  });

  it("11. limit 10, usage 11, delta 1 -> blocked (OVER_LIMIT no permite crecer más)", async () => {
    await expect(
      assertCapacityAvailable(CODE, 1, managedCtx(entitlement({ numeric_value: 10 })), dbWithUsage(11)),
    ).rejects.toMatchObject({ code: "CAPACITY_LIMIT_REACHED" });
  });

  it("12. limit 10, usage 11, delta 0 -> edición existente permitida sin consultar usage extra", async () => {
    const db = dbWithUsage(11);
    await assertCapacityAvailable(CODE, 0, managedCtx(entitlement({ numeric_value: 10 })), db);
    expect(db.product.count).not.toHaveBeenCalled();
  });

  it("delta negativo (liberar/desactivar) -> siempre permitido, incluso OVER_LIMIT", async () => {
    await expect(
      assertCapacityAvailable(CODE, -1, managedCtx(entitlement({ numeric_value: 10 })), dbWithUsage(11)),
    ).resolves.toBeUndefined();
  });

  it("13. unlimited -> allowed sin importar usage", async () => {
    await expect(
      assertCapacityAvailable(CODE, 1, managedCtx(entitlement({ is_unlimited: true, numeric_value: null })), dbWithUsage(99999)),
    ).resolves.toBeUndefined();
  });

  it("14. MANAGED + UNCONFIGURED + delta>0 -> blocked ENTITLEMENT_NOT_CONFIGURED", async () => {
    await expect(
      assertCapacityAvailable(CODE, 1, managedCtx(entitlement({ source: "UNCONFIGURED", numeric_value: null })), dbWithUsage(0)),
    ).rejects.toMatchObject({ code: "ENTITLEMENT_NOT_CONFIGURED" });
  });

  it("15. LEGACY_UNMANAGED -> operación permitida, bypass por ctx.mode (no consulta usage ni entitlements)", async () => {
    const db = dbWithUsage(0);
    await assertCapacityAvailable(CODE, 1, legacyCtx(), db);
    expect(db.product.count).not.toHaveBeenCalled();
  });

  it("17. override organization unlimited -> unlimited efectivo", async () => {
    await expect(
      assertCapacityAvailable(
        CODE,
        1,
        managedCtx(entitlement({ is_unlimited: true, numeric_value: null, source: "ORGANIZATION_OVERRIDE" })),
        dbWithUsage(1000),
      ),
    ).resolves.toBeUndefined();
  });

  it("errores son CommercialEnforcementError con httpStatus correcto", async () => {
    try {
      await assertCapacityAvailable(CODE, 1, managedCtx(entitlement({ numeric_value: 10 })), dbWithUsage(10));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CommercialEnforcementError);
      expect((err as CommercialEnforcementError).httpStatus).toBe(409);
    }
  });
});
