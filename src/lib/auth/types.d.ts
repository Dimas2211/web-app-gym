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
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      gym_id: string;
      branch_id: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    gym_id: string;
    branch_id: string | null;
  }
}
