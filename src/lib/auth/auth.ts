import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { UserRole } from "@prisma/client";
import { authConfig } from "./auth.config";
import { authorizeCredentials } from "./authorize-credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      // FASE VI-C — ETAPA K. La lógica multi-scope (PLATFORM vs
      // RUNTIME_CLIENT por hostname) vive en authorize-credentials.ts,
      // extraída para ser testeable sin depender de la instancia
      // NextAuth(). Ver ETAPA B: confirmado que este provider recibe
      // `request: Request` como segundo argumento (next-auth 5.0.0-beta.30
      // / @auth/core), por lo que resolveRequestHostname(request) puede
      // leer sus headers directamente.
      authorize: authorizeCredentials,
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
        // FASE VI-C — solo presente para auth_scope="RUNTIME_CLIENT".
        token.organization_id = user.organization_id;
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
      // FASE VI-C — idem: valor crudo, obligatoriedad para RUNTIME_CLIENT
      // se valida en requireRuntimeOrganizationContext(), no aquí.
      session.user.organization_id = token.organization_id as string | undefined;
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8, // 8 horas (jornada laboral)
  },
});
