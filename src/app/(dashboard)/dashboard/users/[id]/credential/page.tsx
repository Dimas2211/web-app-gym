import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManageUser } from "@/lib/permissions/guards";
import { getUserById } from "@/modules/users/queries";
import { getGym } from "@/modules/settings/queries";
import { CredentialCard } from "@/components/ui/credential-card";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { OperationalCodeForm } from "@/components/forms/operational-code-form";
import {
  updateUserOperationalCodeAction,
  updateUserAvatarAction,
} from "@/modules/settings/actions";
import { suggestNextStaffCode } from "@/lib/utils/operational-codes";
import { ROLE_LABELS } from "@/lib/utils/roles";
import { PrintButton } from "@/components/ui/print-button";

type Props = { params: Promise<{ id: string }> };

export default async function UserCredentialPage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  const [target, gym, nextCode] = await Promise.all([
    getUserById(id, sessionUser),
    getGym(sessionUser),
    suggestNextStaffCode(sessionUser.gym_id),
  ]);

  if (!target || !canManageUser(sessionUser, target) || target.role === "client") notFound();

  const isSuperAdmin = sessionUser.role === "super_admin";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/users" className="hover:text-zinc-800 transition-colors">
          Usuarios
        </Link>
        <span>/</span>
        <Link
          href={`/dashboard/users/${id}/edit`}
          className="hover:text-zinc-800 transition-colors"
        >
          {target.first_name} {target.last_name}
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Credencial</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Columna izquierda — Credencial */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Vista de credencial</h2>

          <CredentialCard
            person={{
              id: target.id,
              first_name: target.first_name,
              last_name: target.last_name,
              operational_code: target.operational_code,
              avatar_url: target.avatar_url,
              qr_token: target.qr_token,
              status: target.status,
              role: target.role,
              typeLabel: ROLE_LABELS[target.role],
              branchName: target.branch?.name,
            }}
            gymName={gym?.name ?? "Gimnasio"}
          />

          <PrintButton />
        </div>

        {/* Columna derecha — Gestión de identidad (solo super_admin) */}
        {isSuperAdmin && (
          <div className="space-y-5">
            {/* Foto / Avatar */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
                Foto de perfil
              </h3>
              <AvatarUpload
                currentUrl={target.avatar_url}
                entityId={target.id}
                displayName={`${target.first_name} ${target.last_name}`}
                onSaveAction={updateUserAvatarAction}
              />
              <p className="mt-3 text-xs text-amber-600">
                Nota: En Vercel la subida local no persiste. Para producción configura Supabase Storage.
              </p>
            </div>

            {/* Código operativo */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                Código operativo
              </h3>
              <p className="text-xs text-zinc-400 mb-4">
                Identificador corto visible para el personal del gimnasio.
                Se auto-genera al crear el usuario y puede modificarse aquí.
              </p>
              <OperationalCodeForm
                entityId={target.id}
                currentCode={target.operational_code}
                suggestedCode={nextCode}
                action={updateUserOperationalCodeAction}
              />
            </div>

            {/* Token QR */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                Token QR
              </h3>
              <p className="text-xs text-zinc-400 mb-2">
                Identificador estable generado una sola vez. No cambia aunque se edite el nombre o código.
                Listo para usar en control de acceso, asistencia o validaciones futuras.
              </p>
              {target.qr_token ? (
                <p className="font-mono text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 px-3 py-2 rounded-lg break-all">
                  {target.qr_token}
                </p>
              ) : (
                <p className="text-xs text-amber-600">
                  Sin token QR. Edita y guarda el usuario para generar uno.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Para roles no super_admin: solo vista */}
        {!isSuperAdmin && (
          <div className="bg-zinc-50 rounded-xl border border-dashed border-zinc-200 p-5 flex items-center justify-center">
            <p className="text-sm text-zinc-400 text-center">
              Solo el Super Admin puede editar la identidad operativa.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
