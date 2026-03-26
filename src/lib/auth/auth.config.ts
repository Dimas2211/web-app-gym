import type { NextAuthConfig } from "next-auth";

/**
 * Configuración base compatible con Edge Runtime.
 * NO importa Prisma, bcrypt ni ningún módulo Node.js.
 * Usada por el middleware para validar sesión en cada request.
 *
 * IMPORTANTE: el middleware crea una instancia NextAuth separada con esta
 * config. Sin el callback `session` aquí, los campos personalizados del JWT
 * (role, gym_id, branch_id) no se mapean a session.user y quedarían como
 * undefined. Por eso se incluye un session callback mínimo y edge-safe.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    /**
     * Mapea el campo `role` del JWT a session.user para que el callback
     * `authorized` pueda leer el rol del usuario correctamente.
     *
     * Nota: cuando auth.ts hace `NextAuth({ ...authConfig, callbacks: {...} })`,
     * este callback queda reemplazado por el session callback completo de
     * auth.ts. Solo aplica en el contexto del middleware.
     */
    session({ session, token }) {
      session.user.role = token.role as typeof session.user.role;
      return session;
    },

    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnPortal = nextUrl.pathname.startsWith("/portal");
      const isOnLogin = nextUrl.pathname === "/login";
      const role = auth?.user?.role as string | undefined;

      // Rutas del dashboard (staff): requieren sesión y no ser cliente
      if (isOnDashboard) {
        if (!isLoggedIn) return false;
        if (role === "client") {
          return Response.redirect(new URL("/portal", nextUrl));
        }
        return true;
      }

      // Rutas del portal (clientes): requieren sesión y ser cliente
      if (isOnPortal) {
        if (!isLoggedIn) return false;
        if (role !== "client") {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      // Si ya inició sesión y va al login, redirige según rol
      if (isOnLogin && isLoggedIn) {
        if (role === "client") {
          return Response.redirect(new URL("/portal", nextUrl));
        }
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
  },
  providers: [], // Los providers se añaden solo en auth.ts (Node.js)
} satisfies NextAuthConfig;
