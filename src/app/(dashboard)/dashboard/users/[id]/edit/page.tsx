import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManageUser } from "@/lib/permissions/guards";
import { getUserById } from "@/modules/users/queries";
import { getBranchOptions } from "@/modules/branches/queries";
import { UserForm } from "@/components/forms/user-form";
import { updateUserAction } from "@/modules/users/actions";
import { getAssignableRoles, ROLE_LABELS } from "@/lib/utils/roles";

type Props = { params: Promise<{ id: string }> };

export default async function EditUserPage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  const target = await getUserById(id, sessionUser);
  if (!target || !canManageUser(sessionUser, target)) notFound();

  const branches = await getBranchOptions(sessionUser);

  const availableRoles = getAssignableRoles(sessionUser.role).map((r) => ({
    value: r,
    label: ROLE_LABELS[r],
  }));

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/users" className="hover:text-zinc-800 transition-colors">
          Usuarios
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">
          {target.first_name} {target.last_name}
        </span>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Editar</span>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <h1 className="text-lg font-bold text-zinc-800 mb-6">Editar usuario</h1>
        <UserForm
          action={updateUserAction}
          defaultValues={{
            id: target.id,
            email: target.email,
            first_name: target.first_name,
            last_name: target.last_name,
            role: target.role,
            branch_id: target.branch_id,
          }}
          branches={branches}
          availableRoles={availableRoles}
          isEdit
        />
      </div>
    </div>
  );
}
