// ─────────────────────────────────────────────────────────────────
// core/modules/users — actions.cross-tenant.test.ts
//
// FASE VI-D4 — ETAPA K/U/W/O. Certifica:
//   - aislamiento por tenant (findFirst con gym_id, nunca findUnique(id)
//     seguido de mutación sin validar pertenencia);
//   - SHARED-PILOT-4A / Gap G: unicidad de email evaluada por
//     (tenant_id, email) — el mismo email puede existir en tenant A y
//     tenant B, incluso dentro de la MISMA base física (Shared Runtime);
//   - password siempre hasheado con bcrypt, nunca texto plano;
//   - CommercialEnforcementError (capacidad) se propaga como
//     { success:false, error } sin romper el flujo.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";
import { createCoreUser, updateCoreUser, toggleCoreUserStatus } from "./actions";
import { CommercialEnforcementError } from "@/modules/platform/runtime/commercial-enforcement";

const FAKE_CTX = {
  mode: "LEGACY_UNMANAGED",
  tenantId: "tenant-A",
  organizationId: null,
  planId: null,
  verticalId: null,
  effectiveModules: new Map(),
  effectiveEntitlements: new Map(),
} as never;

describe("createCoreUser — unicidad de email por (tenant_id, email), password hasheado", () => {
  it("9. email ya existe en tenant B -> irrelevante para tenant A, incluso en la MISMA base (Shared Runtime)", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const createMock = vi.fn().mockResolvedValue({ id: "new-user-A" });
    const fakeDbA = {
      user: { findUnique },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ user: { create: createMock } })),
    } as never;

    const result = await createCoreUser(
      "tenant-A",
      { email: "same@example.com", first_name: "A", last_name: "User", role: "reception", password: "synthetic-pass-123" },
      FAKE_CTX,
      fakeDbA,
    );

    expect(result.success).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
    // La query de unicidad debe estar scoped a tenant_id — nunca email solo.
    expect(findUnique).toHaveBeenCalledWith({
      where: { tenant_id_email: { tenant_id: "tenant-A", email: "same@example.com" } },
      select: { id: true },
    });
  });

  it("password se hashea con bcrypt — nunca se persiste texto plano", async () => {
    let capturedData: { password_hash?: string } = {};
    const fakeDb = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          user: {
            create: vi.fn(async ({ data }: { data: { password_hash: string } }) => {
              capturedData = data;
              return { id: "new-user-1" };
            }),
          },
        }),
      ),
    } as never;

    const PLAINTEXT = "synthetic-pass-123";
    await createCoreUser(
      "tenant-A",
      { email: "test@example.com", first_name: "A", last_name: "User", role: "reception", password: PLAINTEXT },
      FAKE_CTX,
      fakeDb,
    );

    expect(capturedData.password_hash).toBeDefined();
    expect(capturedData.password_hash).not.toBe(PLAINTEXT);
    expect(await bcrypt.compare(PLAINTEXT, capturedData.password_hash!)).toBe(true);
  });

  it("CommercialEnforcementError (capacidad) se propaga como { success:false, error }", async () => {
    const fakeDb = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn().mockRejectedValue(new CommercialEnforcementError("CAPACITY_LIMIT_REACHED", "Límite de usuarios alcanzado.")),
    } as never;

    const result = await createCoreUser(
      "tenant-A",
      { email: "test@example.com", first_name: "A", last_name: "User", role: "reception", password: "synthetic-pass-123" },
      FAKE_CTX,
      fakeDb,
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeTruthy();
  });
});

describe("createCoreUser — Commerce-only vs GYM", () => {
  it("tenant Commerce-only (sin gym_id) -> crea User con gym_id null, tenant_id requerido", async () => {
    const createMock = vi.fn().mockResolvedValue({ id: "new-user-commerce" });
    const fakeDb = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ user: { create: createMock } })),
    } as never;

    const result = await createCoreUser(
      "tenant-commerce",
      { email: "admin@commerce.example", first_name: "A", last_name: "User", role: "super_admin", password: "synthetic-pass-123" },
      FAKE_CTX,
      fakeDb,
    );

    expect(result.success).toBe(true);
    const data = createMock.mock.calls[0][0].data;
    expect(data.tenant_id).toBe("tenant-commerce");
    expect(data.gym_id).toBeNull();
  });

  it("tenant GYM (gym_id resuelto por el caller vía resolveOptionalGymForTenant) -> crea User con gym_id poblado", async () => {
    const createMock = vi.fn().mockResolvedValue({ id: "new-user-gym" });
    const fakeDb = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ user: { create: createMock } })),
    } as never;

    const result = await createCoreUser(
      "tenant-gym",
      { email: "admin@gym.example", first_name: "A", last_name: "User", role: "super_admin", password: "synthetic-pass-123", gym_id: "gym-1" },
      FAKE_CTX,
      fakeDb,
    );

    expect(result.success).toBe(true);
    const data = createMock.mock.calls[0][0].data;
    expect(data.tenant_id).toBe("tenant-gym");
    expect(data.gym_id).toBe("gym-1");
  });
});

describe("updateCoreUser / toggleCoreUserStatus — aislamiento cross-tenant", () => {
  it("2. userId pertenece a OTRO tenant -> updateCoreUser denegado (findFirst con tenant_id no lo encuentra)", async () => {
    const updateSpy = vi.fn();
    const findFirst = vi.fn().mockResolvedValue(null);
    const fakeDb = {
      user: { findFirst, update: updateSpy },
    } as never;

    const result = await updateCoreUser(
      "user-of-tenant-B",
      "tenant-A",
      { first_name: "Hacked" },
      fakeDb,
    );

    expect(result.success).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "user-of-tenant-B", tenant_id: "tenant-A" },
      select: { id: true, role: true, email: true },
    });
  });

  it("2. userId pertenece a OTRO tenant -> toggleCoreUserStatus denegado, nunca cambia status", async () => {
    const updateSpy = vi.fn();
    const fakeDb = {
      user: { findFirst: vi.fn().mockResolvedValue(null), update: updateSpy },
    } as never;

    const result = await toggleCoreUserStatus("user-of-tenant-B", "caller-1", "tenant-A", FAKE_CTX, fakeDb);

    expect(result.success).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("usuario propio del tenant -> toggleCoreUserStatus procede normalmente", async () => {
    const updateSpy = vi.fn().mockResolvedValue({});
    const fakeDb = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: "user-A1", status: "active" }),
        update: updateSpy,
      },
    } as never;

    const result = await toggleCoreUserStatus("user-A1", "caller-1", "tenant-A", FAKE_CTX, fakeDb);

    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});
