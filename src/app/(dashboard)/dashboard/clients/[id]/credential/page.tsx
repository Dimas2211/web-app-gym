import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClientManager, canManageClient } from "@/lib/permissions/guards";
import { getClientById } from "@/modules/clients/queries";
import { getGym } from "@/modules/settings/queries";
import { CredentialCard } from "@/components/ui/credential-card";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { OperationalCodeForm } from "@/components/forms/operational-code-form";
import {
  updateClientOperationalCodeAction,
  updateClientAvatarAction,
} from "@/modules/settings/actions";
import { suggestNextClientCode } from "@/lib/utils/operational-codes";
import { PrintButton } from "@/components/ui/print-button";

type Props = { params: Promise<{ id: string }> };

export default async function ClientCredentialPage({ params }: Props) {
  const sessionUser = await requireClientManager();
  const { id } = await params;

  const [client, gym, nextCode] = await Promise.all([
    getClientById(id, sessionUser),
    getGym(sessionUser),
    suggestNextClientCode(sessionUser.gym_id),
  ]);

  if (!client || !canManageClient(sessionUser, client)) notFound();

  const isSuperAdmin = sessionUser.role === "super_admin";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/clients" className="hover:text-zinc-800 transition-colors">
          Clientes
        </Link>
        <span>/</span>
        <Link
          href={`/dashboard/clients/${id}`}
          className="hover:text-zinc-800 transition-colors"
        >
          {client.first_name} {client.last_name}
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
              id: client.id,
              first_name: client.first_name,
              last_name: client.last_name,
              operational_code: client.operational_code,
              avatar_url: client.avatar_url,
              qr_token: client.qr_token,
              status: client.status,
              typeLabel: "Cliente",
              branchName: client.branch.name,
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
                currentUrl={client.avatar_url}
                entityId={client.id}
                displayName={`${client.first_name} ${client.last_name}`}
                onSaveAction={updateClientAvatarAction}
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
                Identificador corto visible para el personal. Se auto-genera al crear el cliente
                y puede modificarse aquí.
              </p>
              <OperationalCodeForm
                entityId={client.id}
                currentCode={client.operational_code}
                suggestedCode={nextCode}
                action={updateClientOperationalCodeAction}
              />
            </div>

            {/* Token QR */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                Token QR
              </h3>
              <p className="text-xs text-zinc-400 mb-2">
                Identificador estable, generado una sola vez. No cambia al editar nombre o código.
                Listo para control de acceso y asistencia.
              </p>
              {client.qr_token ? (
                <p className="font-mono text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 px-3 py-2 rounded-lg break-all">
                  {client.qr_token}
                </p>
              ) : (
                <p className="text-xs text-amber-600">
                  Sin token QR. Edita y guarda el cliente para generar uno.
                </p>
              )}
            </div>
          </div>
        )}

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
