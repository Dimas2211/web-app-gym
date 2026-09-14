import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * Extiende los tipos de Auth.js para incluir role, tenant_id y location_id
 * en el JWT y la sesión. gym_id y branch_id eliminados en 9D.6.
 *
 * FASE VI-B — auth_scope:
 * Se tipa aquí como `string | undefined` (crudo, sin validar) porque este
 * módulo es el contrato de transporte de Auth.js (JWT/cookie), no el
 * contrato de identidad validado de la plataforma. Un JWT emitido antes de
 * FASE VI-B no tiene este campo (undefined); un valor corrupto/manipulado
 * también debe poder representarse como string arbitrario. La validación
 * real (string → AuthScope | undefined) ocurre en las fronteras de consumo
 * — getSessionOrRedirect() / getCoreSession() / toCoreSessionUser(), vía
 * isAuthScope() en @/core/auth/types — nunca con un cast directo
 * `as AuthScope` sin pasar por ese guard.
 *
 * FASE VI-C — organization_id:
 * Presente solo para auth_scope="RUNTIME_CLIENT" (identifica la
 * PlatformOrganization resuelta por hostname). Para auth_scope=
 * "PLATFORM" permanece undefined. Ver ETAPA M — no se agregan aquí
 * profile_id, vertical, plan ni ningún otro dato derivado: eso se
 * resuelve "en vivo" vía requireRuntimeOrganizationContext(), no se
 * congela en el JWT.
 */

declare module "next-auth" {
  interface User {
    role: UserRole;
    tenant_id: string;
    location_id: string | null;
    auth_scope: string | undefined;
    organization_id?: string;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      tenant_id: string;
      location_id: string | null;
      auth_scope: string | undefined;
      organization_id?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    tenant_id: string;
    location_id: string | null;
    auth_scope: string | undefined;
    organization_id?: string;
  }
}
