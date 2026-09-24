import { redirect } from "next/navigation";

/**
 * Entrypoint raíz neutral (sin branding de vertical).
 * Redirige server-side a /login; el middleware ya reenvía a usuarios
 * autenticados a /dashboard o /portal según su rol.
 */
export default function Home() {
  redirect("/login");
}
