import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/permissions/guards";
import { createClassTypeAction } from "@/modules/classes/actions";
import { ClassTypeForm } from "@/components/forms/class-type-form";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

export default async function NewClassTypePage() {
  const sessionUser = await requireAdmin();

  // PASO 6D: página de escritura pura. Bajo sesión runtime "Operar como
  // cliente" (siempre solo lectura) redirige ANTES de cargar nada — nunca
  // se renderiza un formulario de alta contra el tenant real del super_admin.
  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  try {
    await requireOrganizationModule(context.tenantId, "gym.classes");
    if (context.runtime) {
      redirect("/dashboard/classes/types");
    }
  } finally {
    await dispose();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/classes/types" className="hover:text-zinc-800 transition-colors">
          Tipos de clase
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Nuevo tipo</span>
      </div>
      <h1 className="text-xl font-bold text-zinc-800">Nuevo tipo de clase</h1>
      <ClassTypeForm action={createClassTypeAction} submitLabel="Crear tipo de clase" />
    </div>
  );
}
