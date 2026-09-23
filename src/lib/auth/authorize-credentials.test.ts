// ─────────────────────────────────────────────────────────────────
// lib/auth — authorize-credentials.test.ts
//
// FASE VI-C — ETAPA V. Certifica authorizeCredentials() con mocks —
// sin remote DB, sin passwords reales. Cubre PLATFORM vs RUNTIME_CLIENT
// por hostname, feature gate, y no-fallback.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";

// SHARED-PILOT-4A / Gap G — authenticatePlatformUser ahora usa
// findMany({ take: 2 }) + fail-closed en ambigüedad, no findUnique(email)
// (email dejó de ser único global — ver authorize-credentials.ts).
const prismaUserFindManyMock = vi.fn();
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findMany: (...args: unknown[]) => prismaUserFindManyMock(...args) } },
}));

const resolveOrganizationByHostnameMock = vi.fn();
vi.mock("@/modules/platform/runtime/resolve-organization-by-hostname", async () => {
  const actual = await vi.importActual<
    typeof import("@/modules/platform/runtime/resolve-organization-by-hostname")
  >("@/modules/platform/runtime/resolve-organization-by-hostname");
  return {
    ...actual,
    resolveOrganizationByHostname: (...args: unknown[]) => resolveOrganizationByHostnameMock(...args),
  };
});

const authenticateRuntimeUserMock = vi.fn();
vi.mock("@/modules/platform/runtime/authenticate-runtime-user", async () => {
  const actual = await vi.importActual<
    typeof import("@/modules/platform/runtime/authenticate-runtime-user")
  >("@/modules/platform/runtime/authenticate-runtime-user");
  return {
    ...actual,
    authenticateRuntimeUser: (...args: unknown[]) => authenticateRuntimeUserMock(...args),
  };
});

import { authorizeCredentials } from "./authorize-credentials";
import {
  RuntimeOrganizationLookupError,
} from "@/modules/platform/runtime/resolve-organization-by-hostname";
import { RuntimeAuthError } from "@/modules/platform/runtime/authenticate-runtime-user";

const PASSWORD = "correct-horse-battery-staple";
let PASSWORD_HASH: string;

function fakeRequest(host: string): Request {
  return new Request("http://internal.invalid/", { headers: { host } });
}

const PLATFORM_USER_ROW = () => ({
  id: "plat-user-1",
  email: "admin@platform.test",
  first_name: "Carlos",
  last_name: "Admin",
  role: "super_admin",
  status: "active",
  password_hash: PASSWORD_HASH,
  gym_id: "tenant-platform",
  branch_id: null,
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  PASSWORD_HASH = await bcrypt.hash(PASSWORD, 4);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authorizeCredentials — rama PLATFORM", () => {
  it("1. platform hostname + usuario global válido → PLATFORM", async () => {
    vi.stubEnv("NODE_ENV", "test"); // localhost = platform por defecto
    prismaUserFindManyMock.mockResolvedValue([PLATFORM_USER_ROW()]);

    const result = await authorizeCredentials(
      { email: "admin@platform.test", password: PASSWORD },
      fakeRequest("localhost:3000"),
    );

    expect(result).toMatchObject({ auth_scope: "PLATFORM", role: "super_admin" });
    expect(result?.organization_id).toBeUndefined();
    expect(resolveOrganizationByHostnameMock).not.toHaveBeenCalled();
  });

  it("2. platform hostname + password incorrecta → null", async () => {
    vi.stubEnv("NODE_ENV", "test");
    prismaUserFindManyMock.mockResolvedValue([PLATFORM_USER_ROW()]);

    const result = await authorizeCredentials(
      { email: "admin@platform.test", password: "wrong" },
      fakeRequest("localhost:3000"),
    );

    expect(result).toBeNull();
  });

  it("usuario global inactivo → null", async () => {
    vi.stubEnv("NODE_ENV", "test");
    prismaUserFindManyMock.mockResolvedValue([{ ...PLATFORM_USER_ROW(), status: "inactive" }]);

    const result = await authorizeCredentials(
      { email: "admin@platform.test", password: PASSWORD },
      fakeRequest("localhost:3000"),
    );

    expect(result).toBeNull();
  });

  it("SHARED-PILOT-4A / Gap G: email matchea 2+ filas (ambiguo) → null, fail closed, nunca autentica contra 'la primera'", async () => {
    vi.stubEnv("NODE_ENV", "test");
    // Escenario: una base mal configurada donde este email existe en más
    // de una fila (p.ej. Runtime Target apuntando a la misma conexión
    // que Control Plane). authenticatePlatformUser debe rechazar, no
    // elegir arbitrariamente una de las dos.
    prismaUserFindManyMock.mockResolvedValue([
      PLATFORM_USER_ROW(),
      { ...PLATFORM_USER_ROW(), id: "other-tenant-user", tenant_id: "tenant-other" },
    ]);

    const result = await authorizeCredentials(
      { email: "admin@platform.test", password: PASSWORD },
      fakeRequest("localhost:3000"),
    );

    expect(result).toBeNull();
  });
});

describe("authorizeCredentials — rama RUNTIME_CLIENT", () => {
  it("3. runtime hostname + feature deshabilitada → null, sin tocar el resolver de organización", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "false");

    const result = await authorizeCredentials(
      { email: "user@trustme.test", password: PASSWORD },
      fakeRequest("trustme.getzolvi.com"),
    );

    expect(result).toBeNull();
    expect(resolveOrganizationByHostnameMock).not.toHaveBeenCalled();
  });

  it("4. runtime hostname + feature habilitada + org válida + usuario runtime válido → RUNTIME_CLIENT", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");
    resolveOrganizationByHostnameMock.mockResolvedValue({
      id: "org-trustme",
      name: "TrustMe",
      tenant_id: "tenant-trustme",
      status: "ACTIVE",
    });
    authenticateRuntimeUserMock.mockResolvedValue({
      id: "u1",
      email: "user@trustme.test",
      name: "Runtime User",
      role: "branch_admin",
      tenantId: "tenant-trustme",
      locationId: "branch-1",
    });

    const result = await authorizeCredentials(
      { email: "user@trustme.test", password: PASSWORD },
      fakeRequest("trustme.getzolvi.com"),
    );

    expect(result).toEqual({
      id: "u1",
      email: "user@trustme.test",
      name: "Runtime User",
      role: "branch_admin",
      tenant_id: "tenant-trustme",
      location_id: "branch-1",
      auth_scope: "RUNTIME_CLIENT",
      organization_id: "org-trustme",
    });
  });

  it("8. runtime hostname sin organización registrada → null", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");
    resolveOrganizationByHostnameMock.mockRejectedValue(
      new RuntimeOrganizationLookupError("RUNTIME_ORG_NOT_FOUND", "no org"),
    );

    const result = await authorizeCredentials(
      { email: "user@unknown.test", password: PASSWORD },
      fakeRequest("unknown.getzolvi.com"),
    );

    expect(result).toBeNull();
  });

  it("7. dominio duplicado (ambiguo) → null, fail closed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");
    resolveOrganizationByHostnameMock.mockRejectedValue(
      new RuntimeOrganizationLookupError("RUNTIME_ORG_AMBIGUOUS", "dup"),
    );

    const result = await authorizeCredentials(
      { email: "user@dup.test", password: PASSWORD },
      fakeRequest("dup.getzolvi.com"),
    );

    expect(result).toBeNull();
  });

  it("9. organización no elegible (SUSPENDED) → null", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");
    resolveOrganizationByHostnameMock.mockResolvedValue({
      id: "org-x",
      name: "Suspended Org",
      tenant_id: "tenant-x",
      status: "SUSPENDED",
    });

    const result = await authorizeCredentials(
      { email: "user@suspended.test", password: PASSWORD },
      fakeRequest("suspended.getzolvi.com"),
    );

    expect(result).toBeNull();
    expect(authenticateRuntimeUserMock).not.toHaveBeenCalled();
  });

  it("10. organización sin perfil runtime activo → null (nunca fallback global)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");
    resolveOrganizationByHostnameMock.mockResolvedValue({
      id: "org-y",
      name: "Org Y",
      tenant_id: "tenant-y",
      status: "ACTIVE",
    });
    authenticateRuntimeUserMock.mockRejectedValue(new RuntimeAuthError("RUNTIME_PROFILE_MISSING"));

    const result = await authorizeCredentials(
      { email: "user@y.test", password: PASSWORD },
      fakeRequest("y.getzolvi.com"),
    );

    expect(result).toBeNull();
    expect(prismaUserFindManyMock).not.toHaveBeenCalled();
  });

  it("11. base runtime inalcanzable → null (nunca fallback global)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");
    resolveOrganizationByHostnameMock.mockResolvedValue({
      id: "org-z",
      name: "Org Z",
      tenant_id: "tenant-z",
      status: "ACTIVE",
    });
    authenticateRuntimeUserMock.mockRejectedValue(new RuntimeAuthError("RUNTIME_DB_UNAVAILABLE"));

    const result = await authorizeCredentials(
      { email: "user@z.test", password: PASSWORD },
      fakeRequest("z.getzolvi.com"),
    );

    expect(result).toBeNull();
  });

  it("13. password runtime incorrecta → null", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");
    resolveOrganizationByHostnameMock.mockResolvedValue({
      id: "org-w",
      name: "Org W",
      tenant_id: "tenant-w",
      status: "ACTIVE",
    });
    authenticateRuntimeUserMock.mockRejectedValue(new RuntimeAuthError("RUNTIME_PASSWORD_INVALID"));

    const result = await authorizeCredentials(
      { email: "user@w.test", password: "wrong" },
      fakeRequest("w.getzolvi.com"),
    );

    expect(result).toBeNull();
  });

  it("14. tenant mismatch → null", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");
    resolveOrganizationByHostnameMock.mockResolvedValue({
      id: "org-v",
      name: "Org V",
      tenant_id: "tenant-v",
      status: "ACTIVE",
    });
    authenticateRuntimeUserMock.mockRejectedValue(new RuntimeAuthError("RUNTIME_TENANT_MISMATCH"));

    const result = await authorizeCredentials(
      { email: "user@v.test", password: PASSWORD },
      fakeRequest("v.getzolvi.com"),
    );

    expect(result).toBeNull();
  });

  it("15. identidad runtime exitosa contiene organization_id", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");
    resolveOrganizationByHostnameMock.mockResolvedValue({
      id: "org-15",
      name: "Org 15",
      tenant_id: "tenant-15",
      status: "ACTIVE",
    });
    authenticateRuntimeUserMock.mockResolvedValue({
      id: "u15",
      email: "u15@example.test",
      name: "User 15",
      role: "branch_admin",
      tenantId: "tenant-15",
      locationId: null,
    });

    const result = await authorizeCredentials(
      { email: "u15@example.test", password: PASSWORD },
      fakeRequest("org15.getzolvi.com"),
    );

    expect(result?.organization_id).toBe("org-15");
  });

  it("16. identidad runtime exitosa NUNCA incluye secretos de conexión (solo campos de sesión permitidos)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");
    resolveOrganizationByHostnameMock.mockResolvedValue({
      id: "org-16",
      name: "Org 16",
      tenant_id: "tenant-16",
      status: "ACTIVE",
    });
    authenticateRuntimeUserMock.mockResolvedValue({
      id: "u16",
      email: "u16@example.test",
      name: "User 16",
      role: "branch_admin",
      tenantId: "tenant-16",
      locationId: null,
    });

    const result = await authorizeCredentials(
      { email: "u16@example.test", password: PASSWORD },
      fakeRequest("org16.getzolvi.com"),
    );

    expect(Object.keys(result ?? {}).sort()).toEqual(
      ["auth_scope", "email", "id", "location_id", "name", "organization_id", "role", "tenant_id"].sort(),
    );
  });

  it("17. runtime hostname + usuario que solo existe como Platform User global (no en la runtime DB) → null (RUNTIME_USER_NOT_FOUND, nunca fallback al Prisma global)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");
    resolveOrganizationByHostnameMock.mockResolvedValue({
      id: "org-trustme",
      name: "TrustMe",
      tenant_id: "tenant-trustme",
      status: "ACTIVE",
    });
    // El admin de plataforma existe en prisma global, pero authenticateRuntimeHostUser
    // nunca consulta ese cliente — solo la runtime DB de la organización resuelta.
    authenticateRuntimeUserMock.mockRejectedValue(new RuntimeAuthError("RUNTIME_USER_NOT_FOUND"));

    const result = await authorizeCredentials(
      { email: "admin@platform.test", password: PASSWORD },
      fakeRequest("trustme.getzolvi.com"),
    );

    expect(result).toBeNull();
    expect(prismaUserFindManyMock).not.toHaveBeenCalled();
  });

  it("18. platform hostname + intento de enviar organization_id/host de otro cliente → ignorado, sigue autenticando contra Prisma global (rama PLATFORM no consulta resolveOrganizationByHostname)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    prismaUserFindManyMock.mockResolvedValue([PLATFORM_USER_ROW()]);

    const result = await authorizeCredentials(
      { email: "admin@platform.test", password: PASSWORD },
      fakeRequest("localhost:3000"),
    );

    expect(result).toMatchObject({ auth_scope: "PLATFORM" });
    expect(resolveOrganizationByHostnameMock).not.toHaveBeenCalled();
    expect(authenticateRuntimeUserMock).not.toHaveBeenCalled();
  });

  it("hostname no resuelto (sin Host) con runtime habilitado → null", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOSTS", "getzolvi.com");
    vi.stubEnv("RUNTIME_HOST_AUTH_ENABLED", "true");

    const result = await authorizeCredentials(
      { email: "user@x.test", password: PASSWORD },
      new Request("http://internal.invalid/"),
    );

    expect(result).toBeNull();
    expect(resolveOrganizationByHostnameMock).not.toHaveBeenCalled();
  });
});

describe("authorizeCredentials — entrada inválida", () => {
  it("credenciales con forma inválida (sin email/password) → null sin tocar ninguna DB", async () => {
    const result = await authorizeCredentials({}, fakeRequest("localhost:3000"));
    expect(result).toBeNull();
    expect(prismaUserFindManyMock).not.toHaveBeenCalled();
    expect(resolveOrganizationByHostnameMock).not.toHaveBeenCalled();
  });
});
