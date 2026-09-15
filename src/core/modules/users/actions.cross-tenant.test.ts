// ─────────────────────────────────────────────────────────────────
// core/modules/users — actions.cross-tenant.test.ts
//
// FASE VI-D4 — ETAPA K/U/W/O. Certifica:
//   - aislamiento por tenant (findFirst con gym_id, nunca findUnique(id)
//     seguido de mutación sin validar pertenencia);
//   - unicidad de email evaluada SOLO contra `db` (misma email puede
//     existir independientemente en runtime A y runtime B);
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

describe("createCoreUser — unicidad de email SOLO en `db`, password hasheado", () => {
  it("9. email ya existe en runtime B -> irrelevante para runtime A (findUnique corre SOLO contra `db`)", async () => {
    // db de runtime A: el email NO existe ahí (aunque exista en B, que
    // nunca se consulta — no hay lookup global).
    const createMock = vi.fn().mockResolvedValue({ id: "new-user-A" });
    const fakeDbA = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
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

describe("updateCoreUser / toggleCoreUserStatus — aislamiento cross-tenant", () => {
  it("2. userId pertenece a OTRO tenant -> updateCoreUser denegado (findFirst con gym_id no lo encuentra)", async () => {
    const updateSpy = vi.fn();
    const fakeDb = {
      user: { findFirst: vi.fn().mockResolvedValue(null), update: updateSpy },
    } as never;

    const result = await updateCoreUser(
      "user-of-tenant-B",
      "tenant-A",
      { first_name: "Hacked" },
      fakeDb,
    );

    expect(result.success).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
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
