import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManageClass } from "@/lib/permissions/guards";
import {
  getScheduledClassById,
  getClassTypeOptions,
  getTrainerOptionsForClass,
  getBranchOptionsForClass,
} from "@/modules/classes/queries";
import { updateScheduledClassAction } from "@/modules/classes/actions";
import { ScheduledClassForm } from "@/components/forms/scheduled-class-form";

type Props = { params: Promise<{ id: string }> };

export default async function EditScheduledClassPage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  const [scheduledClass, classTypes, trainers, branches] = await Promise.all([
    getScheduledClassById(id, sessionUser),
    getClassTypeOptions(sessionUser),
    getTrainerOptionsForClass(sessionUser),
    getBranchOptionsForClass(sessionUser),
  ]);

  if (!scheduledClass || !canManageClass(sessionUser, scheduledClass)) notFound();

  const fixedBranchId =
    sessionUser.role === "branch_admin" ? sessionUser.branch_id! : undefined;

  const classDateStr = scheduledClass.class_date
    ? new Date(scheduledClass.class_date).toISOString().split("T")[0]
    : "";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/classes" className="hover:text-zinc-800 transition-colors">
          Agenda
        </Link>
        <span>/</span>
        <Link href={`/dashboard/classes/${id}`} className="hover:text-zinc-800 transition-colors">
          {scheduledClass.title}
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Editar</span>
      </div>
      <h1 className="text-xl font-bold text-zinc-800">Editar clase</h1>
      <ScheduledClassForm
        action={updateScheduledClassAction}
        classId={id}
        classTypes={classTypes}
        trainers={trainers}
        branches={branches}
        fixedBranchId={fixedBranchId}
        defaultValues={{
          branch_id: scheduledClass.branch_id,
          class_type_id: scheduledClass.class_type_id,
          trainer_id: scheduledClass.trainer_id,
          title: scheduledClass.title,
          class_date: classDateStr,
          start_time: scheduledClass.start_time,
          end_time: scheduledClass.end_time,
          capacity: scheduledClass.capacity,
          room_name: scheduledClass.room_name,
          is_personalized: scheduledClass.is_personalized,
          notes: scheduledClass.notes,
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
