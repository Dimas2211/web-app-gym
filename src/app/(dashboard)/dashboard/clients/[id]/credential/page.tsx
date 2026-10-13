import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClientManager } from "@/lib/permissions/guards";
import { CredentialCard } from "@/components/ui/credential-card";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { OperationalCodeForm } from "@/components/forms/operational-code-form";
import { GenerateQrTokenForm } from "@/components/forms/generate-qr-token-form";
import {
  updateClientOperationalCodeAction,
  generateClientQrTokenAction,
} from "@/modules/settings/actions";
import { loadClientCredential } from "@/modules/clients/credential";
import { requireEffectiveVertical } from "@/modules/platform/runtime/effective-vertical";

type Props = { params: Promise<{ id: string }> };

export default async function ClientCredentialPage({ params }: Props) {
  const sessionUser = await requireClientManager();
  const { id } = await params;

  // DB/tenant EFECTIVOS + canManageClient con identidad efectiva (rol LIVE
  // en RUNTIME_CLIENT). Support Session → canEdit=false (solo lectura).
  const result = await loadClientCredential(sessionUser, id, { withSuggestedCode: true });
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-sm text-amber-800">
        {result.message}
      </div>
    );
  }
  const { client, gym, canEdit, suggestedCode, tenantId } = result.data;

  // PASO 6F: "Clientes" es superficie GYM sin module code propio.
  await requireEffectiveVertical(tenantId, "GYM");

  const fullName = `${client.first_name} ${client.last_name}`;

  return (
    <div className="space-y-6 min-w-0">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/clients" className="hover:text-zinc-800 transition-colors">
          Clientes
        </Link>
        <span>/</span>
        <Link
          href={`/dashboard/clients/${id}`}
          className="hover:text-zinc-800 transition-colors break-all"
        >
          {fullName}
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Credencial</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Columna izquierda — Credencial (CR80) */}
        <div className="space-y-4 min-w-0">
          <h2 className="text-sm font-semibold text-zinc-700">Vista de credencial</h2>

          <div className="max-w-full overflow-x-auto pb-1">
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
                branchName: client.branchName,
              }}
              gymName={gym?.name ?? "Gimnasio"}
              logoUrl={gym?.logo_url}
            />
          </div>

          <a
            href={`/dashboard/clients/${client.id}/credential/print`}
            target="_blank"
            rel="noopener"
            className="block w-full max-w-[85.6mm] text-center text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            Imprimir / Guardar PDF
          </a>
          <p className="text-xs text-zinc-400 max-w-[85.6mm]">
            Abre una vista con solo la credencial en tamaño CR80 (85.60 × 53.98 mm).
          </p>
        </div>

        {/* Columna derecha — Gestión de identidad */}
        {canEdit ? (
          <div className="space-y-5 min-w-0">
            {/* Foto */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
                Foto de perfil
              </h3>
              <AvatarUpload
                currentUrl={client.avatar_url}
                uploadEndpoint={`/api/avatars/clients/${client.id}`}
                displayName={fullName}
              />
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
                suggestedCode={suggestedCode}
                action={updateClientOperationalCodeAction}
              />
            </div>

            {/* QR */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                QR de identificación
              </h3>
              <p className="text-xs text-zinc-400 mb-3">
                Identificador estable generado una sola vez. No cambia al editar la foto, el
                nombre ni el código.
              </p>
              {client.qr_token ? (
                <p className="text-xs text-emerald-700">✓ Token QR asignado.</p>
              ) : (
                <GenerateQrTokenForm entityId={client.id} action={generateClientQrTokenAction} />
              )}
            </div>
          </div>
        ) : (
          <div className="bg-zinc-50 rounded-xl border border-dashed border-zinc-200 p-5 flex items-center justify-center">
            <p className="text-sm text-zinc-400 text-center">
              Modo &quot;Operar como cliente&quot; activo (solo lectura): la gestión de identidad
              está deshabilitada.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
