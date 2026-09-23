"use server";

import { signIn } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { AuthError } from "next-auth";

export type LoginState = { error: string } | undefined;

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = (formData.get("email") ?? "") as string;

  // Determinar destino de redirección según rol antes del signIn.
  // Solo se lee el rol (no la contraseña): la validación real ocurre en
  // authorize() (authorize-credentials.ts), que sí resuelve tenant por
  // hostname. Este lookup es una preview NO autoritativa — desde Gap G
  // (SHARED-PILOT-4A) email ya no es único global, así que puede haber
  // varios Users con este email en tenants distintos; findFirst es
  // seguro aquí porque el middleware (auth.config.ts authorized())
  // re-valida el rol real de la sesión ya autenticada y corrige la
  // ruta si esta preview eligió mal.
  const userPreview = await prisma.user.findFirst({
    where: { email },
    select: { role: true },
  });
  const redirectTo = userPreview?.role === "client" ? "/portal" : "/dashboard";

  try {
    await signIn("credentials", {
      email,
      password: formData.get("password"),
      redirectTo,
    });
  } catch (error) {
    // Auth.js lanza NEXT_REDIRECT para la redirección — debe re-lanzarse
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Email o contraseña incorrectos." };
        case "CallbackRouteError":
          return { error: "Error interno. Intenta de nuevo." };
        default:
          return { error: "No se pudo iniciar sesión." };
      }
    }
    throw error; // Re-lanza redirecciones de Next.js
  }
}
