import { requireClient } from "@/lib/permissions/guards";
import { loadPortalMembershipSummary, type PortalMembershipView } from "@/modules/client-portal/queries";
import { openPortalContext } from "@/modules/client-portal/portal-context";
import { formatCalendarDate, MODALITY_LABELS } from "@/modules/client-portal/portal-schedule";
import { PortalAccessNotice } from "../portal-access-notice";

// GYM-BOOKINGS 3B: lectura autorizada (gym.memberships, rol LIVE, Client
// desde la sesión) y resumen por modalidad: snapshot de sesiones
// (sessions_total / sessions_used del trigger) y entrenador PERSONALIZED
// de la membresía (ClientMembership.assigned_trainer_id → Trainer).

function formatDate(date: string) {
  return formatCalendarDate(date, { day: "2-digit", month: "short", year: "numeric" });
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

/** Saldo mostrado: solo si hay snapshot de sesiones; NORMAL (null) no se convierte en cero. */
function sessionsLabel(m: PortalMembershipView): string | null {
  if (m.sessionsTotal != null) return `${m.sessionsRemaining} de ${m.sessionsTotal} (usadas: ${m.sessionsUsed})`;
  return m.modality === "NORMAL" ? null : "Sin límite de sesiones";
}

function MembershipCard({ m, highlight }: { m: PortalMembershipView; highlight: boolean }) {
  const sessions = sessionsLabel(m);
  return (
    <div className={`rounded-xl border p-5 ${highlight ? "bg-emerald-50 border-emerald-200" : "bg-white border-zinc-200"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xl font-bold text-zinc-800">{m.planName}</p>
          {m.planDescription && <p className="text-sm text-zinc-600 mt-1">{m.planDescription}</p>}
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-700">
          {MODALITY_LABELS[m.modality]}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
        <div>
          <p className="text-xs text-zinc-500">Tipo de acceso</p>
          <p className="text-sm font-medium text-zinc-800">{ACCESS_TYPE_LABELS[m.accessType] ?? m.accessType}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Inicio</p>
          <p className="text-sm font-medium text-zinc-800">{formatDate(m.startDate)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Vencimiento</p>
          <p className="text-sm font-bold text-emerald-700">{formatDate(m.endDate)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Estado</p>
          <p className="text-sm font-medium text-zinc-800">{MEMBERSHIP_STATUS_LABELS[m.status]}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Pago</p>
          <p className="text-sm font-medium text-zinc-800">{PAYMENT_STATUS_LABELS[m.paymentStatus]}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Monto total</p>
          <p className="text-sm font-medium text-zinc-800">${m.finalAmount}</p>
        </div>
        {sessions && (
          <div>
            <p className="text-xs text-zinc-500">Sesiones disponibles</p>
            <p className="text-sm font-bold text-zinc-800">{sessions}</p>
          </div>
        )}
        {m.modality === "PERSONALIZED" && (
          <div>
            <p className="text-xs text-zinc-500">Entrenador autorizado</p>
            <p className={`text-sm font-medium ${m.trainerName ? "text-zinc-800" : "text-amber-700"}`}>
              {m.trainerName ?? "Sin asignar"}
            </p>
          </div>
        )}
      </div>

      {m.trainerMissing && (
        <p className="text-xs text-amber-700 mt-3">
          Esta membresía no tiene entrenador asignado: no podrás reservar sesiones personalizadas hasta que recepción lo asigne.
        </p>
      )}
      {m.modalityMismatch && (
        <p className="text-xs text-amber-700 mt-3">
          La modalidad de esta membresía no coincide con tu modalidad actual; no autoriza reservas.
        </p>
      )}
      {m.sessionsRemaining === 0 && (
        <p className="text-xs text-amber-700 mt-3">Ya usaste todas las sesiones de esta membresía.</p>
      )}
    </div>
  );
}

export default async function MembresiasPage() {
  const sessionUser = await requireClient();
  const access = await openPortalContext(sessionUser, { module: "gym.memberships" });
  if (!access.ok) return <PortalAccessNotice title="Membresía" denied={access} />;
  const { context, client, dispose } = access;

  try {
    const summary = await loadPortalMembershipSummary({ db: context.client, tenantId: context.tenantId, client });
    const others = summary.current.filter((m) => m.id !== summary.primary?.id);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Membresía</h1>
          <p className="text-sm text-zinc-500 mt-1">Tu modalidad: {MODALITY_LABELS[summary.clientModality]}</p>
        </div>

        {summary.primary ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Membresía vigente</p>
            <MembershipCard m={summary.primary} highlight />
            {others.length > 0 && (
              <>
                <p className="text-xs text-zinc-500">
                  También tienes {others.length} membresía{others.length !== 1 ? "s" : ""} vigente{others.length !== 1 ? "s" : ""}. Al
                  reservar, el sistema usa la que corresponde a la sesión.
                </p>
                {others.map((m) => (
                  <MembershipCard key={m.id} m={m} highlight={false} />
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <p className="font-semibold text-red-700">Sin membresía activa</p>
            <p className="text-sm text-red-600 mt-1">
              No tienes una membresía vigente en este momento. Contacta a recepción para renovar.
            </p>
          </div>
        )}

        {summary.upcoming.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Próximas</p>
            {summary.upcoming.map((m) => (
              <MembershipCard key={m.id} m={m} highlight={false} />
            ))}
          </div>
        )}

        {/* Historial */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">Historial de membresías</p>
          {summary.history.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay membresías registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Plan</th>
                    <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Modalidad</th>
                    <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Inicio</th>
                    <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Fin</th>
                    <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Sesiones</th>
                    <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Estado</th>
                    <th className="text-left text-xs text-zinc-400 font-semibold pb-2">Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {summary.history.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-4 font-medium text-zinc-800">{m.planName}</td>
                      <td className="py-2.5 pr-4 text-zinc-600">{MODALITY_LABELS[m.modality]}</td>
                      <td className="py-2.5 pr-4 text-zinc-600">{formatDate(m.startDate)}</td>
                      <td className="py-2.5 pr-4 text-zinc-600">{formatDate(m.endDate)}</td>
                      <td className="py-2.5 pr-4 text-zinc-600">
                        {m.sessionsTotal != null ? `${m.sessionsUsed}/${m.sessionsTotal}` : "—"}
                      </td>
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
                            m.paymentStatus === "paid"
                              ? "bg-emerald-100 text-emerald-700"
                              : m.paymentStatus === "pending" || m.paymentStatus === "partial"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {PAYMENT_STATUS_LABELS[m.paymentStatus]}
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
  } finally {
    await dispose();
  }
}
