import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManageTrainer } from "@/lib/permissions/guards";
import {
  getTrainerById,
  getBranchOptions,
  getAvailableUserOptions,
} from "@/modules/trainers/queries";
import { updateTrainerAction } from "@/modules/trainers/actions";
import { TrainerForm } from "@/components/forms/trainer-form";

type Props = { params: Promise<{ id: string }> };

export default async function EditTrainerPage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  const [trainer, branches, userOptions] = await Promise.all([
    getTrainerById(id, sessionUser),
    getBranchOptions(sessionUser),
    getAvailableUserOptions(sessionUser, id),
  ]);

  if (!trainer || !canManageTrainer(sessionUser, trainer)) notFound();

  const fixedBranchId =
    sessionUser.role === "branch_admin" ? sessionUser.branch_id! : undefined;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/trainers" className="hover:text-zinc-800 transition-colors">
          Entrenadores
        </Link>
        <span>/</span>
        <Link
          href={`/dashboard/trainers/${id}`}
          className="hover:text-zinc-800 transition-colors"
        >
          {trainer.first_name} {trainer.last_name}
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Editar</span>
      </div>

      <h1 className="text-xl font-bold text-zinc-800">Editar entrenador</h1>

      <TrainerForm
        action={updateTrainerAction}
        trainerId={id}
        branches={branches}
        userOptions={userOptions}
        fixedBranchId={fixedBranchId}
        defaultValues={{
          first_name: trainer.first_name,
          last_name: trainer.last_name,
          email: trainer.email,
          phone: trainer.phone,
          specialty: trainer.specialty,
          notes: trainer.notes,
          branch_id: trainer.branch_id,
          user_id: trainer.user_id,
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
