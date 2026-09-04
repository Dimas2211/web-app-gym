// ─────────────────────────────────────────────────────────────────
// platform/runtime/commercial-enforcement — capacity-registry.test.ts
//
// Bloque B — verifica que cada usage provider cuenta correctamente
// contra un runtimeDb fake, y la matriz de delta de los helpers
// isXCountedForCapacity para Users/Locations/Products/Cash.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import {
  CAPACITY_REGISTRY,
  isProductCountedForCapacity,
  isUserCountedForCapacity,
  isLocationCountedForCapacity,
  isCashRegisterCountedForCapacity,
  capacityDelta,
} from "./capacity-registry";

function fakeDb() {
  return {
    user: { count: vi.fn().mockResolvedValue(7) },
    branch: { count: vi.fn().mockResolvedValue(2) },
    product: { count: vi.fn().mockResolvedValue(480) },
    cashRegister: { count: vi.fn().mockResolvedValue(1) },
  } as any;
}

describe("CAPACITY_REGISTRY — usage providers", () => {
  it("core.users.max cuenta User activos del tenant contra runtimeDb explícito", async () => {
    const db = fakeDb();
    const used = await CAPACITY_REGISTRY["core.users.max"].countUsage("tenant-1", db);
    expect(used).toBe(7);
    expect(db.user.count).toHaveBeenCalledWith({ where: { gym_id: "tenant-1", status: "active" } });
  });

  it("core.locations.max cuenta Branch activos", async () => {
    const db = fakeDb();
    const used = await CAPACITY_REGISTRY["core.locations.max"].countUsage("tenant-1", db);
    expect(used).toBe(2);
    expect(db.branch.count).toHaveBeenCalledWith({ where: { gym_id: "tenant-1", status: "active" } });
  });

  it("commerce.products.max cuenta Product distinto de DISCONTINUED", async () => {
    const db = fakeDb();
    const used = await CAPACITY_REGISTRY["commerce.products.max"].countUsage("tenant-1", db);
    expect(used).toBe(480);
    expect(db.product.count).toHaveBeenCalledWith({
      where: { tenant_id: "tenant-1", status: { not: "DISCONTINUED" } },
    });
  });

  it("commerce.cash_registers.max cuenta CashRegister con is_active=true", async () => {
    const db = fakeDb();
    const used = await CAPACITY_REGISTRY["commerce.cash_registers.max"].countUsage("tenant-1", db);
    expect(used).toBe(1);
    expect(db.cashRegister.count).toHaveBeenCalledWith({ where: { tenant_id: "tenant-1", is_active: true } });
  });
});

describe("isProductCountedForCapacity — commerce.products.max cuenta todo excepto DISCONTINUED", () => {
  it.each([
    ["ACTIVE", true],
    ["INACTIVE", true],
    ["BLOCKED_PURCHASE", true],
    ["BLOCKED_SALE", true],
    ["DISCONTINUED", false],
  ])("%s -> %s", (status, expected) => {
    expect(isProductCountedForCapacity(status)).toBe(expected);
  });
});

describe("capacityDelta — matriz de transición de Products", () => {
  it.each([
    ["DISCONTINUED", "ACTIVE", 1],
    ["DISCONTINUED", "INACTIVE", 1],
    ["DISCONTINUED", "BLOCKED_PURCHASE", 1],
    ["DISCONTINUED", "BLOCKED_SALE", 1],
    ["ACTIVE", "INACTIVE", 0],
    ["INACTIVE", "ACTIVE", 0],
    ["ACTIVE", "BLOCKED_SALE", 0],
    ["BLOCKED_PURCHASE", "ACTIVE", 0],
    ["ACTIVE", "DISCONTINUED", -1],
    ["INACTIVE", "DISCONTINUED", -1],
  ])("%s -> %s = delta %i", (from, to, expected) => {
    const delta = capacityDelta(isProductCountedForCapacity(from), isProductCountedForCapacity(to));
    expect(delta).toBe(expected);
  });

  it("crear producto nuevo en estado distinto de DISCONTINUED = +1", () => {
    expect(capacityDelta(false, isProductCountedForCapacity("ACTIVE"))).toBe(1);
  });

  it("crear producto directo en DISCONTINUED (si el flujo lo permitiera) = 0", () => {
    expect(capacityDelta(false, isProductCountedForCapacity("DISCONTINUED"))).toBe(0);
  });
});

describe("Users/Locations/Cash — delta basado en estado real, no en 'toda alta = +1'", () => {
  it("Users: inactive->active = +1, active->inactive = -1, active->active = 0", () => {
    expect(capacityDelta(isUserCountedForCapacity("inactive"), isUserCountedForCapacity("active"))).toBe(1);
    expect(capacityDelta(isUserCountedForCapacity("active"), isUserCountedForCapacity("inactive"))).toBe(-1);
    expect(capacityDelta(isUserCountedForCapacity("active"), isUserCountedForCapacity("active"))).toBe(0);
  });

  it("Locations: inactive->active = +1, active->inactive = -1", () => {
    expect(capacityDelta(isLocationCountedForCapacity("inactive"), isLocationCountedForCapacity("active"))).toBe(1);
    expect(capacityDelta(isLocationCountedForCapacity("active"), isLocationCountedForCapacity("inactive"))).toBe(-1);
  });

  it("Cash: false->true = +1, true->false = -1, true->true = 0", () => {
    expect(capacityDelta(isCashRegisterCountedForCapacity(false), isCashRegisterCountedForCapacity(true))).toBe(1);
    expect(capacityDelta(isCashRegisterCountedForCapacity(true), isCashRegisterCountedForCapacity(false))).toBe(-1);
    expect(capacityDelta(isCashRegisterCountedForCapacity(true), isCashRegisterCountedForCapacity(true))).toBe(0);
  });
});
