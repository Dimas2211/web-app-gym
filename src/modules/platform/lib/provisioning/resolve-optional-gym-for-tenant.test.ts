// ─────────────────────────────────────────────────────────────────
// platform/lib/provisioning — resolve-optional-gym-for-tenant.test.ts
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { resolveOptionalGymForTenant } from "./resolve-optional-gym-for-tenant";

describe("resolveOptionalGymForTenant", () => {
  it("tenant Commerce-only sin Gym -> retorna null, nunca crea uno", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const db = { gym: { findUnique } } as never;

    const result = await resolveOptionalGymForTenant(db, "tenant-commerce-only");

    expect(result).toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: { tenant_id: "tenant-commerce-only" },
      select: { id: true },
    });
  });

  it("tenant GYM -> retorna el id del Gym resuelto por tenant_id, nunca asume gym.id === tenantId", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "gym-uuid-distinto-del-tenant" });
    const db = { gym: { findUnique } } as never;

    const result = await resolveOptionalGymForTenant(db, "tenant-gym-1");

    expect(result).toBe("gym-uuid-distinto-del-tenant");
    expect(findUnique).toHaveBeenCalledWith({
      where: { tenant_id: "tenant-gym-1" },
      select: { id: true },
    });
  });
});
