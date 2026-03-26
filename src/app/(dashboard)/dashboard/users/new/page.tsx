import Link from "next/link";
import { requireAdmin } from "@/lib/permissions/guards";
import { getBranchOptions } from "@/modules/branches/queries";
import { UserForm } from "@/components/forms/user-form";
import { createUserAction } from "@/modules/users/actions";
import { getAssignableRoles, ROLE_LABELS } from "@/lib/utils/roles";

export default async function NewUserPage() {
  const user = await requireAdmin();
  const branches = await getBranchOptions(user);

  const availableRoles = getAssignableRoles(user.role).map((r) => ({
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
        <span className="text-zinc-800 font-medium">Nuevo</span>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <h1 className="text-lg font-bold text-zinc-800 mb-6">Nuevo usuario</h1>
        <UserForm
          action={createUserAction}
          branches={branches}
          availableRoles={availableRoles}
        />
      </div>
    </div>
  );
}
