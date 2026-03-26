import Link from "next/link";
import { requireAdmin } from "@/lib/permissions/guards";
import { getBranchOptions, getAvailableUserOptions } from "@/modules/trainers/queries";
import { createTrainerAction } from "@/modules/trainers/actions";
import { TrainerForm } from "@/components/forms/trainer-form";

export default async function NewTrainerPage() {
  const sessionUser = await requireAdmin();

  const [branches, userOptions] = await Promise.all([
    getBranchOptions(sessionUser),
    getAvailableUserOptions(sessionUser),
  ]);

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
        <span className="text-zinc-800 font-medium">Nuevo entrenador</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-zinc-800">Registrar entrenador</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Crea el perfil profesional del entrenador. Puedes vincularlo a una cuenta de usuario para
          que pueda iniciar sesión.
        </p>
      </div>

      <TrainerForm
        action={createTrainerAction}
        branches={branches}
        userOptions={userOptions}
        fixedBranchId={fixedBranchId}
        submitLabel="Registrar entrenador"
      />
    </div>
  );
}
