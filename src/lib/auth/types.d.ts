import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * Extiende los tipos de Auth.js para incluir role, tenant_id y location_id
 * en el JWT y la sesión. gym_id y branch_id eliminados en 9D.6.
 */

declare module "next-auth" {
  interface User {
    role: UserRole;
    tenant_id: string;
    location_id: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      tenant_id: string;
      location_id: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    tenant_id: string;
    location_id: string | null;
  }
}
