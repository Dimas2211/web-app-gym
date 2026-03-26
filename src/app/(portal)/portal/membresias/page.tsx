import { requireClient } from "@/lib/permissions/guards";
import {
  getClientByUserId,
  getMyActiveMembership,
  getMyMemberships,
} from "@/modules/client-portal/queries";

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const ACCESS_TYPE_LABELS: Record<string, string> = {
  full: "Acceso completo",
  limited: "Acceso limitado",
  classes_only: "Solo clases",
  virtual_only: "Solo virtual",
};

const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  expired: "Vencida",
  cancelled: "Cancelada",
  suspended: "Suspendida",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  partial: "Pago parcial",
  overdue: "Vencido",
  refunded: "Reembolsado",
};

export default async function MembresiasPage() {
  const sessionUser = await requireClient();
  const client = await getClientByUserId(sessionUser.id);

  if (!client) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-zinc-800">Membresía</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">Perfil de cliente no configurado.</p>
          <p className="text-amber-700 text-sm mt-1">
            Acércate a recepción para vincular tu cuenta.
          </p>
        </div>
      </div>
    );
  }

  const [activeMembership, allMemberships] = await Promise.all([
    getMyActiveMembership(client.id),
    getMyMemberships(client.id),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-800">Membresía</h1>

      {/* Membresía activa */}
      {activeMembership ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">
            Membresía activa
          </p>
          <p className="text-xl font-bold text-zinc-800">
            {activeMembership.membership_plan.name}
          </p>
          {activeMembership.membership_plan.description && (
            <p className="text-sm text-zinc-600 mt-1">
              {activeMembership.membership_plan.description}
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
            <div>
              <p className="text-xs text-zinc-500">Tipo de acceso</p>
              <p className="text-sm font-medium text-zinc-800">
                {ACCESS_TYPE_LABELS[activeMembership.membership_plan.access_type]}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Inicio</p>
              <p className="text-sm font-medium text-zinc-800">
                {formatDate(activeMembership.start_date)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Vencimiento</p>
              <p className="text-sm font-bold text-emerald-700">
                {formatDate(activeMembership.end_date)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Pago</p>
              <p className="text-sm font-medium text-zinc-800">
                {PAYMENT_STATUS_LABELS[activeMembership.payment_status]}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Monto total</p>
              <p className="text-sm font-medium text-zinc-800">
                ${Number(activeMembership.final_amount).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <p className="font-semibold text-red-700">Sin membresía activa</p>
          <p className="text-sm text-red-600 mt-1">
            No tienes una membresía vigente en este momento. Contacta a recepción para renovar.
          </p>
        </div>
      )}

      {/* Historial */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
          Historial de membresías
        </p>
        {allMemberships.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay membresías registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Plan</th>
                  <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Inicio</th>
                  <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Fin</th>
                  <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Estado</th>
                  <th className="text-left text-xs text-zinc-400 font-semibold pb-2">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {allMemberships.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 pr-4 font-medium text-zinc-800">
                      {m.membership_plan.name}
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-600">{formatDate(m.start_date)}</td>
                    <td className="py-2.5 pr-4 text-zinc-600">{formatDate(m.end_date)}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          m.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : m.status === "expired"
                            ? "bg-zinc-100 text-zinc-500"
                            : "bg-red-100 text-red-600"
                        }`}
                      >
                        {MEMBERSHIP_STATUS_LABELS[m.status]}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          m.payment_status === "paid"
                            ? "bg-emerald-100 text-emerald-700"
                            : m.payment_status === "pending" || m.payment_status === "partial"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-600"
                        }`}
                      >
                        {PAYMENT_STATUS_LABELS[m.payment_status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
