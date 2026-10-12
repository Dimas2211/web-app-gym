// ─────────────────────────────────────────────────────────────────
// clients — actions.test.ts
//
// PASO 6D: sesión runtime "Operar como cliente" activa (siempre solo
// lectura) debe bloquear cualquier write de clients.
//
// FASE VI-D7: migrado a requireOperationalContext() — el bloqueo de
// escritura bajo Support Session/readOnly ahora se certifica igual que
// en el resto de módulos migrados (Products/Customers/Suppliers/
// Branches), vía OperationalContextError con code "READ_ONLY", y todo
// el acceso a datos pasa por context.client (runtime-aware) en vez del
// Prisma global.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hash") } }));

vi.mock("@/lib/permissions/guards", () => ({
  requireClientManager: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  getSessionOrRedirect: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManageClient: vi.fn(() => true),
}));

const {
  clientUpdateSpy,
  clientFindFirstSpy,
  requireOperationalContextMock,
  disposeMock,
  FakeOperationalContextError,
} = vi.hoisted(() => {
  class FakeOperationalContextError extends Error {
    code: string;
    httpStatus: number;
    userMessage: string;
    constructor(code: string, userMessage: string, httpStatus: number) {
      super(userMessage);
      this.code = code;
      this.httpStatus = httpStatus;
      this.userMessage = userMessage;
    }
  }
  return {
    clientUpdateSpy: vi.fn(),
    clientFindFirstSpy: vi.fn(async () => ({ id: "client-1", status: "active", tenant_id: "tenant-1", branch_id: "loc-1" })),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

// updateCoreUser REAL (core) envuelto en spy: las actions del portal deben
// delegar en él la unicidad por tenant y el hash — se certifica el
// comportamiento extremo a extremo contra un fake DB en memoria.
const { updateCoreUserSpy } = vi.hoisted(() => ({ updateCoreUserSpy: vi.fn() }));
vi.mock("@/core/modules/users/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/modules/users/actions")>();
  updateCoreUserSpy.mockImplementation(actual.updateCoreUser);
  return { ...actual, updateCoreUser: updateCoreUserSpy };
});

import {
  toggleClientStatusAction,
  updateClientPortalEmailAction,
  resetClientPortalPasswordAction,
} from "./actions";
import { canManageClient } from "@/lib/permissions/guards";

function fakeHandle(overrides: Partial<{ role: string; tenantId: string }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: overrides.role ?? "super_admin", location_id: "loc-1" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: "loc-1",
      client: { client: { findFirst: clientFindFirstSpy, update: clientUpdateSpy } },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  clientUpdateSpy.mockReset();
  clientFindFirstSpy.mockClear();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('toggleClientStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("requireOperationalContext rechaza (READ_ONLY / Support Session) -> bloquea ANTES de tocar client.findFirst/update", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    await toggleClientStatusAction(fd({ id: "client-1" }));

    expect(clientFindFirstSpy).not.toHaveBeenCalled();
    expect(clientUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente, filtrado por tenant efectivo", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    await toggleClientStatusAction(fd({ id: "client-1" }));

    expect(clientFindFirstSpy).toHaveBeenCalledWith({
      where: { id: "client-1", tenant_id: "tenant-1" },
    });
    expect(clientUpdateSpy).toHaveBeenCalledTimes(1);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────
// Portal del cliente — cambio de correo / restablecimiento de contraseña
// ─────────────────────────────────────────────────────────────────

type FakeUser = {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  status: string;
  branch_id: string | null;
  gym_id: string | null;
  operational_code: string | null;
  qr_token: string | null;
  password_hash: string;
};
type FakeClient = {
  id: string;
  tenant_id: string;
  branch_id: string;
  user_id: string | null;
  email: string | null;
  status: string;
};
type Where = Record<string, unknown>;
type Select = Record<string, boolean>;

// Fake DB mínimo: aplica where { id, tenant_id, email, id: { not } } y
// respeta `select` (para certificar que password_hash nunca se lee).
function matches(row: Record<string, unknown>, where: Where) {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "not" in v) {
      return row[k] !== (v as { not: unknown }).not;
    }
    return row[k] === v;
  });
}
function pick(row: Record<string, unknown>, select?: Select) {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]]));
}

function makeDb(users: FakeUser[], clients: FakeClient[]) {
  return {
    client: {
      findFirst: vi.fn(async ({ where, select }: { where: Where; select?: Select }) => {
        const row = clients.find((c) => matches(c, where));
        return row ? pick(row, select) : null;
      }),
      update: vi.fn(),
    },
    user: {
      findFirst: vi.fn(async ({ where, select }: { where: Where; select?: Select }) => {
        const row = users.find((u) => matches(u, where));
        return row ? pick(row, select) : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = users.find((u) => u.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  };
}

function baseUsers(): FakeUser[] {
  return [
    {
      id: "user-portal-1", tenant_id: "tenant-1", email: "portal@example.test", role: "client",
      status: "active", branch_id: "loc-1", gym_id: "gym-1", operational_code: "CLI-0001",
      qr_token: "qr-1", password_hash: "ORIGINAL_HASH",
    },
    {
      id: "user-other-1", tenant_id: "tenant-1", email: "taken@example.test", role: "client",
      status: "active", branch_id: "loc-1", gym_id: "gym-1", operational_code: null,
      qr_token: null, password_hash: "OTHER_HASH",
    },
    {
      id: "user-tenant-2", tenant_id: "tenant-2", email: "shared@example.test", role: "client",
      status: "active", branch_id: "loc-2", gym_id: "gym-2", operational_code: null,
      qr_token: null, password_hash: "T2_HASH",
    },
  ];
}
function baseClients(): FakeClient[] {
  return [
    {
      id: "client-1", tenant_id: "tenant-1", branch_id: "loc-1", user_id: "user-portal-1",
      email: "contacto@example.test", status: "active",
    },
  ];
}

function portalHandle(db: ReturnType<typeof makeDb>, tenantId = "tenant-1") {
  return {
    context: {
      effectiveUser: { id: "u1", role: "super_admin", location_id: "loc-1" },
      tenantId,
      locationId: "loc-1",
      client: db,
    },
    dispose: disposeMock,
  };
}

const READ_ONLY = () =>
  new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403);

describe("updateClientPortalEmailAction", () => {
  let users: FakeUser[];
  let clients: FakeClient[];
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    users = baseUsers();
    clients = baseClients();
    db = makeDb(users, clients);
    updateCoreUserSpy.mockClear();
    vi.mocked(canManageClient).mockReturnValue(true);
    requireOperationalContextMock.mockResolvedValue(portalHandle(db));
  });

  it("1. Client + User client válidos + email disponible -> PASS; updateCoreUser recibe solo { email } con context.client", async () => {
    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "  nuevo@example.test  " }),
    );

    expect(result).toEqual({ success: "Correo de acceso actualizado correctamente." });
    expect(requireOperationalContextMock).toHaveBeenCalledWith(expect.anything(), { write: true });
    expect(updateCoreUserSpy).toHaveBeenCalledWith(
      "user-portal-1",
      "tenant-1",
      { email: "nuevo@example.test" },
      db,
    );
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-portal-1" },
      data: { email: "nuevo@example.test" },
    });
    expect(users[0].email).toBe("nuevo@example.test");
    expect(disposeMock).toHaveBeenCalled();
  });

  it("NO_CLIENT_CONTACT_EMAIL_COUPLING: Client.email intacto; status y password del portal intactos", async () => {
    await updateClientPortalEmailAction(undefined, fd({ client_id: "client-1", portal_email: "nuevo@example.test" }));

    expect(db.client.update).not.toHaveBeenCalled();
    expect(clients[0].email).toBe("contacto@example.test");
    expect(users[0].status).toBe("active");
    expect(users[0].password_hash).toBe("ORIGINAL_HASH");
  });

  it("2. email duplicado dentro del MISMO tenant -> rechazado, sin write", async () => {
    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "taken@example.test" }),
    );

    expect(result).toEqual({ errors: { portal_email: ["Este correo ya está registrado."] } });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("3. mismo email existente en OTRO tenant (misma base física) -> no bloquea", async () => {
    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "shared@example.test" }),
    );

    expect(result).toEqual({ success: "Correo de acceso actualizado correctamente." });
    expect(users[0].email).toBe("shared@example.test");
    // Toda búsqueda de usuario quedó acotada al tenant efectivo.
    for (const [args] of db.user.findFirst.mock.calls) {
      expect(args.where.tenant_id).toBe("tenant-1");
    }
  });

  it("mismo correo que el actual -> éxito no-op, sin write", async () => {
    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "portal@example.test" }),
    );

    expect(result?.success).toBeDefined();
    expect(result?.error).toBeUndefined();
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("correo inválido / vacío -> rechazado sin write", async () => {
    const invalid = await updateClientPortalEmailAction(undefined, fd({ client_id: "client-1", portal_email: "no-es-correo" }));
    const empty = await updateClientPortalEmailAction(undefined, fd({ client_id: "client-1", portal_email: "   " }));

    expect(invalid?.errors?.portal_email).toBeDefined();
    expect(empty?.errors?.portal_email).toBeDefined();
    expect(db.user.update).not.toHaveBeenCalled();
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
  });

  it("4. Client de otro tenant -> no write", async () => {
    requireOperationalContextMock.mockResolvedValue(portalHandle(db, "tenant-2"));

    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "nuevo@example.test" }),
    );

    expect(result).toEqual({ error: "Cliente no encontrado." });
    expect(db.client.findFirst).toHaveBeenCalledWith({
      where: { id: "client-1", tenant_id: "tenant-2" },
      select: { id: true, branch_id: true, user_id: true },
    });
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("Client inexistente -> error claro, no write", async () => {
    const result = await updateClientPortalEmailAction(undefined, fd({ client_id: "nope", portal_email: "nuevo@example.test" }));

    expect(result).toEqual({ error: "Cliente no encontrado." });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("5. Client sin user_id -> error claro", async () => {
    clients[0].user_id = null;

    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "nuevo@example.test" }),
    );

    expect(result).toEqual({ error: "Este cliente no tiene acceso al portal habilitado." });
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
  });

  it("6. user_id apunta a User inexistente -> error claro", async () => {
    clients[0].user_id = "ghost-user";

    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "nuevo@example.test" }),
    );

    expect(result?.error).toMatch(/no existe o no pertenece/);
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("7. User vinculado de OTRO tenant -> fail closed", async () => {
    clients[0].user_id = "user-tenant-2";

    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "nuevo@example.test" }),
    );

    expect(result?.error).toMatch(/no existe o no pertenece/);
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { id: "user-tenant-2", tenant_id: "tenant-1" },
      select: { id: true, email: true, role: true },
    });
    expect(users[2].email).toBe("shared@example.test");
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("8. User vinculado con role distinto de client -> fail closed", async () => {
    users[0].role = "reception";

    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "nuevo@example.test" }),
    );

    expect(result).toEqual({ error: "La cuenta vinculada no es una cuenta de portal de cliente." });
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("9. canManageClient=false (identidad efectiva) -> no write", async () => {
    vi.mocked(canManageClient).mockReturnValue(false);

    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "nuevo@example.test" }),
    );

    expect(result).toEqual({ error: "Sin permiso para modificar este cliente." });
    expect(canManageClient).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1", role: "super_admin", location_id: "loc-1" }),
      expect.objectContaining({ branch_id: "loc-1" }),
    );
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("10. Support Session / readOnly -> requireOperationalContext rechaza antes de leer/escribir", async () => {
    requireOperationalContextMock.mockRejectedValue(READ_ONLY());

    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "nuevo@example.test" }),
    );

    expect(result?.error).toMatch(/solo lectura/);
    expect(db.client.findFirst).not.toHaveBeenCalled();
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
  });

  it("fallo inesperado del core -> mensaje genérico, sin filtrar detalles", async () => {
    updateCoreUserSpy.mockRejectedValueOnce(new Error("connection postgres://synthetic-secret@host/db"));

    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "nuevo@example.test" }),
    );

    expect(result).toEqual({ error: "No se pudo actualizar el correo de acceso. Intenta nuevamente." });
    expect(disposeMock).toHaveBeenCalled();
  });

  it("carrera de unicidad (P2002 al escribir) -> error de campo usable", async () => {
    updateCoreUserSpy.mockRejectedValueOnce(Object.assign(new Error("Unique constraint"), { code: "P2002" }));

    const result = await updateClientPortalEmailAction(
      undefined,
      fd({ client_id: "client-1", portal_email: "nuevo@example.test" }),
    );

    expect(result).toEqual({ errors: { portal_email: ["Este correo ya está en uso por otra cuenta."] } });
  });
});

describe("resetClientPortalPasswordAction", () => {
  const NEW_PASSWORD = "Synthetic-Pass-123";
  let users: FakeUser[];
  let clients: FakeClient[];
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    users = baseUsers();
    clients = baseClients();
    db = makeDb(users, clients);
    updateCoreUserSpy.mockClear();
    vi.mocked(canManageClient).mockReturnValue(true);
    requireOperationalContextMock.mockResolvedValue(portalHandle(db));
  });

  function pwd(newPassword: string, confirm = newPassword, clientId = "client-1") {
    return fd({ client_id: clientId, new_password: newPassword, confirm_password: confirm });
  }

  it("11/12. contraseña válida + confirmación -> PASS; updateCoreUser recibe únicamente { password }", async () => {
    const result = await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD));

    expect(result).toEqual({ success: "Contraseña actualizada correctamente." });
    expect(requireOperationalContextMock).toHaveBeenCalledWith(expect.anything(), { write: true });
    expect(updateCoreUserSpy).toHaveBeenCalledTimes(1);
    expect(updateCoreUserSpy).toHaveBeenCalledWith("user-portal-1", "tenant-1", { password: NEW_PASSWORD }, db);
    // Hash generado por el core (bcrypt mockeado en este archivo) — nunca texto plano.
    expect(users[0].password_hash).toBe("hash");
    expect(users[0].password_hash).not.toBe(NEW_PASSWORD);
  });

  it("20. NO_PORTAL_STATUS_SIDE_EFFECT: solo cambia password_hash; email/role/status/branch/Client intactos", async () => {
    const before = { ...users[0] };
    const clientBefore = { ...clients[0] };

    await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD));

    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user-portal-1" }, data: { password_hash: "hash" } });
    expect({ ...users[0], password_hash: "-" }).toEqual({ ...before, password_hash: "-" });
    expect(clients[0]).toEqual(clientBefore);
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("portal inactivo sigue inactivo tras el cambio de contraseña", async () => {
    users[0].status = "inactive";

    const result = await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD));

    expect(result?.success).toBeDefined();
    expect(users[0].status).toBe("inactive");
  });

  it("13. password < 8 -> rechazado sin write", async () => {
    const result = await resetClientPortalPasswordAction(undefined, pwd("short7!"));

    expect(result?.errors?.new_password?.[0]).toMatch(/al menos 8/);
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("14. password > 72 -> rechazado sin write", async () => {
    const result = await resetClientPortalPasswordAction(undefined, pwd("a".repeat(73)));

    expect(result?.errors?.new_password?.[0]).toMatch(/72/);
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("15. confirmación distinta -> rechazado sin write", async () => {
    const result = await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD, "Otra-Synthetic-456"));

    expect(result).toEqual({ errors: { confirm_password: ["Las contraseñas no coinciden"] } });
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("16. portal inexistente (Client sin user_id) -> no write", async () => {
    clients[0].user_id = null;

    const result = await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD));

    expect(result).toEqual({ error: "Este cliente no tiene acceso al portal habilitado." });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("17. tenant incorrecto -> no write", async () => {
    requireOperationalContextMock.mockResolvedValue(portalHandle(db, "tenant-2"));

    const result = await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD));

    expect(result).toEqual({ error: "Cliente no encontrado." });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("User vinculado de otro tenant / role distinto / sin permiso -> fail closed", async () => {
    clients[0].user_id = "user-tenant-2";
    expect((await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD)))?.error).toMatch(/no existe o no pertenece/);

    clients[0].user_id = "user-portal-1";
    users[0].role = "trainer";
    expect((await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD)))?.error).toMatch(/no es una cuenta de portal/);

    users[0].role = "client";
    vi.mocked(canManageClient).mockReturnValue(false);
    expect((await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD)))?.error).toMatch(/Sin permiso/);

    expect(updateCoreUserSpy).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("18. Support Session -> no write (bloqueo antes de acceder a datos)", async () => {
    requireOperationalContextMock.mockRejectedValue(READ_ONLY());

    const result = await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD));

    expect(result?.error).toMatch(/solo lectura/);
    expect(db.client.findFirst).not.toHaveBeenCalled();
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
  });

  it("fallo inesperado -> mensaje genérico sin contraseña ni detalles", async () => {
    updateCoreUserSpy.mockRejectedValueOnce(new Error(`boom ${NEW_PASSWORD}`));

    const result = await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD));

    expect(result).toEqual({ error: "No se pudo actualizar la contraseña. Intenta nuevamente." });
    expect(JSON.stringify(result)).not.toContain(NEW_PASSWORD);
  });

  it("19. NO_PASSWORD_HASH_EXPOSURE: ningún resultado expone password_hash ni la contraseña; nunca se selecciona password_hash", async () => {
    const results = [
      await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD)),
      await resetClientPortalPasswordAction(undefined, pwd("short")),
      await resetClientPortalPasswordAction(undefined, pwd(NEW_PASSWORD, "different-123")),
      await updateClientPortalEmailAction(undefined, fd({ client_id: "client-1", portal_email: "otro@example.test" })),
      await updateClientPortalEmailAction(undefined, fd({ client_id: "client-1", portal_email: "taken@example.test" })),
    ];

    for (const r of results) {
      const serialized = JSON.stringify(r);
      expect(serialized).not.toContain("password_hash");
      expect(serialized).not.toContain("ORIGINAL_HASH");
      expect(serialized).not.toContain('"hash"');
      expect(serialized).not.toContain(NEW_PASSWORD);
    }
    for (const [args] of db.user.findFirst.mock.calls) {
      expect(args.select).toBeDefined();
      expect(args.select).not.toHaveProperty("password_hash");
    }
  });
});
