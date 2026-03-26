import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";

/**
 * Middleware de autenticación.
 * Usa authConfig (edge-safe) para validar sesión en cada request.
 * Redirige a /login si el usuario no está autenticado en rutas protegidas.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Aplica el middleware a todas las rutas excepto assets estáticos y API interna de Next.js
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
