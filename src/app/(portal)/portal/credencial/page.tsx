/**
 * /portal/credencial
 *
 * Credencial propia del cliente autenticado en el portal.
 * Solo accesible para role=client. Muestra únicamente los datos propios.
 */
import { requireClient } from "@/lib/permissions/guards";
import { getClientByUserId } from "@/modules/client-portal/queries";
import { prisma } from "@/lib/db/prisma";
import { CredentialCard } from "@/components/ui/credential-card";
import { PrintButton } from "@/components/ui/print-button";

export default async function ClientCredentialPage() {
  const sessionUser = await requireClient();

  const client = await getClientByUserId(sessionUser.id);

  if (!client) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-zinc-800">Mi credencial</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">
            Tu perfil de cliente aún no está configurado.
          </p>
          <p className="text-amber-700 text-sm mt-1">
            Acércate a recepción para que vinculen tu cuenta con tu expediente.
          </p>
        </div>
      </div>
    );
  }

  const gym = await prisma.gym.findUnique({
    where: { id: client.gym_id },
    select: { name: true },
  });

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-xl font-bold text-zinc-800">Mi credencial</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Tu carnet digital como miembro de {gym?.name ?? "el gimnasio"}.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {/* Tarjeta */}
        <div className="space-y-4">
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

        {/* Panel informativo */}
        <div className="flex-1 space-y-4 max-w-sm">
          {/* Datos del código */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
              Tu identificación
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-zinc-400">Código de miembro</p>
                {client.operational_code ? (
                  <p className="font-mono text-lg font-bold text-zinc-800 mt-0.5">
                    {client.operational_code}
                  </p>
                ) : (
                  <p className="text-sm text-zinc-400 mt-0.5 italic">
                    No asignado — contacta a recepción.
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-zinc-400">Nombre</p>
                <p className="text-sm font-medium text-zinc-800 mt-0.5">
                  {client.first_name} {client.last_name}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Sucursal</p>
                <p className="text-sm font-medium text-zinc-800 mt-0.5">
                  {client.branch.name}
                </p>
              </div>
            </div>
          </div>

          {/* Sobre el QR */}
          {client.qr_token && (
            <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4">
              <p className="text-xs font-semibold text-zinc-500 mb-1">Tu código QR</p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Muéstralo en recepción para identificarte rápidamente al ingresar o registrar
                tu asistencia.
              </p>
            </div>
          )}

          {!client.operational_code && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs text-amber-700 leading-relaxed">
                Aún no tienes un código asignado. Acércate a recepción o espera a que
                el administrador lo configure.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
