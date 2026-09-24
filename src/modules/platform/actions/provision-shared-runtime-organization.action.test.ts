// ─────────────────────────────────────────────────────────────────
// platform/actions — provision-shared-runtime-organization.action.test.ts
//
// SHARED-PILOT-4A / 4B. Idempotencia distribuida Control Plane ↔ Runtime.
//
// Usa DOS bases en memoria con transacciones/rollback/unique reales
// (provisioning-test-harness.ts) y el motor provisionRuntimeTenant REAL
// — no mockea "success twice". Cada escenario de la failure matrix
// A–I simula el boundary exacto y verifica conteos de filas.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createControlPlaneDb,
  createRuntimeDb,
  type InMemoryDb,
} from "../lib/provisioning/provisioning-test-harness";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireSuperAdminMock = vi.fn();
vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: (...args: unknown[]) => requireSuperAdminMock(...args),
}));

const state = vi.hoisted(() => ({
  cp: null as unknown as { client: Record<string, unknown> },
  runtimes: {} as Record<string, { client: Record<string, unknown> }>,
  sharedTargetActive: true,
  dedicatedProfileId: null as string | null,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get: (_t, prop: string) => state.cp.client[prop] }),
}));

const errorClasses = vi.hoisted(() => ({
  ActiveProfileNotFoundError:       class extends Error {},
  OrganizationNotFoundError:        class extends Error {},
  ProfileConnectionInvalidError:    class extends Error {},
  RuntimeDatabaseUnreachableError:  class extends Error {},
  SharedRuntimeTargetInactiveError: class extends Error {},
  SharedRuntimeTargetNotFoundError: class extends Error {},
}));

// Router fake con la misma semántica que withRuntimePrismaForProvisioning:
// resuelve target por organización (shared primero, dedicated después),
// falla cerrado si el target está inactivo, y envuelve cualquier error
// del callback como RuntimeDatabaseUnreachableError.
vi.mock("../runtime/runtime-database-router", () => ({
  ...errorClasses,
  withRuntimePrismaForProvisioning: async (
    organizationId: string,
    cb: (client: unknown, profileId: string) => Promise<unknown>,
  ) => {
    const org = (state.cp as unknown as InMemoryDb).tables.platformOrganization.find((o) => o.id === organizationId);
    if (!org) throw new errorClasses.OrganizationNotFoundError(organizationId);
    let profileId: string;
    if (org.shared_runtime_target_id) {
      if (!state.sharedTargetActive) throw new errorClasses.SharedRuntimeTargetInactiveError("inactive");
      profileId = org.shared_runtime_target_id as string;
    } else {
      if (!state.dedicatedProfileId) throw new errorClasses.ActiveProfileNotFoundError(organizationId);
      profileId = state.dedicatedProfileId;
    }
    const runtime = state.runtimes[profileId];
    try {
      return await cb(runtime.client, profileId);
    } catch (err) {
      throw new errorClasses.RuntimeDatabaseUnreachableError(String(err));
    }
  },
}));

import { provisionSharedRuntimeOrganizationAction } from "./provision-shared-runtime-organization.action";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ORG_ID = "22222222-2222-2222-2222-222222222222";
const SHARED_TARGET = "shared-target-1";
const SHARED_TARGET_2 = "shared-target-2";

const ADMIN = {
  email: "admin@cliente.com",
  password: "synthetic-pass-123",
  first_name: "Ana",
  last_name: "Admin",
};

const INPUT = {
  mode: "COMMERCE_ONLY" as const,
  organizationId: ORG_ID,
  tenantName: "Cliente Uno",
  tenantSlug: "cliente-uno",
  locationName: "Casa Matriz",
  admin: ADMIN,
};

let cp: InMemoryDb;
let runtime: InMemoryDb;

function runtimeCounts(db: InMemoryDb = runtime) {
  return {
    tenants:   db.count("runtimeTenant"),
    gyms:      db.count("gym"),
    locations: db.count("branch"),
    admins:    db.count("user"),
    receipts:  db.count("runtimeProvisioningReceipt"),
  };
}

const ONE_SET = { tenants: 1, gyms: 0, locations: 1, admins: 1, receipts: 1 };
const EMPTY = { tenants: 0, gyms: 0, locations: 0, admins: 0, receipts: 0 };

const org = (id = ORG_ID) => cp.tables.platformOrganization.find((o) => o.id === id)!;
const operations = () => cp.tables.platformRuntimeProvisioningOperation;
const logActions = () => cp.tables.platformDeploymentLog.map((l) => l.action);

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdminMock.mockResolvedValue({ id: "admin-session-1", role: "super_admin" });

  cp = createControlPlaneDb();
  runtime = createRuntimeDb();
  state.cp = cp as unknown as { client: Record<string, unknown> };
  state.runtimes = { [SHARED_TARGET]: runtime as never };
  state.sharedTargetActive = true;
  state.dedicatedProfileId = null;

  cp.seed("platformOrganization", { id: ORG_ID, name: "Cliente Uno", shared_runtime_target_id: SHARED_TARGET });
});

describe("provisioning — flujo normal", () => {
  it("COMMERCE_ONLY: crea tenant sin Gym, bindea, operación COMPLETED, provisioning_status PROVISIONED", async () => {
    const result = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(result.success).toBe(true);
    expect(result.gymId).toBeNull();
    expect(result.alreadyProvisioned).toBe(false);
    expect(runtimeCounts()).toEqual(ONE_SET);

    expect(org().tenant_id).toBe(result.tenantId);
    expect(org().provisioning_status).toBe("PROVISIONED");

    expect(operations()).toHaveLength(1);
    expect(operations()[0]).toMatchObject({
      status: "COMPLETED",
      mode: "COMMERCE_ONLY",
      runtime_target_kind: "SHARED",
      runtime_target_id: SHARED_TARGET,
      result_tenant_id: result.tenantId,
      result_location_id: result.locationId,
      result_admin_user_id: result.adminUserId,
      attempt_count: 1,
    });
    // la key del CP es la que quedó en el receipt runtime
    expect(runtime.tables.runtimeProvisioningReceipt[0].idempotency_key).toBe(operations()[0].idempotency_key);

    expect(logActions()).toEqual(expect.arrayContaining(["PROVISION_RUNTIME_TENANT_CREATED", "BIND_TENANT"]));
  });

  it("nunca persiste ni devuelve password / secretos", async () => {
    const result = await provisionSharedRuntimeOrganizationAction(INPUT);

    const everything = JSON.stringify({ result, cp: cp.tables, receipts: runtime.tables.runtimeProvisioningReceipt });
    expect(everything).not.toContain(ADMIN.password);
    expect(Object.keys(result)).not.toContain("password");
  });

  it("idempotency key: server-generated (UUID aleatorio), no aceptada desde el input", async () => {
    await provisionSharedRuntimeOrganizationAction({
      ...INPUT,
      // Un browser malicioso intentando imponer la key de otra operación:
      ...({ idempotencyKey: "key-robada" } as object),
    } as typeof INPUT);

    const key = operations()[0].idempotency_key as string;
    expect(key).not.toBe("key-robada");
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rechaza si no hay super_admin, sin tocar nada", async () => {
    requireSuperAdminMock.mockRejectedValue(new Error("forbidden"));
    await expect(provisionSharedRuntimeOrganizationAction(INPUT)).rejects.toThrow();
    expect(operations()).toHaveLength(0);
    expect(runtimeCounts()).toEqual(EMPTY);
  });
});

describe("failure matrix A–I", () => {
  it("A — falla al crear la operación en Control Plane → 0 escrituras runtime; retry crea la operación normalmente", async () => {
    cp.failNext("platformRuntimeProvisioningOperation", "create");

    const failed = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(failed.success).toBe(false);
    expect(operations()).toHaveLength(0);
    expect(runtimeCounts()).toEqual(EMPTY);

    const retry = await provisionSharedRuntimeOrganizationAction(INPUT);
    expect(retry.success).toBe(true);
    expect(operations()).toHaveLength(1);
    expect(runtimeCounts()).toEqual(ONE_SET);
  });

  it("B — operación existe, falla antes de escribir en runtime → runtime vacío; retry reutiliza la MISMA key", async () => {
    runtime.failNext("$tx", "begin");

    const failed = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(failed.success).toBe(false);
    expect(runtimeCounts()).toEqual(EMPTY);
    expect(operations()[0].status).toBe("FAILED");
    const key = operations()[0].idempotency_key;

    const retry = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(retry.success).toBe(true);
    expect(operations()).toHaveLength(1);
    expect(operations()[0].idempotency_key).toBe(key);
    expect(operations()[0].attempt_count).toBe(2);
    expect(runtime.tables.runtimeProvisioningReceipt[0].idempotency_key).toBe(key);
  });

  it("C — falla dentro de la transacción runtime → rollback completo; retry con la misma key crea todo", async () => {
    runtime.failNext("branch", "create");

    const failed = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(failed.success).toBe(false);
    expect(runtimeCounts()).toEqual(EMPTY);
    expect(org().tenant_id).toBeNull();

    const retry = await provisionSharedRuntimeOrganizationAction(INPUT);
    expect(retry.success).toBe(true);
    expect(runtimeCounts()).toEqual(ONE_SET);
  });

  it("D — runtime COMMIT ok y el proceso cae inmediatamente después → retry: mismos IDs, bind completo, 0 duplicados", async () => {
    // El boundary exacto: justo después del commit runtime, el Control
    // Plane deja de ser alcanzable (proceso caído). Ninguna escritura CP
    // posterior — ni bind, ni COMPLETED, ni log, ni markFailed — ocurre.
    runtime.afterCommit = () => {
      cp.down = true;
    };

    const crashed = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(crashed.success).toBe(false);
    // Estado real post-crash: runtime completo + receipt; CP sin resultado.
    expect(runtimeCounts()).toEqual(ONE_SET);
    cp.down = false;
    runtime.afterCommit = null;
    expect(org().tenant_id).toBeNull();
    expect(operations()[0].status).toBe("RUNNING");
    expect(operations()[0].result_tenant_id).toBeNull();

    const snapshot = {
      tenantId:    runtime.tables.runtimeTenant[0].id,
      locationId:  runtime.tables.branch[0].id,
      adminUserId: runtime.tables.user[0].id,
    };

    // El operador vuelve a pulsar "Provisionar" (con el mismo formulario).
    const retry = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(retry.success).toBe(true);
    expect(retry.tenantId).toBe(snapshot.tenantId);
    expect(retry.locationId).toBe(snapshot.locationId);
    expect(retry.adminUserId).toBe(snapshot.adminUserId);

    // RuntimeTenant +1, Location +1, User +1, Receipt +1 — solamente.
    expect(runtimeCounts()).toEqual(ONE_SET);
    expect(operations()).toHaveLength(1);
    expect(operations()[0]).toMatchObject({ status: "COMPLETED", result_tenant_id: snapshot.tenantId });
    expect(org().tenant_id).toBe(snapshot.tenantId);
  });

  it("D' — la transacción de finalización CP lanza excepción (no crash) → FAILED sanitizado; retry recupera por receipt", async () => {
    cp.failNext("platformOrganization", "updateMany"); // el bind, dentro de la transacción de finalización
    const second = await provisionSharedRuntimeOrganizationAction(INPUT);
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/Reintenta: se reutilizará el mismo tenant/);
    expect(second.error).not.toContain("injected");
    expect(runtimeCounts()).toEqual(ONE_SET);
    expect(org().tenant_id).toBeNull(); // la finalización hizo rollback completo
    expect(operations()[0].status).toBe("FAILED");

    const third = await provisionSharedRuntimeOrganizationAction(INPUT);
    expect(third.success).toBe(true);
    expect(third.tenantId).toBe(runtime.tables.runtimeTenant[0].id);
    expect(runtimeCounts()).toEqual(ONE_SET);
  });

  it("E — tenant_id ya bindeado al tenant correcto pero operación no COMPLETED → completa sin error ni duplicados", async () => {
    runtime.afterCommit = () => {
      cp.down = true;
    };
    await provisionSharedRuntimeOrganizationAction(INPUT);
    cp.down = false;
    runtime.afterCommit = null;

    // Estado E: el bind quedó hecho (p.ej. por Tenant Binding manual) pero
    // la operación sigue sin COMPLETED.
    const tenantId = runtime.tables.runtimeTenant[0].id;
    org().tenant_id = tenantId;
    expect(operations()[0].status).toBe("RUNNING");

    const retry = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(retry.success).toBe(true);
    expect(retry.tenantId).toBe(tenantId);
    expect(operations()[0].status).toBe("COMPLETED");
    expect(runtimeCounts()).toEqual(ONE_SET);
    // no se re-bindeó (ya estaba): sin log BIND_TENANT nuevo
    expect(logActions().filter((a) => a === "BIND_TENANT")).toHaveLength(0);
  });

  it("E' — tenant_id bindeado pero sin receipt en runtime → fail closed, NO crea un segundo tenant", async () => {
    runtime.failNext("$tx", "begin");
    await provisionSharedRuntimeOrganizationAction(INPUT); // deja operación FAILED sin runtime
    org().tenant_id = "tenant-bindeado-a-mano";

    const retry = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(retry.success).toBe(false);
    expect(runtimeCounts()).toEqual(EMPTY);
    expect(org().tenant_id).toBe("tenant-bindeado-a-mano");
  });

  it("F — operación COMPLETED y el browser pierde la respuesta → respuesta idempotente, 0 escrituras", async () => {
    const first = await provisionSharedRuntimeOrganizationAction(INPUT);
    const cpLogsBefore = cp.tables.platformDeploymentLog.length;
    const opBefore = { ...operations()[0] };

    const again = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(again).toMatchObject({
      success: true,
      alreadyProvisioned: true,
      tenantId: first.tenantId,
      locationId: first.locationId,
      adminUserId: first.adminUserId,
    });
    expect(runtimeCounts()).toEqual(ONE_SET);
    expect(cp.tables.platformDeploymentLog).toHaveLength(cpLogsBefore);
    expect(operations()[0]).toEqual(opBefore);
  });

  it("G — slug pertenece a OTRO tenant/operación → fail closed, nunca asume ownership", async () => {
    // Otra organización ya provisionó "cliente-uno" en el mismo Shared Runtime.
    cp.seed("platformOrganization", { id: OTHER_ORG_ID, name: "Otra Org", shared_runtime_target_id: SHARED_TARGET });
    const other = await provisionSharedRuntimeOrganizationAction({ ...INPUT, organizationId: OTHER_ORG_ID });
    expect(other.success).toBe(true);

    const result = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ya pertenece a otro tenant/);
    expect(org().tenant_id).toBeNull();
    expect(runtimeCounts()).toEqual(ONE_SET); // solo el de la otra organización
    expect(operations().find((o) => o.organization_id === ORG_ID)?.status).toBe("FAILED");

    // Corrige el slug y reintenta: misma key, crea su propio tenant.
    const key = operations().find((o) => o.organization_id === ORG_ID)?.idempotency_key;
    const fixed = await provisionSharedRuntimeOrganizationAction({ ...INPUT, tenantSlug: "cliente-uno-b" });
    expect(fixed.success).toBe(true);
    expect(fixed.tenantId).not.toBe(other.tenantId);
    expect(runtime.count("runtimeProvisioningReceipt", { idempotency_key: key })).toBe(1);
  });

  it("H — mismo email admin ya existe en OTRO tenant del mismo Shared Runtime → válido", async () => {
    cp.seed("platformOrganization", { id: OTHER_ORG_ID, name: "Otra Org", shared_runtime_target_id: SHARED_TARGET });
    await provisionSharedRuntimeOrganizationAction({ ...INPUT, organizationId: OTHER_ORG_ID, tenantSlug: "otra" });

    const result = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(result.success).toBe(true);
    expect(runtime.count("user", { email: ADMIN.email })).toBe(2);
  });

  it("I — email/unique en conflicto dentro del tenant (no del receipt) → fail closed, rollback, sin receipt", async () => {
    const { Prisma } = await import("@prisma/client");
    runtime.failNext(
      "user",
      "create",
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed on (tenant_id,email)", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const result = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/identificadores únicos/);
    expect(runtimeCounts()).toEqual(EMPTY);
    expect(org().tenant_id).toBeNull();
  });
});

describe("fail closed — binding y target", () => {
  it("tenant_id existente distinto al del receipt → FAIL CLOSED, no reescribe binding", async () => {
    runtime.afterCommit = () => {
      cp.down = true;
    };
    await provisionSharedRuntimeOrganizationAction(INPUT);
    cp.down = false;
    runtime.afterCommit = null;
    org().tenant_id = "tenant-de-otro-lado";

    const retry = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(retry.success).toBe(false);
    expect(retry.error).toMatch(/vinculada a otro tenant/);
    expect(org().tenant_id).toBe("tenant-de-otro-lado");
    expect(operations()[0].status).toBe("FAILED");
    expect(runtimeCounts()).toEqual(ONE_SET);
  });

  it("operación COMPLETED pero la organización quedó vinculada a otro tenant → fail closed", async () => {
    await provisionSharedRuntimeOrganizationAction(INPUT);
    org().tenant_id = "tenant-cambiado";

    const again = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(again.success).toBe(false);
    expect(org().tenant_id).toBe("tenant-cambiado");
  });

  it("el tenant creado ya está vinculado a OTRA organización → fail closed", async () => {
    runtime.afterCommit = () => {
      cp.down = true;
    };
    await provisionSharedRuntimeOrganizationAction(INPUT);
    cp.down = false;
    runtime.afterCommit = null;
    cp.seed("platformOrganization", { id: OTHER_ORG_ID, name: "Ladrona", tenant_id: runtime.tables.runtimeTenant[0].id });

    const retry = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(retry.success).toBe(false);
    expect(retry.error).toMatch(/otra organización \(Ladrona\)/);
    expect(org().tenant_id).toBeNull();
  });

  it("runtime target reasignado después del primer intento → fail closed, no crea en la otra base", async () => {
    runtime.afterCommit = () => {
      cp.down = true;
    };
    await provisionSharedRuntimeOrganizationAction(INPUT);
    cp.down = false;
    runtime.afterCommit = null;

    const runtime2 = createRuntimeDb();
    state.runtimes[SHARED_TARGET_2] = runtime2 as never;
    org().shared_runtime_target_id = SHARED_TARGET_2;

    const retry = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(retry.success).toBe(false);
    expect(retry.error).toMatch(/runtime asignado a la organización cambió/);
    expect(runtimeCounts(runtime2)).toEqual(EMPTY);
    expect(runtimeCounts()).toEqual(ONE_SET);
  });

  it("Shared Runtime Target inactivo → fail closed con mensaje claro, runtime intacto", async () => {
    state.sharedTargetActive = false;

    const result = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Shared Runtime asignado .* inactivo/);
    expect(runtimeCounts()).toEqual(EMPTY);
    expect(operations()[0].status).toBe("FAILED");
  });

  it("organización sin perfil activo (dedicated) → fail closed con mensaje claro", async () => {
    org().shared_runtime_target_id = null;

    const result = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/perfil de base de datos activo/i);
    expect(logActions()).toContain("PROVISION_RUNTIME_TENANT_FAILED");
  });

  it("organización ya vinculada sin operación 4B (binding previo) → no-op, no llama al runtime", async () => {
    org().tenant_id = "tenant-ya-existente";

    const result = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(result).toEqual({ success: true, tenantId: "tenant-ya-existente", alreadyProvisioned: true });
    expect(operations()).toHaveLength(0);
    expect(runtimeCounts()).toEqual(EMPTY);
  });
});

describe("concurrencia", () => {
  it("dos requests simultáneos para la misma organización → exactamente 1 tenant/location/admin/receipt/operación", async () => {
    const [a, b] = await Promise.all([
      provisionSharedRuntimeOrganizationAction(INPUT),
      provisionSharedRuntimeOrganizationAction(INPUT),
    ]);

    expect(runtimeCounts()).toEqual(ONE_SET); // RUNTIME_TENANTS/LOCATIONS/ADMINS/RECEIPTS_CREATED = 1
    expect(operations()).toHaveLength(1); // PROVISIONING_OPERATIONS_EFFECTIVE = 1
    expect(operations()[0].status).toBe("COMPLETED");
    for (const r of [a, b].filter((r) => r.success)) {
      expect(r.tenantId).toBe(org().tenant_id);
    }
    expect([a, b].some((r) => r.success)).toBe(true);
    // Un único log de creación efectivo.
    expect(logActions().filter((x) => x === "PROVISION_RUNTIME_TENANT_CREATED")).toHaveLength(1);
  });

  it("tres requests simultáneos + crash de Control Plane tras el commit runtime → retry deja un único set de filas", async () => {
    runtime.afterCommit = () => {
      cp.down = true;
    };
    await Promise.all([
      provisionSharedRuntimeOrganizationAction(INPUT),
      provisionSharedRuntimeOrganizationAction(INPUT),
      provisionSharedRuntimeOrganizationAction(INPUT),
    ]);
    cp.down = false;
    runtime.afterCommit = null;
    const final = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(final.success).toBe(true);
    expect(runtimeCounts()).toEqual(ONE_SET);
    expect(operations()).toHaveLength(1);
  });
});

describe("regresiones", () => {
  it("Dedicated Runtime: mismo motor, target DEDICATED fijado, bind OK", async () => {
    org().shared_runtime_target_id = null;
    state.dedicatedProfileId = "dedicated-profile-1";
    const dedicatedRuntime = createRuntimeDb();
    state.runtimes["dedicated-profile-1"] = dedicatedRuntime as never;

    const result = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(result.success).toBe(true);
    expect(runtimeCounts(dedicatedRuntime)).toEqual(ONE_SET);
    expect(operations()[0]).toMatchObject({ runtime_target_kind: "DEDICATED", runtime_target_id: "dedicated-profile-1" });
    expect(org().tenant_id).toBe(result.tenantId);
  });

  it("GYM mode: crea extensión Gym; Commerce-only en la misma base sigue con Gym count = 0 para su tenant", async () => {
    cp.seed("platformOrganization", { id: OTHER_ORG_ID, name: "Gym Org", shared_runtime_target_id: SHARED_TARGET });
    const gym = await provisionSharedRuntimeOrganizationAction({
      ...INPUT,
      mode: "GYM",
      organizationId: OTHER_ORG_ID,
      tenantSlug: "gym-org",
      gymName: "Gym Org",
      gymSlug: "gym-org",
    });
    const commerce = await provisionSharedRuntimeOrganizationAction(INPUT);

    expect(gym.gymId).toBeTruthy();
    expect(commerce.gymId).toBeNull();
    expect(runtime.count("gym", { tenant_id: commerce.tenantId })).toBe(0);
    expect(runtime.count("gym")).toBe(1);
  });

  it("DEPLOYED no se degrada a PROVISIONED", async () => {
    org().provisioning_status = "DEPLOYED";
    await provisionSharedRuntimeOrganizationAction(INPUT);
    expect(org().provisioning_status).toBe("DEPLOYED");
  });
});
