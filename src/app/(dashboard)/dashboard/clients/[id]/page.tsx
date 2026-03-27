import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClientManager, canManageClient } from "@/lib/permissions/guards";
import { getClientById } from "@/modules/clients/queries";
import { getClientMembershipsByClientId } from "@/modules/memberships/queries";
import { getClientWeeklyPlansByClientId } from "@/modules/weekly-plans/queries";
import {
  toggleClientStatusAction,
  toggleClientPortalStatusAction,
} from "@/modules/clients/actions";
import { EnablePortalForm } from "@/components/forms/enable-portal-form";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  GENDER_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  MEMBERSHIP_STATUS_LABELS,
  MEMBERSHIP_STATUS_COLORS,
  DAY_OF_WEEK_LABELS,
  WEEK_DAYS_ORDER,
  EXECUTION_STATUS_LABELS,
  EXECUTION_STATUS_COLORS,
} from "@/lib/utils/labels";
import type { PaymentStatus, MembershipStatus, ExecutionStatus } from "@prisma/client";

type Props = { params: Promise<{ id: string }> };

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="text-sm text-zinc-800 font-medium mt-0.5">{value || "—"}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ClientDetailPage({ params }: Props) {
  const sessionUser = await requireClientManager();
  const { id } = await params;

  const [client, memberships, weeklyPlans] = await Promise.all([
    getClientById(id, sessionUser),
    getClientMembershipsByClientId(id, sessionUser),
    getClientWeeklyPlansByClientId(id, sessionUser),
  ]);

  if (!client || !canManageClient(sessionUser, client)) notFound();

  const birthDateStr = client.birth_date
    ? new Date(client.birth_date).toLocaleDateString("es-MX", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const canEdit = canManageClient(sessionUser, client);

  // Membresía activa actual (primera activa vigente)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeMembership = memberships.find(
    (m) => m.status === "active" && new Date(m.end_date) >= today
  );

  // Plan semanal activo actual
  const activeWeeklyPlan = weeklyPlans.find(
    (p) =>
      p.status === "active" &&
      new Date(p.start_date) <= today &&
      new Date(p.end_date) >= today
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb + acciones */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/clients" className="hover:text-zinc-800 transition-colors">
            Clientes
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">
            {client.first_name} {client.last_name}
          </span>
        </div>

        {canEdit && (
          <div className="flex items-center flex-wrap gap-2">
            <Link
              href={`/dashboard/memberships/client-memberships/new?client_id=${client.id}`}
              className="text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
            >
              + Membresía
            </Link>
            <Link
              href={`/dashboard/clients/${client.id}/edit`}
              className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
            >
              Editar
            </Link>
            <form action={toggleClientStatusAction}>
              <input type="hidden" name="id" value={client.id} />
              <button
                type="submit"
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  client.status === "active"
                    ? "text-amber-700 border-amber-300 hover:bg-amber-50"
                    : "text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                }`}
              >
                {client.status === "active" ? "Desactivar" : "Activar"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Encabezado del cliente */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-800">
              {client.first_name} {client.last_name}
            </h1>
            {client.document_id && (
              <p className="text-sm text-zinc-500 mt-0.5">{client.document_id}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={client.status} />
            <span className="text-xs text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-full">
              {client.branch.name}
            </span>
          </div>
        </div>
      </div>

      {/* Acceso al portal */}
      {canEdit && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
            Acceso al portal del cliente
          </h2>

          {client.user ? (
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="space-y-1">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                    client.user.status === "active"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {client.user.status === "active" ? "Portal activo" : "Portal desactivado"}
                </span>
                <p className="text-sm text-zinc-500">{client.user.email}</p>
              </div>
              <form action={toggleClientPortalStatusAction}>
                <input type="hidden" name="client_id" value={client.id} />
                <button
                  type="submit"
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    client.user.status === "active"
                      ? "text-amber-700 border-amber-200 hover:bg-amber-50"
                      : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                  }`}
                >
                  {client.user.status === "active"
                    ? "Desactivar acceso"
                    : "Reactivar acceso"}
                </button>
              </form>
            </div>
          ) : (
            <div>
              <p className="text-sm text-zinc-400 mb-4">
                Este cliente no tiene acceso al portal. Puedes habilitarlo para que
                pueda consultar sus membresías, clases reservadas y plan semanal.
              </p>
              <EnablePortalForm clientId={client.id} defaultEmail={client.email} />
            </div>
          )}
        </div>
      )}

      {/* Membresía activa */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
          Membresía activa
        </h2>
        {activeMembership ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="font-semibold text-zinc-800">
                {activeMembership.membership_plan.name}
              </p>
              <p className="text-sm text-zinc-500">
                {formatDate(activeMembership.start_date)} → {formatDate(activeMembership.end_date)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  MEMBERSHIP_STATUS_COLORS[activeMembership.status as MembershipStatus]
                }`}
              >
                {MEMBERSHIP_STATUS_LABELS[activeMembership.status as MembershipStatus]}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  PAYMENT_STATUS_COLORS[activeMembership.payment_status as PaymentStatus]
                }`}
              >
                {PAYMENT_STATUS_LABELS[activeMembership.payment_status as PaymentStatus]}
              </span>
              <span className="text-sm font-semibold text-zinc-800">
                ${Number(activeMembership.final_amount).toFixed(2)}
              </span>
              <Link
                href={`/dashboard/memberships/client-memberships/${activeMembership.id}/edit`}
                className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
              >
                Editar
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">Sin membresía activa.</p>
            {canEdit && (
              <Link
                href={`/dashboard/memberships/client-memberships/new?client_id=${client.id}`}
                className="text-sm text-zinc-600 border border-zinc-300 px-3 py-1.5 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
              >
                Asignar membresía
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Plan semanal activo */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Plan semanal activo
          </h2>
          {canEdit && (
            <Link
              href={`/dashboard/weekly-plans/client-plans/new?client_id=${client.id}`}
              className="text-sm text-zinc-600 border border-zinc-300 px-3 py-1.5 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
            >
              + Plan semanal
            </Link>
          )}
        </div>

        {activeWeeklyPlan ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-zinc-800">
                  {activeWeeklyPlan.template?.name ?? "Plan manual"}
                </p>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {new Date(activeWeeklyPlan.start_date).toLocaleDateString("es-MX", {
                    day: "2-digit", month: "short", year: "numeric",
                  })}{" "}
                  →{" "}
                  {new Date(activeWeeklyPlan.end_date).toLocaleDateString("es-MX", {
                    day: "2-digit", month: "short", year: "numeric",
                  })}
                </p>
                {activeWeeklyPlan.trainer && (
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Entrenador: {activeWeeklyPlan.trainer.first_name}{" "}
                    {activeWeeklyPlan.trainer.last_name}
                  </p>
                )}
              </div>
              <Link
                href={`/dashboard/weekly-plans/client-plans/${activeWeeklyPlan.id}`}
                className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
              >
                Ver plan completo
              </Link>
            </div>

            {/* Mini grid de días */}
            {activeWeeklyPlan.days.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5 mt-2">
                {WEEK_DAYS_ORDER.map((weekday) => {
                  const day = activeWeeklyPlan.days.find((d) => d.weekday === weekday);
                  return (
                    <div
                      key={weekday}
                      className={`rounded p-1.5 text-center ${
                        day ? "bg-zinc-100" : "bg-zinc-50 opacity-40"
                      }`}
                    >
                      <p className="text-xs font-semibold text-zinc-500">
                        {DAY_OF_WEEK_LABELS[weekday].slice(0, 3)}
                      </p>
                      {day && (
                        <span
                          className={`mt-0.5 inline-block w-2 h-2 rounded-full ${
                            day.execution_status === "completed"
                              ? "bg-emerald-500"
                              : day.execution_status === "partial"
                              ? "bg-amber-400"
                              : day.execution_status === "skipped"
                              ? "bg-red-400"
                              : "bg-zinc-300"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">Sin plan semanal activo.</p>
            {canEdit && (
              <Link
                href={`/dashboard/weekly-plans/client-plans/new?client_id=${client.id}`}
                className="text-sm text-zinc-600 border border-zinc-300 px-3 py-1.5 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
              >
                Asignar plan
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Grid de datos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Datos personales */}
        <Section title="Datos personales">
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label="Nombre" value={client.first_name} />
            <DetailRow label="Apellido" value={client.last_name} />
            <DetailRow label="Documento / ID" value={client.document_id} />
            <DetailRow label="Fecha de nacimiento" value={birthDateStr} />
            <DetailRow
              label="Género"
              value={client.gender ? GENDER_LABELS[client.gender] : null}
            />
          </div>
        </Section>

        {/* Contacto */}
        <Section title="Contacto">
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label="Correo" value={client.email} />
            <DetailRow label="Teléfono" value={client.phone} />
            <div className="col-span-2">
              <DetailRow label="Dirección" value={client.address} />
            </div>
          </div>
        </Section>

        {/* Contacto de emergencia */}
        <Section title="Contacto de emergencia">
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label="Nombre" value={client.emergency_contact_name} />
            <DetailRow label="Teléfono" value={client.emergency_contact_phone} />
          </div>
        </Section>

        {/* Perfil deportivo */}
        <Section title="Perfil deportivo">
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label="Deporte" value={client.sport?.name} />
            <DetailRow label="Meta" value={client.goal?.name} />
            <div className="col-span-2">
              <DetailRow
                label="Entrenador asignado"
                value={
                  client.assigned_trainer
                    ? `${client.assigned_trainer.first_name} ${client.assigned_trainer.last_name}`
                    : null
                }
              />
            </div>
          </div>
        </Section>
      </div>

      {/* Notas */}
      {client.notes && (
        <Section title="Observaciones">
          <p className="text-sm text-zinc-700 whitespace-pre-wrap">{client.notes}</p>
        </Section>
      )}

      {/* Historial de membresías */}
      {memberships.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
            Historial de membresías
          </h2>
          <div className="space-y-2">
            {memberships.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-zinc-100 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-700">
                    {m.membership_plan.name}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {formatDate(m.start_date)} → {formatDate(m.end_date)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      MEMBERSHIP_STATUS_COLORS[m.status as MembershipStatus]
                    }`}
                  >
                    {MEMBERSHIP_STATUS_LABELS[m.status as MembershipStatus]}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      PAYMENT_STATUS_COLORS[m.payment_status as PaymentStatus]
                    }`}
                  >
                    {PAYMENT_STATUS_LABELS[m.payment_status as PaymentStatus]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auditoría */}
      <div className="text-xs text-zinc-400 text-right">
        Registrado:{" "}
        {new Date(client.created_at).toLocaleDateString("es-MX", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        {" · "}
        Actualizado:{" "}
        {new Date(client.updated_at).toLocaleDateString("es-MX", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </div>
    </div>
  );
}
