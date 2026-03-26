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
  // Solo se lee el rol (no la contraseña): la validación real ocurre en authorize().
  const userPreview = await prisma.user.findUnique({
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
