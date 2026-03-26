import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClientManager, canManageClient } from "@/lib/permissions/guards";
import { getClientById, getTrainersForClient, getGoalOptions, getSportOptions } from "@/modules/clients/queries";
import { getBranchOptions } from "@/modules/branches/queries";
import { ClientForm } from "@/components/forms/client-form";
import { updateClientAction } from "@/modules/clients/actions";

type Props = { params: Promise<{ id: string }> };

export default async function EditClientPage({ params }: Props) {
  const sessionUser = await requireClientManager();
  const { id } = await params;

  const client = await getClientById(id, sessionUser);
  if (!client || !canManageClient(sessionUser, client)) notFound();

  const [branches, trainers, goals, sports] = await Promise.all([
    getBranchOptions(sessionUser),
    getTrainersForClient(sessionUser),
    getGoalOptions(),
    getSportOptions(),
  ]);

  const fixedBranchId =
    sessionUser.role !== "super_admin" ? sessionUser.branch_id : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/clients" className="hover:text-zinc-800 transition-colors">
          Clientes
        </Link>
        <span>/</span>
        <Link
          href={`/dashboard/clients/${client.id}`}
          className="hover:text-zinc-800 transition-colors"
        >
          {client.first_name} {client.last_name}
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Editar</span>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <h1 className="text-lg font-bold text-zinc-800 mb-6">Editar cliente</h1>
        <ClientForm
          action={updateClientAction}
          defaultValues={{
            id: client.id,
            first_name: client.first_name,
            last_name: client.last_name,
            document_id: client.document_id,
            birth_date: client.birth_date,
            gender: client.gender,
            email: client.email,
            phone: client.phone,
            address: client.address,
            emergency_contact_name: client.emergency_contact_name,
            emergency_contact_phone: client.emergency_contact_phone,
            sport_id: client.sport_id,
            goal_id: client.goal_id,
            assigned_trainer_id: client.assigned_trainer_id,
            notes: client.notes,
            branch_id: client.branch_id,
          }}
          branches={branches}
          trainers={trainers}
          goals={goals}
          sports={sports}
          isEdit
          fixedBranchId={fixedBranchId}
        />
      </div>
    </div>
  );
}
