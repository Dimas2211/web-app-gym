import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { authConfig } from "./auth.config";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        // Usuario no encontrado o inactivo
        if (!user || user.status !== "active") return null;

        // Verificar contraseña contra el hash almacenado
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) return null;

        // FASE VI-B — todo usuario autenticado por este flujo (Prisma
        // global, el ÚNICO flujo de login activo hoy) recibe explícitamente
        // auth_scope = "PLATFORM". Esto NO significa que cualquier rol de la
        // DB global reciba privilegio Platform Admin: el rol sigue
        // gobernando capacidades vía getCapabilities(role).isGlobal — ver
        // canAccessPlatformAdmin() en @/core/permissions/platform-access.
        // Login runtime (auth_scope = "RUNTIME_CLIENT") NO está habilitado
        // todavía (FASE VI-C).
        return {
          id: user.id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          role: user.role,
          tenant_id: user.gym_id,
          location_id: user.branch_id,
          auth_scope: "PLATFORM",
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // Solo al crear el token (primer login) se recibe `user`
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.tenant_id = user.tenant_id;
        token.location_id = user.location_id;
        token.auth_scope = user.auth_scope;
      }
      return token;
    },
    session({ session, token }) {
      // El tipo base JWT extiende Record<string, unknown>, por lo que
      // se requieren casts explícitos para los campos personalizados.
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      session.user.tenant_id   = token.tenant_id as string;
      session.user.location_id = token.location_id as string | null;
      // FASE VI-B — valor crudo sin validar (puede ser undefined en un JWT
      // emitido antes de este cambio). La validación real ocurre en el
      // consumidor (getSessionOrRedirect / getCoreSession vía isAuthScope).
      session.user.auth_scope = token.auth_scope as string | undefined;
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8, // 8 horas (jornada laboral)
  },
});
