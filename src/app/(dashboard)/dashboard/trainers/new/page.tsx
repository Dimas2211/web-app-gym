import { redirect } from "next/navigation";

/**
 * Los entrenadores se originan desde el módulo de Usuarios.
 * Al crear un usuario con rol "Entrenador", el perfil operativo se genera automáticamente.
 */
export default function NewTrainerPage() {
  redirect("/dashboard/users/new");
}
