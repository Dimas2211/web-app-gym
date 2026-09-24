// ─────────────────────────────────────────────────────────────────
// platform/actions — shared-runtime-target-admin.action.test.ts
//
// SHARED-PILOT-4C-B0 / B0.1. Cubre create / list / test connection / toggle / update
// de PlatformSharedRuntimeTarget. Usa cifrado real (encryption.ts) y
// el builder real de URL; solo se mockean prisma (control plane),
// guards y el PrismaClient temporal hacia la runtime DB.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireSuperAdminMock = vi.fn();
vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: (...args: unknown[]) => requireSuperAdminMock(...args),
}));

const db = vi.hoisted(() => ({
  platformSharedRuntimeTarget: {
    findUnique: vi.fn(),
    findMany:   vi.fn(),
    create:     vi.fn(),
    update:     vi.fn(),
  },
  // Cualquier acceso a organizaciones durante create/test es un bug
  platformOrganization: {
    findUnique: vi.fn(),
    findMany:   vi.fn(),
    update:     vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

const runtime = vi.hoisted(() => ({
  urls:       [] as string[],
  queries:    [] as string[],
  fail:       null as Error | null,
  disconnect: vi.fn(),
}));
vi.mock("../lib/client-prisma", () => ({
  withTemporaryPrismaClient: async (
    url: string,
    cb: (client: unknown) => Promise<unknown>,
  ) => {
    runtime.urls.push(url);
    const client = {
      $queryRaw: async (strings: TemplateStringsArray) => {
        runtime.queries.push(strings.join("?"));
        if (runtime.fail) throw runtime.fail;
        return [{ "?column?": 1 }];
      },
    };
    try {
      return await cb(client);
    } finally {
      runtime.disconnect();
    }
  },
}));

import { createSharedRuntimeTargetAction } from "./create-shared-runtime-target.action";
import { testSharedRuntimeTargetConnectionAction } from "./test-shared-runtime-target-connection.action";
import { setSharedRuntimeTargetActiveAction } from "./set-shared-runtime-target-active.action";
import { updateSharedRuntimeTargetAction } from "./update-shared-runtime-target.action";
import { listSharedRuntimeTargets } from "../queries/list-shared-runtime-targets";
import { encryptText, decryptText } from "@/lib/security/encryption";

const SECRET = "S3cr3t-P@ss:word/with@chars";
const TARGET_ID = "target-1";

function formData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const values: Record<string, string> = {
    label:       "Zolvi Shared Test",
    environment: "PRODUCTION",
    provider:    "SUPABASE",
    db_host:     "db.example.com",
    db_port:     "5432",
    db_name:     "zolvi_shared",
    db_user:     "zolvi_app",
    password:    SECRET,
    ssl_mode:    "REQUIRE",
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

function storedTarget() {
  return {
    id:                 TARGET_ID,
    db_host:            "db.example.com",
    db_port:            5432,
    db_name:            "zolvi_shared",
    db_user:            "zolvi_app",
    encrypted_password: encryptText(SECRET),
    ssl_mode:           "REQUIRE",
  };
}

function expectNoOrganizationAccess() {
  for (const fn of Object.values(db.platformOrganization)) {
    expect(fn).not.toHaveBeenCalled();
  }
}

const ORIGINAL_KEY = process.env.PLATFORM_ENCRYPTION_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  requireSuperAdminMock.mockResolvedValue({ id: "super-admin-1" });
  runtime.urls = [];
  runtime.queries = [];
  runtime.fail = null;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.PLATFORM_ENCRYPTION_KEY;
  else process.env.PLATFORM_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("createSharedRuntimeTargetAction", () => {
  it("cifra el password — nunca se persiste en claro", async () => {
    db.platformSharedRuntimeTarget.findUnique.mockResolvedValue(null);
    db.platformSharedRuntimeTarget.create.mockResolvedValue({ id: TARGET_ID });

    const result = await createSharedRuntimeTargetAction(undefined, formData());

    expect(result).toBeUndefined();
    expect(requireSuperAdminMock).toHaveBeenCalledOnce();
    expect(db.platformSharedRuntimeTarget.create).toHaveBeenCalledOnce();

    const { data } = db.platformSharedRuntimeTarget.create.mock.calls[0][0];
    expect(data).not.toHaveProperty("password");
    expect(data.encrypted_password).not.toBe(SECRET);
    expect(JSON.stringify(data)).not.toContain(SECRET);
    expect(decryptText(data.encrypted_password)).toBe(SECRET);
    expect(data.is_active).toBe(true);
    expect(data.created_by).toBe("super-admin-1");
  });

  it("no asigna organizaciones al crear", async () => {
    db.platformSharedRuntimeTarget.findUnique.mockResolvedValue(null);
    db.platformSharedRuntimeTarget.create.mockResolvedValue({ id: TARGET_ID });

    await createSharedRuntimeTargetAction(undefined, formData());

    const { data } = db.platformSharedRuntimeTarget.create.mock.calls[0][0];
    expect(data).not.toHaveProperty("organizations");
    expectNoOrganizationAccess();
  });

  it("falla cerrado sin PLATFORM_ENCRYPTION_KEY y sin escribir", async () => {
    delete process.env.PLATFORM_ENCRYPTION_KEY;

    const result = await createSharedRuntimeTargetAction(undefined, formData());

    expect(result?.error).toBeTruthy();
    expect(result?.error).not.toContain(SECRET);
    expect(db.platformSharedRuntimeTarget.create).not.toHaveBeenCalled();
  });

  it("errores de validación no devuelven el password", async () => {
    const result = await createSharedRuntimeTargetAction(undefined, formData({ db_host: "" }));

    expect(result?.errors?.db_host).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(db.platformSharedRuntimeTarget.create).not.toHaveBeenCalled();
  });

  it("rechaza label duplicado", async () => {
    db.platformSharedRuntimeTarget.findUnique.mockResolvedValue({ id: "other" });

    const result = await createSharedRuntimeTargetAction(undefined, formData());

    expect(result?.errors?.label).toBeTruthy();
    expect(db.platformSharedRuntimeTarget.create).not.toHaveBeenCalled();
  });
});

describe("listSharedRuntimeTargets", () => {
  it("nunca selecciona ni devuelve encrypted_password", async () => {
    db.platformSharedRuntimeTarget.findMany.mockResolvedValue([
      {
        id: TARGET_ID, label: "Zolvi Shared Test", environment: "PRODUCTION",
        provider: "SUPABASE", db_host: "db.example.com", db_port: 5432,
        db_name: "zolvi_shared", db_user: "zolvi_app", ssl_mode: "REQUIRE",
        is_active: true, last_tested_at: null, last_test_status: "UNTESTED",
        last_test_message: null, created_at: new Date(), updated_at: new Date(),
        _count: { organizations: 0 },
      },
    ]);

    const items = await listSharedRuntimeTargets({});

    const { select } = db.platformSharedRuntimeTarget.findMany.mock.calls[0][0];
    expect(select).not.toHaveProperty("encrypted_password");
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveProperty("encrypted_password");
    expect(items[0]).not.toHaveProperty("password");
    expect(items[0]).toMatchObject({
      db_user: "zolvi_app", ssl_mode: "REQUIRE", organizationCount: 0,
    });
  });
});

describe("testSharedRuntimeTargetConnectionAction", () => {
  it("SUCCESS: ejecuta solo SELECT 1 y persiste last_test_status SUCCESS", async () => {
    db.platformSharedRuntimeTarget.findUnique.mockResolvedValue(storedTarget());

    const result = await testSharedRuntimeTargetConnectionAction(TARGET_ID);

    expect(result.success).toBe(true);
    expect(result.message).not.toContain(SECRET);
    expect(runtime.queries).toEqual(["SELECT 1"]);
    expect(runtime.disconnect).toHaveBeenCalledOnce();
    // La URL se construyó en memoria con el password descifrado
    expect(runtime.urls[0]).toContain(encodeURIComponent(SECRET));

    expect(db.platformSharedRuntimeTarget.update).toHaveBeenCalledOnce();
    const upd = db.platformSharedRuntimeTarget.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: TARGET_ID });
    expect(upd.data.last_test_status).toBe("SUCCESS");
    expect(upd.data.last_tested_at).toBeInstanceOf(Date);
    expect(Object.keys(upd.data).sort()).toEqual(
      ["last_test_message", "last_test_status", "last_tested_at"],
    );
    expect(JSON.stringify(upd)).not.toContain(SECRET);
    expectNoOrganizationAccess();
  });

  it("FAILED: mensaje sanitizado y last_test_status FAILED", async () => {
    db.platformSharedRuntimeTarget.findUnique.mockResolvedValue(storedTarget());
    runtime.fail = new Error(
      `Can't reach postgresql://zolvi_app:${SECRET}@db.example.com:5432/zolvi_shared password=${SECRET}`,
    );

    const result = await testSharedRuntimeTargetConnectionAction(TARGET_ID);

    expect(result.success).toBe(false);
    expect(result.message).not.toContain(SECRET);
    expect(result.message).toContain("[connection-string-redacted]");
    expect(runtime.disconnect).toHaveBeenCalledOnce();

    const upd = db.platformSharedRuntimeTarget.update.mock.calls[0][0];
    expect(upd.data.last_test_status).toBe("FAILED");
    expect(upd.data.last_test_message).not.toContain(SECRET);
    expectNoOrganizationAccess();
  });

  it("target inexistente → fail closed sin conectar ni escribir", async () => {
    db.platformSharedRuntimeTarget.findUnique.mockResolvedValue(null);

    const result = await testSharedRuntimeTargetConnectionAction("missing");

    expect(result.success).toBe(false);
    expect(runtime.urls).toHaveLength(0);
    expect(db.platformSharedRuntimeTarget.update).not.toHaveBeenCalled();
  });

  it("id vacío → fail closed", async () => {
    const result = await testSharedRuntimeTargetConnectionAction("");

    expect(result.success).toBe(false);
    expect(db.platformSharedRuntimeTarget.findUnique).not.toHaveBeenCalled();
  });

  it("sin PLATFORM_ENCRYPTION_KEY → fail closed sin leer secret", async () => {
    delete process.env.PLATFORM_ENCRYPTION_KEY;

    const result = await testSharedRuntimeTargetConnectionAction(TARGET_ID);

    expect(result.success).toBe(false);
    expect(db.platformSharedRuntimeTarget.findUnique).not.toHaveBeenCalled();
    expect(runtime.urls).toHaveLength(0);
    expect(db.platformSharedRuntimeTarget.update).not.toHaveBeenCalled();
  });

  it("requiere super_admin antes de cualquier acceso", async () => {
    requireSuperAdminMock.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(testSharedRuntimeTargetConnectionAction(TARGET_ID)).rejects.toThrow();
    expect(db.platformSharedRuntimeTarget.findUnique).not.toHaveBeenCalled();
  });
});

describe("setSharedRuntimeTargetActiveAction", () => {
  it("activa/desactiva solo is_active de un target existente", async () => {
    db.platformSharedRuntimeTarget.findUnique.mockResolvedValue({ id: TARGET_ID });

    expect(await setSharedRuntimeTargetActiveAction(TARGET_ID, false)).toBeUndefined();
    expect(await setSharedRuntimeTargetActiveAction(TARGET_ID, true)).toBeUndefined();

    expect(db.platformSharedRuntimeTarget.update.mock.calls).toEqual([
      [{ where: { id: TARGET_ID }, data: { is_active: false } }],
      [{ where: { id: TARGET_ID }, data: { is_active: true } }],
    ]);
    expectNoOrganizationAccess();
  });

  it("target inexistente → error sin escribir", async () => {
    db.platformSharedRuntimeTarget.findUnique.mockResolvedValue(null);

    const result = await setSharedRuntimeTargetActiveAction("missing", false);

    expect(result?.error).toBeTruthy();
    expect(db.platformSharedRuntimeTarget.update).not.toHaveBeenCalled();
  });
});

describe("updateSharedRuntimeTargetAction", () => {
  const NEW_SECRET = "N3w-S3cr3t@pass";

  function existingRow() {
    return {
      id: TARGET_ID, db_host: "db.example.com", db_port: 5432,
      db_name: "zolvi_shared", db_user: "zolvi_app", ssl_mode: "REQUIRE",
    };
  }

  function mockExisting(labelOwner: string | null = TARGET_ID) {
    db.platformSharedRuntimeTarget.findUnique.mockImplementation(
      async ({ where }: { where: { id?: string; label?: string } }) => {
        if (where.id) return where.id === TARGET_ID ? existingRow() : null;
        return labelOwner ? { id: labelOwner } : null;
      },
    );
  }

  it("password vacío conserva encrypted_password actual", async () => {
    mockExisting();

    const result = await updateSharedRuntimeTargetAction(
      TARGET_ID, undefined, formData({ password: "", environment: "STAGING" }),
    );

    expect(result).toBeUndefined();
    const upd = db.platformSharedRuntimeTarget.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: TARGET_ID });
    expect(upd.data).not.toHaveProperty("encrypted_password");
    expect(upd.data).not.toHaveProperty("password");
    expect(upd.data.environment).toBe("STAGING");
    expect(upd.data.updated_by).toBe("super-admin-1");
    // Sin cambios de conexión: resultado del test previo se conserva
    expect(upd.data).not.toHaveProperty("last_test_status");
  });

  it("password vacío no requiere PLATFORM_ENCRYPTION_KEY", async () => {
    mockExisting();
    delete process.env.PLATFORM_ENCRYPTION_KEY;

    const result = await updateSharedRuntimeTargetAction(TARGET_ID, undefined, formData({ password: "" }));

    expect(result).toBeUndefined();
    expect(db.platformSharedRuntimeTarget.update).toHaveBeenCalledOnce();
  });

  it("password nuevo se cifra y reemplaza", async () => {
    mockExisting();

    const result = await updateSharedRuntimeTargetAction(
      TARGET_ID, undefined, formData({ password: NEW_SECRET }),
    );

    expect(result).toBeUndefined();
    const { data } = db.platformSharedRuntimeTarget.update.mock.calls[0][0];
    expect(data).not.toHaveProperty("password");
    expect(JSON.stringify(data)).not.toContain(NEW_SECRET);
    expect(decryptText(data.encrypted_password)).toBe(NEW_SECRET);
    expect(data.last_test_status).toBe("UNTESTED");
  });

  it("password nuevo sin PLATFORM_ENCRYPTION_KEY → fail closed", async () => {
    mockExisting();
    delete process.env.PLATFORM_ENCRYPTION_KEY;

    const result = await updateSharedRuntimeTargetAction(
      TARGET_ID, undefined, formData({ password: NEW_SECRET }),
    );

    expect(result?.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain(NEW_SECRET);
    expect(db.platformSharedRuntimeTarget.update).not.toHaveBeenCalled();
  });

  it("cambio de db_port 5432 → 6543 permitido y resetea el último test", async () => {
    mockExisting();

    const result = await updateSharedRuntimeTargetAction(
      TARGET_ID, undefined, formData({ password: "", db_port: "6543" }),
    );

    expect(result).toBeUndefined();
    const { data } = db.platformSharedRuntimeTarget.update.mock.calls[0][0];
    expect(data.db_port).toBe(6543);
    expect(data).not.toHaveProperty("encrypted_password");
    expect(data.last_test_status).toBe("UNTESTED");
    expect(data.last_tested_at).toBeNull();
    expect(data.last_test_message).toBeNull();
  });

  it("target inexistente → fail closed sin escribir", async () => {
    mockExisting();

    const result = await updateSharedRuntimeTargetAction("missing", undefined, formData());

    expect(result?.error).toBeTruthy();
    expect(db.platformSharedRuntimeTarget.update).not.toHaveBeenCalled();
  });

  it("label duplicado de otro target → rechazado", async () => {
    mockExisting("other-target");

    const result = await updateSharedRuntimeTargetAction(
      TARGET_ID, undefined, formData({ label: "Otro Shared" }),
    );

    expect(result?.errors?.label).toBeTruthy();
    expect(db.platformSharedRuntimeTarget.update).not.toHaveBeenCalled();
  });

  it("errores de validación no devuelven el password", async () => {
    mockExisting();

    const result = await updateSharedRuntimeTargetAction(
      TARGET_ID, undefined, formData({ db_host: "", password: NEW_SECRET }),
    );

    expect(result?.errors?.db_host).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain(NEW_SECRET);
    expect(db.platformSharedRuntimeTarget.update).not.toHaveBeenCalled();
  });

  it("no toca organizaciones ni is_active", async () => {
    mockExisting();

    await updateSharedRuntimeTargetAction(TARGET_ID, undefined, formData({ db_port: "6543" }));

    const { data } = db.platformSharedRuntimeTarget.update.mock.calls[0][0];
    expect(data).not.toHaveProperty("organizations");
    expect(data).not.toHaveProperty("is_active");
    expectNoOrganizationAccess();
  });

  it("requiere super_admin antes de cualquier acceso", async () => {
    requireSuperAdminMock.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(updateSharedRuntimeTargetAction(TARGET_ID, undefined, formData())).rejects.toThrow();
    expect(db.platformSharedRuntimeTarget.findUnique).not.toHaveBeenCalled();
  });
});
