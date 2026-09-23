// ─────────────────────────────────────────────────────────────────
// platform/runtime — authenticate-runtime-user.ts
//
// FASE VI-C — ETAPA H/I/J. Autentica un usuario RUNTIME_CLIENT contra
// la base del CLIENTE (nunca Control Plane, nunca prisma global).
//
// Reusa runtime-database-router.ts (withOrganizationRuntimePrisma) —
// no crea un router paralelo. El caller (authorize RUNTIME branch) ya
// resolvió `organization` vía resolveOrganizationByHostname().
//
// GARANTÍA CRÍTICA (Same-email isolation, ETAPA J):
// el email se busca únicamente dentro de la base runtime del perfil
// activo de `organization.id`. El mismo email en dos organizaciones
// distintas vive en dos bases físicas distintas — nunca se cruzan.
//
// GARANTÍA CRÍTICA (Tenant match, ETAPA I / SHARED-PILOT-3B):
// no basta con que el usuario exista en la base "correcta" — se exige
// además que `user.tenant_id` (columna de ownership autoritativa,
// NUNCA gym_id — Gym es una extensión vertical opcional) coincida con
// `organization.tenantId` (Control Plane). Un desalineamiento aquí es
// TENANT_MISMATCH, no una coincidencia válida.
//
// SHARED-PILOT-4A / Gap G: desde que User.email dejó de ser @unique
// global (ahora @@unique([tenant_id, email])), una base Shared Runtime
// puede contener varios RuntimeTenant con Users que reutilizan el
// mismo email. La búsqueda usa el compound key tenant_id_email
// directamente — el tenant match ya no es un chequeo posterior sobre
// un resultado potencialmente ajeno, es parte de la propia query. El
// chequeo explícito de abajo se conserva como assertion defensiva
// (nunca debería fallar si el compound key funcionó), no como la
// única barrera.
//
// CUIDADO DE PROPAGACIÓN DE ERRORES:
// withRuntimePrisma() envuelve CUALQUIER excepción que escape del
// callback como RuntimeDatabaseUnreachableError (ver
// runtime-database-router.ts). Por eso este módulo NUNCA lanza sus
// errores de credenciales/tenant DESDE DENTRO del callback — retorna
// un resultado discriminado y lanza RuntimeAuthError FUERA del
// callback, para no perder el código de fallo real bajo un falso
// "unreachable".
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[authenticate-runtime-user] Módulo server-only. No usar en contexto de navegador.",
  );
}

import bcrypt from "bcryptjs";
import { withOrganizationRuntimePrisma } from "./runtime-database-router";
import { RuntimeDatabaseRouterError } from "./runtime-database-router.errors";

export type RuntimeAuthFailureCode =
  | "RUNTIME_PROFILE_MISSING"
  | "RUNTIME_DB_UNAVAILABLE"
  | "RUNTIME_USER_NOT_FOUND"
  | "RUNTIME_USER_INACTIVE"
  | "RUNTIME_PASSWORD_INVALID"
  | "RUNTIME_TENANT_MISMATCH";

export class RuntimeAuthError extends Error {
  readonly code: RuntimeAuthFailureCode;

  constructor(code: RuntimeAuthFailureCode, message?: string) {
    super(message ?? code);
    this.name = "RuntimeAuthError";
    this.code = code;
  }
}

export interface AuthenticateRuntimeUserInput {
  organization: { id: string; tenantId: string };
  email: string;
  password: string;
}

export interface RuntimeAuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  locationId: string | null;
}

type RuntimeAuthOutcome =
  | { ok: true; user: RuntimeAuthenticatedUser }
  | { ok: false; code: RuntimeAuthFailureCode };

/** Forma mínima de client runtime necesaria — evita acoplar el test a PrismaClient completo. */
export interface RuntimeUserQueryClient {
  user: {
    findUnique: (args: {
      where: { tenant_id_email: { tenant_id: string; email: string } };
    }) => Promise<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      status: string;
      password_hash: string;
      tenant_id: string;
      branch_id: string | null;
    } | null>;
  };
}

async function runAuthAgainstRuntimeClient(
  client: RuntimeUserQueryClient,
  organization: { tenantId: string },
  email: string,
  password: string,
): Promise<RuntimeAuthOutcome> {
  const user = await client.user.findUnique({
    where: { tenant_id_email: { tenant_id: organization.tenantId, email } },
  });
  if (!user) return { ok: false, code: "RUNTIME_USER_NOT_FOUND" };
  if (user.status !== "active") return { ok: false, code: "RUNTIME_USER_INACTIVE" };

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) return { ok: false, code: "RUNTIME_PASSWORD_INVALID" };

  // CRÍTICO: no basta con estar en la base correcta — el tenant interno
  // del usuario runtime debe coincidir con el tenant_id de Control Plane.
  if (user.tenant_id !== organization.tenantId) {
    return { ok: false, code: "RUNTIME_TENANT_MISMATCH" };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      role: user.role,
      tenantId: user.tenant_id,
      locationId: user.branch_id,
    },
  };
}

/**
 * Autentica un usuario runtime dentro de la base del cliente
 * (`organization`). Nunca consulta el User de Control Plane. Fail
 * closed: cualquier problema de conectividad/perfil se traduce a
 * RUNTIME_DB_UNAVAILABLE o RUNTIME_PROFILE_MISSING — nunca a un
 * fallback silencioso.
 */
export async function authenticateRuntimeUser(
  input: AuthenticateRuntimeUserInput,
): Promise<RuntimeAuthenticatedUser> {
  const { organization, email, password } = input;

  let outcome: RuntimeAuthOutcome;
  try {
    outcome = await withOrganizationRuntimePrisma(organization.id, (client) =>
      runAuthAgainstRuntimeClient(client as unknown as RuntimeUserQueryClient, organization, email, password),
    );
  } catch (err) {
    if (err instanceof RuntimeDatabaseRouterError) {
      if (err.code === "RUNTIME_DATABASE_UNREACHABLE") {
        throw new RuntimeAuthError("RUNTIME_DB_UNAVAILABLE");
      }
      // ORGANIZATION_NOT_FOUND, ORGANIZATION_WITHOUT_TENANT,
      // ACTIVE_PROFILE_NOT_FOUND, PROFILE_NOT_FOUND, PROFILE_INACTIVE,
      // PROFILE_CONNECTION_INVALID — todos son variantes de "no hay un
      // perfil runtime usable para esta organización".
      throw new RuntimeAuthError("RUNTIME_PROFILE_MISSING");
    }
    throw new RuntimeAuthError("RUNTIME_DB_UNAVAILABLE");
  }

  if (!outcome.ok) throw new RuntimeAuthError(outcome.code);
  return outcome.user;
}
