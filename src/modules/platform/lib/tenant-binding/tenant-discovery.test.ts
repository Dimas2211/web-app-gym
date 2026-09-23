// ─────────────────────────────────────────────────────────────────
// platform/lib/tenant-binding — tenant-discovery.test.ts
//
// SHARED-PILOT-3 — tenant discovery debe leer runtime_tenants (la raíz
// neutral), no gyms. Gym ya no es la fuente de verdad de tenant
// discovery.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { detectTenantsFromClientDatabase } from "./tenant-discovery";

describe("detectTenantsFromClientDatabase", () => {
  it("lee runtime_tenants (no gyms) y mapea id/name/slug/status", async () => {
    const runtimeTenantFindMany = vi.fn().mockResolvedValue([
      { id: "rt-1", name: "Cliente A", slug: "cliente-a", status: "active" },
      { id: "rt-2", name: "Cliente B", slug: "cliente-b", status: "inactive" },
    ]);
    const gymFindMany = vi.fn();

    const fakeClient = {
      runtimeTenant: { findMany: runtimeTenantFindMany },
      gym: { findMany: gymFindMany },
    } as unknown as PrismaClient;

    const result = await detectTenantsFromClientDatabase(fakeClient);

    expect(runtimeTenantFindMany).toHaveBeenCalledTimes(1);
    expect(gymFindMany).not.toHaveBeenCalled();
    expect(result).toEqual([
      { id: "rt-1", name: "Cliente A", slug: "cliente-a", status: "active" },
      { id: "rt-2", name: "Cliente B", slug: "cliente-b", status: "inactive" },
    ]);
  });
});
