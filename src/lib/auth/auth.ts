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

        return {
          id: user.id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          role: user.role,
          gym_id: user.gym_id,
          branch_id: user.branch_id,
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
        token.gym_id = user.gym_id;
        token.branch_id = user.branch_id;
        token.tenant_id = user.gym_id;    // Etapa 6: copia de gym_id, alias cross-industry
        token.location_id = user.branch_id; // Etapa 6: copia de branch_id, alias cross-industry
      }
      return token;
    },
    session({ session, token }) {
      // El tipo base JWT extiende Record<string, unknown>, por lo que
      // se requieren casts explícitos para los campos personalizados.
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      session.user.gym_id = token.gym_id as string;
      session.user.branch_id = token.branch_id as string | null;
      // Etapa 6: tenant_id y location_id con fallback para sesiones emitidas antes de este cambio
      session.user.tenant_id   = (token.tenant_id ?? token.gym_id) as string;
      session.user.location_id = (token.location_id !== undefined ? token.location_id : token.branch_id) as string | null;
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8, // 8 horas (jornada laboral)
  },
});
