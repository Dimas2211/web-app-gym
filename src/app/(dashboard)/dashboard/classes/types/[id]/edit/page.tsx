import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/permissions/guards";
import { getClassTypeById } from "@/modules/classes/queries";
import { updateClassTypeAction } from "@/modules/classes/actions";
import { ClassTypeForm } from "@/components/forms/class-type-form";

type Props = { params: Promise<{ id: string }> };

export default async function EditClassTypePage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  const classType = await getClassTypeById(id, sessionUser);
  if (!classType) notFound();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/classes/types" className="hover:text-zinc-800 transition-colors">
          Tipos de clase
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Editar</span>
      </div>
      <h1 className="text-xl font-bold text-zinc-800">Editar tipo de clase</h1>
      <ClassTypeForm
        action={updateClassTypeAction}
        typeId={id}
        defaultValues={{
          code: classType.code,
          name: classType.name,
          description: classType.description,
          default_duration_minutes: classType.default_duration_minutes,
          capacity_default: classType.capacity_default,
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
