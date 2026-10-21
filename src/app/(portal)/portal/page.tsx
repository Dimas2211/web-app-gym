import Link from "next/link";
import { requireClient } from "@/lib/permissions/guards";
import {
  getMyActivePlan,
  getMyGeneralTemplates,
  getLastExpiredMembership,
  loadPortalBookings,
  loadPortalMembershipSummary,
} from "@/modules/client-portal/queries";
import { MembershipAlertBanner } from "@/components/ui/membership-alert-banner";
import { openPortalContext } from "@/modules/client-portal/portal-context";
import { formatCalendarDate, MODALITY_LABELS } from "@/modules/client-portal/portal-schedule";
import { PortalAccessNotice } from "./portal-access-notice";

/**
 * Cuenta días hábiles (lun–vie) transcurridos desde `date` hasta hoy,
 * sin incluir el día de vencimiento (empieza a contar el día siguiente).
 */
function countBusinessDaysSince(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(date);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);
  let count = 0;
  while (cursor <= today) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

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

const WEEKDAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default async function PortalHomePage() {
  const sessionUser = await requireClient();

  // FASE VI-D7: tenant/PrismaClient EFECTIVOS bajo sesión runtime — el
  // Client Portal es la superficie más expuesta (usuarios finales reales
  // de un tenant hosteado), nunca debe leer desde el prisma singleton.
  // GYM-BOOKINGS 3B: además rol LIVE client, Client por tenant del contexto
  // y secciones de reservas/membresía solo con su módulo habilitado.
  const access = await openPortalContext(sessionUser, { optionalModules: ["gym.classes", "gym.memberships"] });

  if (!access.ok) {
    if (access.reason !== "NO_PROFILE") return <PortalAccessNotice title="Inicio" denied={access} />;
    return (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-zinc-800">
            Bienvenido, {sessionUser.name?.split(" ")[0]}
          </h1>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <p className="text-amber-800 font-medium">Tu perfil de cliente aún no está configurado.</p>
            <p className="text-amber-700 text-sm mt-1">
              Acércate a recepción para que vinculen tu cuenta con tu expediente.
            </p>
          </div>
        </div>
      );
  }
  const { context, client, modules, dispose } = access;

  try {
    const ref = { id: client.id, branch_id: client.branch_id, modality: client.modality, status: client.status };
    const [membershipSummary, activePlan, portalBookings, generalTemplates] = await Promise.all([
      modules["gym.memberships"]
        ? loadPortalMembershipSummary({ db: context.client, tenantId: context.tenantId, client: ref })
        : Promise.resolve(null),
      getMyActivePlan(client.id, context.client),
      modules["gym.classes"]
        ? loadPortalBookings({ db: context.client, tenantId: context.tenantId, client: ref })
        : Promise.resolve(null),
      getMyGeneralTemplates(client, context.client),
    ]);
    const activeMembership = membershipSummary?.primary ?? null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

  // ── Aviso de vencimiento ──────────────────────────────────────
  type AlertBannerProps =
    | { type: "expiring_soon"; daysRemaining: number; expirationDate: string }
    | { type: "expired"; expirationDate: string }
    | null;

  let membershipAlert: AlertBannerProps = null;
  let plansVisible = true;

  if (activeMembership && membershipSummary) {
    // Fechas de calendario del gimnasio (GymSettings.timezone), no la zona del servidor.
    const daysRemaining = Math.round(
      (Date.parse(`${activeMembership.endDate}T00:00:00Z`) - Date.parse(`${membershipSummary.today}T00:00:00Z`)) /
        (1000 * 60 * 60 * 24)
    );
    if (daysRemaining <= 7) {
      membershipAlert = {
        type: "expiring_soon",
        daysRemaining,
        expirationDate: formatCalendarDate(activeMembership.endDate, { day: "2-digit", month: "short", year: "numeric" }),
      };
    }
  } else if (membershipSummary) {
    const lastExpired = await getLastExpiredMembership(client.id, context.client);
    if (lastExpired) {
      membershipAlert = {
        type: "expired",
        expirationDate: formatDate(lastExpired.end_date),
      };
      const businessDays = countBusinessDaysSince(new Date(lastExpired.end_date));
      if (businessDays >= 3) plansVisible = false;
    }
  }
  // ─────────────────────────────────────────────────────────────

  const upcomingBookings = portalBookings?.upcoming.slice(0, 3) ?? [];

  const todayWeekday = today.getDay();
  const todayPlanDay = activePlan?.days.find((d) => d.weekday === todayWeekday);

  return (
    <div className="space-y-6">
      {/* Aviso de vencimiento de membresía */}
      {membershipAlert && <MembershipAlertBanner {...membershipAlert} />}

      {/* Bienvenida */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-800">
            Hola, {client.first_name}
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            {today.toLocaleDateString("es-MX", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <Link
          href="/portal/credencial"
          className="text-xs font-semibold px-3 py-1.5 rounded-full border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors whitespace-nowrap"
        >
          Mi Carnet
        </Link>
      </div>

      {/* Estado de membresía */}
      {membershipSummary && (
      <div
        className={`rounded-xl border p-5 ${
          activeMembership
            ? "bg-emerald-50 border-emerald-200"
            : "bg-red-50 border-red-200"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Membresía
            </p>
            {activeMembership ? (
              <>
                <p className="text-lg font-bold text-zinc-800 mt-1">
                  {activeMembership.planName}
                </p>
                <p className="text-sm text-zinc-600 mt-0.5">
                  {ACCESS_TYPE_LABELS[activeMembership.accessType]} ·{" "}
                  {MODALITY_LABELS[activeMembership.modality]} ·{" "}
                  Vence el {formatCalendarDate(activeMembership.endDate, { day: "2-digit", month: "short", year: "numeric" })}
                </p>
                {activeMembership.sessionsTotal != null && (
                  <p className="text-sm text-zinc-600 mt-0.5">
                    Sesiones disponibles: {activeMembership.sessionsRemaining} de {activeMembership.sessionsTotal}
                  </p>
                )}
                {activeMembership.modality === "PERSONALIZED" && (
                  <p className="text-sm text-zinc-600 mt-0.5">
                    Entrenador personalizado: {activeMembership.trainerName ?? "sin asignar"}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-red-700 mt-1">Sin membresía activa</p>
                <p className="text-sm text-red-600 mt-0.5">
                  Contacta a recepción para renovar.
                </p>
              </>
            )}
          </div>
          <Link
            href="/portal/membresias"
            className="text-xs text-zinc-500 hover:text-zinc-800 underline shrink-0"
          >
            Ver detalle
          </Link>
        </div>
      </div>
      )}

      {/* Actividad de hoy */}
      {activePlan && plansVisible && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Actividad de hoy
            </p>
            <Link href="/portal/plan-semanal" className="text-xs text-zinc-500 hover:text-zinc-800 underline">
              Ver plan completo
            </Link>
          </div>
          {todayPlanDay ? (
            <div className="space-y-1">
              <p className="font-medium text-zinc-800">
                {todayPlanDay.session_name ?? "Sesión del día"}
              </p>
              {todayPlanDay.focus_area && (
                <p className="text-sm text-zinc-500">{todayPlanDay.focus_area}</p>
              )}
              <p className="text-xs text-zinc-400">{todayPlanDay.duration_minutes} min</p>
              <div className="mt-2">
                <span
                  className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                    todayPlanDay.execution_status === "completed"
                      ? "bg-emerald-100 text-emerald-700"
                      : todayPlanDay.execution_status === "skipped"
                      ? "bg-zinc-100 text-zinc-500"
                      : todayPlanDay.execution_status === "partial"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {todayPlanDay.execution_status === "completed"
                    ? "Completado"
                    : todayPlanDay.execution_status === "skipped"
                    ? "Omitido"
                    : todayPlanDay.execution_status === "partial"
                    ? "Parcial"
                    : "Pendiente"}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No hay sesión programada para hoy.</p>
          )}
        </div>
      )}

      {/* Próximas clases reservadas */}
      {portalBookings && (
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Próximas clases
          </p>
          <Link href="/portal/clases" className="text-xs text-zinc-500 hover:text-zinc-800 underline">
            Ver todas
          </Link>
        </div>
        {upcomingBookings.length > 0 ? (
          <ul className="divide-y divide-zinc-100">
            {upcomingBookings.map((booking) => (
              <li key={booking.ownBookingId} className="py-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-800">
                    {booking.typeName}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatCalendarDate(booking.date, { day: "2-digit", month: "short", year: "numeric" })} ·{" "}
                    {booking.start} – {booking.end} · {booking.trainerName}
                  </p>
                </div>
                <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full shrink-0">
                  Confirmada
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            No tienes clases próximas reservadas.{" "}
            <Link href="/portal/clases" className="text-zinc-700 underline">
              Ver disponibles
            </Link>
          </p>
        )}
      </div>
      )}

      {/* Resumen del plan semanal personalizado */}
      {activePlan && plansVisible && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Plan semanal activo
              </p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-700">
                Personalizado
              </span>
            </div>
            <Link href="/portal/plan-semanal" className="text-xs text-zinc-500 hover:text-zinc-800 underline">
              Ver detalle
            </Link>
          </div>
          <p className="text-sm font-medium text-zinc-800 mb-3">
            {activePlan.template?.name ?? "Plan personalizado"}
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {activePlan.days.map((day) => (
              <div
                key={day.id}
                title={day.session_name ?? WEEKDAY_NAMES[day.weekday]}
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold border ${
                  day.execution_status === "completed"
                    ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                    : day.execution_status === "skipped"
                    ? "bg-zinc-100 border-zinc-300 text-zinc-400"
                    : day.execution_status === "partial"
                    ? "bg-amber-100 border-amber-300 text-amber-700"
                    : day.weekday === todayWeekday
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "bg-white border-zinc-200 text-zinc-500"
                }`}
              >
                {WEEKDAY_NAMES[day.weekday]}
              </div>
            ))}
          </div>
          {generalTemplates.length > 0 && (
            <p className="text-xs text-zinc-400 mt-3">
              También tienes{" "}
              <Link
                href="/portal/plan-semanal"
                className="underline hover:text-zinc-600"
              >
                {generalTemplates.length} programa
                {generalTemplates.length !== 1 ? "s" : ""} general
                {generalTemplates.length !== 1 ? "es" : ""}
              </Link>{" "}
              disponible{generalTemplates.length !== 1 ? "s" : ""}.
            </p>
          )}
        </div>
      )}

      {/* Programación general (cuando no hay plan personalizado activo) */}
      {!activePlan && generalTemplates.length > 0 && plansVisible && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Programación general
              </p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700">
                Según tu perfil
              </span>
            </div>
            <Link
              href="/portal/plan-semanal"
              className="text-xs text-sky-600 hover:text-sky-800 underline"
            >
              Ver programas
            </Link>
          </div>
          <ul className="space-y-1.5">
            {generalTemplates.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="text-sky-400 shrink-0">▸</span>
                <span className="font-medium text-zinc-800">{t.name}</span>
                {(t.target_sport || t.target_goal) && (
                  <span className="text-xs text-zinc-400">
                    (
                    {[t.target_sport?.name, t.target_goal?.name]
                      .filter(Boolean)
                      .join(" · ")}
                    )
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Info de sucursal */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
          Tu información
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-zinc-400">Sucursal</p>
            <p className="font-medium text-zinc-800">{client.branch.name}</p>
          </div>
          {client.sport && (
            <div>
              <p className="text-xs text-zinc-400">Deporte</p>
              <p className="font-medium text-zinc-800">{client.sport.name}</p>
            </div>
          )}
          {client.goal && (
            <div>
              <p className="text-xs text-zinc-400">Meta</p>
              <p className="font-medium text-zinc-800">{client.goal.name}</p>
            </div>
          )}
          {client.assigned_trainer && (
            <div>
              <p className="text-xs text-zinc-400">Entrenador</p>
              <p className="font-medium text-zinc-800">
                {client.assigned_trainer.first_name} {client.assigned_trainer.last_name}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Acceso rápido a credencial */}
      <Link
        href="/portal/credencial"
        className="flex items-center justify-between bg-white rounded-xl border border-zinc-200 shadow-sm p-5 hover:border-zinc-400 hover:shadow-md transition-all group"
      >
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
            Mi carnet digital
          </p>
          {client.operational_code ? (
            <p className="font-mono text-lg font-bold text-zinc-800">
              {client.operational_code}
            </p>
          ) : (
            <p className="text-sm text-zinc-500">Ver credencial con QR</p>
          )}
          <p className="text-xs text-zinc-400 mt-0.5">Incluye código QR para acceso rápido</p>
        </div>
        <span className="text-zinc-400 group-hover:text-zinc-700 transition-colors text-lg">→</span>
      </Link>
    </div>
    );
  } finally {
    await dispose();
  }
}
