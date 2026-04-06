import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * Extiende los tipos de Auth.js para incluir
 * role, gym_id y branch_id en el JWT y la sesión.
 */

declare module "next-auth" {
  interface User {
    role: UserRole;
    gym_id: string;
    branch_id: string | null;
    tenant_id?: string;   // alias de gym_id — se propaga al JWT en auth.ts
    location_id?: string | null; // alias de branch_id — se propaga al JWT en auth.ts
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      gym_id: string;
      branch_id: string | null;
      tenant_id: string;          // copia de gym_id — backward-compatible con sesiones antiguas
      location_id: string | null; // copia de branch_id — backward-compatible con sesiones antiguas
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    gym_id: string;
    branch_id: string | null;
    tenant_id?: string;          // opcional: ausente en tokens emitidos antes de Etapa 6
    location_id?: string | null; // opcional: ausente en tokens emitidos antes de Etapa 6
  }
}
