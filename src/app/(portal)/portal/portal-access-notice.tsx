import type { PortalAccessDenied } from "@/modules/client-portal/portal-context";

// GYM-BOOKINGS 3B — mensaje cuando la puerta del portal se cierra
// (módulo no habilitado, rol LIVE distinto de client, sin perfil o runtime
// no disponible). No consulta nada más ni revela detalles internos.

export function PortalAccessNotice({ title, denied }: { title: string; denied: PortalAccessDenied }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-zinc-800">{title}</h1>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <p className="text-amber-800 font-medium">{denied.message}</p>
        {denied.reason === "NO_PROFILE" && (
          <p className="text-amber-700 text-sm mt-1">Acércate a recepción para que vinculen tu cuenta con tu expediente.</p>
        )}
      </div>
    </div>
  );
}
