// ─────────────────────────────────────────────────────────────────
// platform/lib/provisioning — provision-runtime-tenant.test.ts
//
// SHARED-PILOT-3B — criterio de aceptación #34: "Puedo crear un
// RuntimeTenant nuevo de tipo Commerce, crear su Location y su
// administrador, autenticar a ese administrador como RUNTIME_CLIENT
// y operar con tenant_id/location_id, sin que exista una sola fila
// Gym para ese tenant." Y simultáneamente MODE GYM sigue soportado.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";
import { provisionRuntimeTenant } from "./provision-runtime-tenant";

function fakeDb() {
  const runtimeTenantCreate = vi.fn().mockResolvedValue({ id: "tenant-new" });
  const gymCreate = vi.fn().mockResolvedValue({ id: "gym-new" });
  const branchCreate = vi.fn().mockResolvedValue({ id: "branch-new" });
  const userCreate = vi.fn().mockResolvedValue({ id: "admin-new" });

  const tx = {
    runtimeTenant: { create: runtimeTenantCreate },
    gym: { create: gymCreate },
    branch: { create: branchCreate },
    user: { create: userCreate },
  };

  const db = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  } as never;

  return { db, runtimeTenantCreate, gymCreate, branchCreate, userCreate };
}

const ADMIN = { email: "admin@example.com", password: "synthetic-pass-123", first_name: "A", last_name: "Admin" };

describe("provisionRuntimeTenant — MODE COMMERCE_ONLY", () => {
  it("crea RuntimeTenant + Location + Admin SIN crear ninguna fila Gym", async () => {
    const { db, gymCreate, branchCreate, userCreate } = fakeDb();

    const result = await provisionRuntimeTenant(db, {
      mode: "COMMERCE_ONLY",
      tenantName: "Comercio Uno",
      tenantSlug: "comercio-uno",
      locationName: "Sede Central",
      admin: ADMIN,
    });

    expect(gymCreate).not.toHaveBeenCalled();
    expect(result.gymId).toBeNull();

    expect(branchCreate).toHaveBeenCalledWith({
      data: { tenant_id: "tenant-new", gym_id: null, name: "Sede Central", status: "active" },
      select: { id: true },
    });

    expect(userCreate).toHaveBeenCalledTimes(1);
    const userData = userCreate.mock.calls[0][0].data;
    expect(userData.tenant_id).toBe("tenant-new");
    expect(userData.gym_id).toBeNull();
    expect(userData.role).toBe("super_admin");
    expect(await bcrypt.compare(ADMIN.password, userData.password_hash)).toBe(true);

    expect(result).toEqual({
      tenantId: "tenant-new",
      gymId: null,
      locationId: "branch-new",
      adminUserId: "admin-new",
    });
  });
});

describe("provisionRuntimeTenant — MODE GYM", () => {
  it("crea RuntimeTenant + Gym + Location + Admin, todos vinculados por tenant_id/gym_id", async () => {
    const { db, gymCreate, branchCreate, userCreate } = fakeDb();

    const result = await provisionRuntimeTenant(db, {
      mode: "GYM",
      tenantName: "Gimnasio Uno",
      tenantSlug: "gimnasio-uno",
      gymName: "Gimnasio Uno",
      gymSlug: "gimnasio-uno",
      locationName: "Sede Central",
      admin: ADMIN,
    });

    expect(gymCreate).toHaveBeenCalledWith({
      data: { tenant_id: "tenant-new", name: "Gimnasio Uno", slug: "gimnasio-uno", status: "active" },
      select: { id: true },
    });
    expect(result.gymId).toBe("gym-new");

    expect(branchCreate).toHaveBeenCalledWith({
      data: { tenant_id: "tenant-new", gym_id: "gym-new", name: "Sede Central", status: "active" },
      select: { id: true },
    });

    const userData = userCreate.mock.calls[0][0].data;
    expect(userData.tenant_id).toBe("tenant-new");
    expect(userData.gym_id).toBe("gym-new");
  });
});
