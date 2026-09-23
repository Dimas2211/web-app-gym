// ─────────────────────────────────────────────────────────────────
// platform/actions — provision-shared-runtime-organization.action.test.ts
//
// SHARED-PILOT-4A / Gap A + Gap E + Gap C (idempotencia). Cubre:
// - COMMERCE_ONLY nunca crea Gym.
// - Tenant binding automático post-provisioning (sin adminKey).
// - Retry con tenant_id ya vinculado → no-op idempotente.
// - Retry con RuntimeTenant ya creado (log previo) pero bind pendiente
//   → reutiliza el resultado, no duplica RuntimeTenant/Location/Admin.
// - Solo super_admin.
// - Perfil inactivo/organización sin perfil → fail closed con mensaje
//   claro, sin filtrar detalles de conexión.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireSuperAdminMock = vi.fn();
vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: (...args: unknown[]) => requireSuperAdminMock(...args),
}));

const orgFindUniqueMock = vi.fn();
const orgFindFirstMock = vi.fn();
const orgUpdateMock = vi.fn();
const logFindFirstMock = vi.fn();
const logCreateMock = vi.fn();
const controlPlaneTransactionMock = vi.fn(async (ops: unknown[]) => Promise.all(ops));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    platformOrganization: {
      findUnique: (...args: unknown[]) => orgFindUniqueMock(...args),
      findFirst:  (...args: unknown[]) => orgFindFirstMock(...args),
      update:     (...args: unknown[]) => orgUpdateMock(...args),
    },
    platformDeploymentLog: {
      findFirst: (...args: unknown[]) => logFindFirstMock(...args),
      create:    (...args: unknown[]) => logCreateMock(...args),
    },
    $transaction: (ops: unknown[]) => controlPlaneTransactionMock(ops),
  },
}));

const withRuntimePrismaForProvisioningMock = vi.fn();
const errorClasses = vi.hoisted(() => ({
  FakeActiveProfileNotFoundError:      class extends Error {},
  FakeOrganizationNotFoundError:       class extends Error {},
  FakeProfileConnectionInvalidError:   class extends Error {},
  FakeRuntimeDatabaseUnreachableError: class extends Error {},
}));
vi.mock("../runtime/runtime-database-router", () => ({
  withRuntimePrismaForProvisioning: (...args: unknown[]) =>
    withRuntimePrismaForProvisioningMock(...args),
  ActiveProfileNotFoundError:       errorClasses.FakeActiveProfileNotFoundError,
  OrganizationNotFoundError:        errorClasses.FakeOrganizationNotFoundError,
  ProfileConnectionInvalidError:    errorClasses.FakeProfileConnectionInvalidError,
  RuntimeDatabaseUnreachableError:  errorClasses.FakeRuntimeDatabaseUnreachableError,
}));

import { provisionSharedRuntimeOrganizationAction } from "./provision-shared-runtime-organization.action";

const ADMIN = {
  email: "admin@cliente.com",
  password: "synthetic-pass-123",
  first_name: "Ana",
  last_name: "Admin",
};

const BASE_INPUT = {
  mode: "COMMERCE_ONLY" as const,
  organizationId: "11111111-1111-1111-1111-111111111111",
  tenantName: "Cliente Uno",
  tenantSlug: "cliente-uno",
  locationName: "Casa Matriz",
  admin: ADMIN,
};

/** Fake PrismaClient runtime — mismo patrón que provision-runtime-tenant.test.ts. */
function fakeRuntimeDb() {
  const tx = {
    runtimeTenant: { create: vi.fn().mockResolvedValue({ id: "tenant-new" }) },
    gym:           { create: vi.fn().mockResolvedValue({ id: "gym-new" }) },
    branch:        { create: vi.fn().mockResolvedValue({ id: "branch-new" }) },
    user:          { create: vi.fn().mockResolvedValue({ id: "admin-new" }) },
  };
  return { $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdminMock.mockResolvedValue({ id: "admin-session-1", role: "super_admin" });
  orgFindFirstMock.mockResolvedValue(null); // sin conflicto de tenant_id por defecto
  logFindFirstMock.mockResolvedValue(null); // sin log previo por defecto
});

describe("provisionSharedRuntimeOrganizationAction — creación COMMERCE_ONLY", () => {
  it("crea el tenant sin Gym y bindea tenant_id automáticamente, sin adminKey", async () => {
    orgFindUniqueMock.mockResolvedValue({ id: BASE_INPUT.organizationId, name: "Cliente Uno", tenant_id: null });
    withRuntimePrismaForProvisioningMock.mockImplementation(
      async (_orgId: string, cb: (client: unknown, profileId: string) => unknown) =>
        cb(fakeRuntimeDb(), "profile-1"),
    );

    const result = await provisionSharedRuntimeOrganizationAction(BASE_INPUT);

    expect(result.success).toBe(true);
    expect(result.gymId).toBeNull();
    expect(result.alreadyProvisioned).toBe(false);

    // bind automático: update de tenant_id sin exigir adminKey/confirmación
    expect(orgUpdateMock).toHaveBeenCalledWith({
      where: { id: BASE_INPUT.organizationId },
      data:  { tenant_id: result.tenantId },
    });

    // se registró el log de creación y el log de bind
    const loggedActions = logCreateMock.mock.calls.map((c) => c[0].data.action);
    expect(loggedActions).toContain("PROVISION_RUNTIME_TENANT_CREATED");

    // password nunca se persiste en el log
    const createdLogCall = logCreateMock.mock.calls.find(
      (c) => c[0].data.action === "PROVISION_RUNTIME_TENANT_CREATED",
    );
    expect(JSON.stringify(createdLogCall?.[0].data.metadata)).not.toContain(ADMIN.password);
  });

  it("rechaza si no hay super_admin", async () => {
    requireSuperAdminMock.mockRejectedValue(new Error("forbidden"));
    await expect(provisionSharedRuntimeOrganizationAction(BASE_INPUT)).rejects.toThrow();
    expect(orgFindUniqueMock).not.toHaveBeenCalled();
  });

  it("organización sin perfil activo → fail closed con mensaje claro, sin duplicar", async () => {
    orgFindUniqueMock.mockResolvedValue({ id: BASE_INPUT.organizationId, name: "Cliente Uno", tenant_id: null });
    withRuntimePrismaForProvisioningMock.mockRejectedValue(
      new errorClasses.FakeActiveProfileNotFoundError("no profile"),
    );

    const result = await provisionSharedRuntimeOrganizationAction(BASE_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/perfil de base de datos activo/i);
    expect(orgUpdateMock).not.toHaveBeenCalled();
    const failedLog = logCreateMock.mock.calls.find((c) => c[0].data.action === "PROVISION_RUNTIME_TENANT_FAILED");
    expect(failedLog).toBeTruthy();
  });
});

describe("provisionSharedRuntimeOrganizationAction — idempotencia / retry-safe", () => {
  it("organization.tenant_id ya existe → no-op, no vuelve a crear ni a llamar al runtime", async () => {
    orgFindUniqueMock.mockResolvedValue({
      id: BASE_INPUT.organizationId,
      name: "Cliente Uno",
      tenant_id: "tenant-ya-existente",
    });

    const result = await provisionSharedRuntimeOrganizationAction(BASE_INPUT);

    expect(result).toEqual({ success: true, tenantId: "tenant-ya-existente", alreadyProvisioned: true });
    expect(withRuntimePrismaForProvisioningMock).not.toHaveBeenCalled();
    expect(logCreateMock).not.toHaveBeenCalled();
  });

  it("RuntimeTenant ya creado en un intento previo (log CREATED/SUCCESS) pero bind pendiente → reutiliza y solo bindea", async () => {
    orgFindUniqueMock.mockResolvedValue({ id: BASE_INPUT.organizationId, name: "Cliente Uno", tenant_id: null });
    logFindFirstMock.mockResolvedValue({
      metadata: {
        tenantId: "tenant-from-prev-attempt",
        gymId: null,
        locationId: "location-from-prev-attempt",
        adminUserId: "admin-from-prev-attempt",
        mode: "COMMERCE_ONLY",
        profileId: "profile-1",
      },
    });

    const result = await provisionSharedRuntimeOrganizationAction(BASE_INPUT);

    expect(result.success).toBe(true);
    expect(result.tenantId).toBe("tenant-from-prev-attempt");
    // NO se volvió a invocar el motor de provisioning
    expect(withRuntimePrismaForProvisioningMock).not.toHaveBeenCalled();
    // Sí se bindeó
    expect(orgUpdateMock).toHaveBeenCalledWith({
      where: { id: BASE_INPUT.organizationId },
      data:  { tenant_id: "tenant-from-prev-attempt" },
    });
  });

  it("el tenant recuperado ya quedó tomado por OTRA organización → fail closed, no reescribe el binding", async () => {
    orgFindUniqueMock.mockResolvedValue({ id: BASE_INPUT.organizationId, name: "Cliente Uno", tenant_id: null });
    logFindFirstMock.mockResolvedValue({
      metadata: {
        tenantId: "tenant-conflictivo",
        gymId: null,
        locationId: "loc-1",
        adminUserId: "admin-1",
        mode: "COMMERCE_ONLY",
        profileId: "profile-1",
      },
    });
    orgFindFirstMock.mockResolvedValue({ id: "otra-org", name: "Otra Organización" });

    const result = await provisionSharedRuntimeOrganizationAction(BASE_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ya está vinculado a otra organización/i);
    expect(orgUpdateMock).not.toHaveBeenCalled();
  });
});
