import Link from "next/link";
import { requireAdmin } from "@/lib/permissions/guards";
import { createClassTypeAction } from "@/modules/classes/actions";
import { ClassTypeForm } from "@/components/forms/class-type-form";

export default async function NewClassTypePage() {
  await requireAdmin();

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
