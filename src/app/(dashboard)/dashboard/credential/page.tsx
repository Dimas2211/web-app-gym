/**
 * /dashboard/credential
 *
 * Credencial propia del usuario autenticado en el dashboard.
 * Accesible para cualquier rol de staff (trainer, reception, branch_admin, super_admin).
 * Solo muestra los datos del propio usuario — no permite ver ni editar credenciales ajenas.
 */
import { redirect } from "next/navigation";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { CredentialCard } from "@/components/ui/credential-card";
import { PrintButton } from "@/components/ui/print-button";
import { ROLE_LABELS } from "@/lib/utils/roles";

export default async function MyCredentialPage() {
  const sessionUser = await getSessionOrRedirect();

  // El rol client usa el portal, no el dashboard
  if (sessionUser.role === "client") redirect("/portal/credencial");

  // Obtener los propios datos del usuario con su sucursal y gym
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: {
      branch: { select: { name: true } },
      gym: { select: { name: true } },
    },
  });

  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-xl font-bold text-zinc-800">Mi credencial</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Tu identificación operativa dentro del sistema.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {/* Tarjeta de credencial */}
        <div className="space-y-4">
          <CredentialCard
            person={{
              id: user.id,
              first_name: user.first_name,
              last_name: user.last_name,
              operational_code: user.operational_code,
              avatar_url: user.avatar_url,
              qr_token: user.qr_token,
              status: user.status,
              role: user.role,
              typeLabel: ROLE_LABELS[user.role],
              branchName: user.branch?.name,
            }}
            gymName={user.gym.name}
          />
          <PrintButton />
        </div>

        {/* Panel informativo */}
        <div className="flex-1 space-y-4 max-w-sm">
          {/* Datos del código */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
              Identidad operativa
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-zinc-400">Código operativo</p>
                {user.operational_code ? (
                  <p className="font-mono text-lg font-bold text-zinc-800 mt-0.5">
                    {user.operational_code}
                  </p>
                ) : (
                  <p className="text-sm text-zinc-400 mt-0.5 italic">
                    No asignado — contacta al administrador.
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-zinc-400">Nombre completo</p>
                <p className="text-sm font-medium text-zinc-800 mt-0.5">
                  {user.first_name} {user.last_name}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Rol</p>
                <p className="text-sm font-medium text-zinc-800 mt-0.5">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
              {user.branch && (
                <div>
                  <p className="text-xs text-zinc-400">Sucursal</p>
                  <p className="text-sm font-medium text-zinc-800 mt-0.5">
                    {user.branch.name}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sobre el QR */}
          {user.qr_token && (
            <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4">
              <p className="text-xs font-semibold text-zinc-500 mb-1">Sobre tu QR</p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Este código es único e inmutable. Se usa para identificarte en asistencia,
                control de acceso y futuras validaciones del sistema.
              </p>
            </div>
          )}

          {!user.operational_code && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs text-amber-700 leading-relaxed">
                Tu credencial no tiene código asignado todavía. Un Super Admin puede asignarlo
                desde <strong>Usuarios → [tu nombre] → Credencial</strong>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
