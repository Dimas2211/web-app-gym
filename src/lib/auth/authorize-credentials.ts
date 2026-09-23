// ─────────────────────────────────────────────────────────────────
// lib/auth — authorize-credentials.ts
//
// FASE VI-C — ETAPA K. Lógica de autorización multi-scope extraída de
// auth.ts para ser testeable de forma aislada (auth.ts instancia
// NextAuth() al importarse, lo que dificulta testear `authorize`
// directamente).
//
// authorizeCredentials() es exactamente lo que el provider Credentials
// invoca — auth.ts solo lo conecta a NextAuth().
// ─────────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";
import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveRequestHostname } from "@/lib/http/hostname";
import { isPlatformHostname } from "@/lib/platform/platform-hosts";
import { isRuntimeHostAuthEnabled } from "./runtime-host-auth-flag";
import {
  resolveOrganizationByHostname,
  canOrganizationAuthenticate,
  RuntimeOrganizationLookupError,
} from "@/modules/platform/runtime/resolve-organization-by-hostname";
import {
  authenticateRuntimeUser,
  RuntimeAuthError,
} from "@/modules/platform/runtime/authenticate-runtime-user";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export interface AuthorizedCredentialsUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenant_id: string;
  location_id: string | null;
  auth_scope: "PLATFORM" | "RUNTIME_CLIENT";
  organization_id?: string;
}

/**
 * Rama PLATFORM — flujo de login global actual, SIN CAMBIOS de
 * comportamiento. Sigue usando el Prisma global (Control Plane), nunca
 * el Runtime Database Router.
 */
export async function authenticatePlatformUser(
  email: string,
  password: string,
): Promise<AuthorizedCredentialsUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.status !== "active") return null;

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) return null;

  // FASE VI-B — todo usuario autenticado por este flujo (Prisma
  // global) recibe explícitamente auth_scope = "PLATFORM". El rol
  // sigue gobernando capacidades vía getCapabilities(role).isGlobal —
  // ver canAccessPlatformAdmin() en @/core/permissions/platform-access.
  return {
    id: user.id,
    email: user.email,
    name: `${user.first_name} ${user.last_name}`,
    role: user.role,
    tenant_id: user.tenant_id,
    location_id: user.branch_id,
    auth_scope: "PLATFORM",
  };
}

/**
 * Rama RUNTIME_CLIENT — FASE VI-C. Login contra la base de un cliente,
 * resuelto por hostname. El caller debe verificar
 * isRuntimeHostAuthEnabled() antes de invocar esta función.
 *
 * ETAPA S — semántica de error: cualquier fallo se traduce
 * uniformemente a `null` (credenciales inválidas genéricas) hacia el
 * UI de login. Los códigos internos existen solo para diagnóstico.
 */
export async function authenticateRuntimeHostUser(
  hostname: string,
  email: string,
  password: string,
): Promise<AuthorizedCredentialsUser | null> {
  let organization;
  try {
    organization = await resolveOrganizationByHostname(hostname);
  } catch (err) {
    if (err instanceof RuntimeOrganizationLookupError) return null;
    throw err;
  }

  if (!organization.tenant_id) return null; // OrganizationWithoutTenant — denegado genérico
  if (!canOrganizationAuthenticate(organization)) return null;

  try {
    const runtimeUser = await authenticateRuntimeUser({
      organization: { id: organization.id, tenantId: organization.tenant_id },
      email,
      password,
    });

    // FASE VI-C — identidad RUNTIME_CLIENT. organization_id viaja en el
    // JWT/sesión; NUNCA credenciales de conexión ni profile_id.
    return {
      id: runtimeUser.id,
      email: runtimeUser.email,
      name: runtimeUser.name,
      role: runtimeUser.role as UserRole,
      tenant_id: runtimeUser.tenantId,
      location_id: runtimeUser.locationId,
      auth_scope: "RUNTIME_CLIENT",
      organization_id: organization.id,
    };
  } catch (err) {
    if (err instanceof RuntimeAuthError) return null;
    throw err;
  }
}

/**
 * Punto de entrada único invocado por el provider Credentials.
 * Decide PLATFORM vs RUNTIME_CLIENT por hostname — ver ETAPA K.
 */
export async function authorizeCredentials(
  credentials: Partial<Record<string, unknown>>,
  request: Request,
): Promise<AuthorizedCredentialsUser | null> {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) return null;

  const { email, password } = parsed.data;

  // ETAPA C/D — hostname resuelto de forma defensiva; NO es por sí
  // solo una decisión de autorización (ver hostname.ts).
  const hostname = resolveRequestHostname(request);

  if (isPlatformHostname(hostname)) {
    return authenticatePlatformUser(email, password);
  }

  // ETAPA L — feature gate: login runtime deshabilitado por defecto.
  // Sin esta variable explícita, NUNCA se intenta resolver
  // organización ni abrir una base runtime.
  if (!isRuntimeHostAuthEnabled()) return null;

  // Hostname no resuelto (sin header Host/X-Forwarded-Host válido) →
  // denegado genérico, nunca se asume plataforma.
  if (!hostname) return null;

  return authenticateRuntimeHostUser(hostname, email, password);
}
