import Link from "next/link";
import { requireClassViewer } from "@/lib/permissions/guards";
import {
  hasOrganizationModule,
  requireOrganizationModule,
  resolveCommercialEnforcementContext,
} from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";
import { resolveGymClock, TIMEZONE_NOT_CONFIGURED_MESSAGE } from "@/modules/weekly-plans/gym-clock";
import { loadTrainerFollowUp, resolveTrainerFollowUpAccess } from "@/modules/weekly-plans/trainer-follow-up-queries";
import { applyFollowUpFilters, parseFollowUpFilters } from "@/modules/weekly-plans/trainer-follow-up-rules";
import { prisma } from "@/lib/db/prisma";
import { FiltersForm, Notice, QueueSection, StudentsSection, SummarySection } from "./follow-up-sections";

// GYM-5C — panel del entrenador. Solo lectura; la escritura sigue en el
// detalle del plan (GYM-5A), que vuelve a autorizar de forma independiente.

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Header() {
  return (
    <div>
      <h1 className="text-xl font-bold text-zinc-800">Seguimiento de mis alumnos</h1>
      <p className="text-sm text-zinc-500 mt-0.5">
        Planes de entrenamiento asignados a ti: cumplimiento, sesiones pendientes y autorreportes por revisar.
      </p>
    </div>
  );
}

export default async function TrainerFollowUpPage({ searchParams }: { searchParams: SearchParams }) {
  const sessionUser = await requireClassViewer();
  const filters = parseFollowUpFilters(await searchParams);

  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  try {
    await requireOrganizationModule(context.tenantId, "gym.weekly_plans");

    // Rol LIVE trainer + perfil Trainer activo vinculado, ANTES de leer datos.
    const access = await resolveTrainerFollowUpAccess(sessionUser, context);
    if (!access.ok) {
      return (
        <div className="space-y-6">
          <Header />
          <Notice tone="amber">
            {access.message}
            {access.kind === "NOT_TRAINER" && (
              <>
                {" "}
                <Link href="/dashboard/weekly-plans/client-plans" className="underline font-medium">
                  Ir a Planes semanales
                </Link>
              </>
            )}
          </Notice>
        </div>
      );
    }

    const db = context.client ?? prisma;
    const clock = await resolveGymClock(db, context.tenantId);
    if (!clock) {
      return (
        <div className="space-y-6">
          <Header />
          <Notice tone="amber">{TIMEZONE_NOT_CONFIGURED_MESSAGE}</Notice>
        </div>
      );
    }

    // gym.classes apagado ⇒ no se consultan sus tablas y la sección no aparece.
    const commercial = await resolveCommercialEnforcementContext(context.tenantId);
    const includeClasses = hasOrganizationModule(commercial, "gym.classes");
    const data = await loadTrainerFollowUp(db, {
      tenantId: context.tenantId,
      trainer: access.trainer,
      today: clock.today,
      includeClasses,
    });
    const metrics = data.summary !== null;
    const result = applyFollowUpFilters(data.rows, filters, metrics);

    return (
      <div className="space-y-6">
        <Header />
        {data.rows.length === 0 ? (
          <Notice>Aún no tienes planes de entrenamiento asignados.</Notice>
        ) : (
          <>
            <SummarySection data={data} />
            {data.summary && <QueueSection summary={data.summary} />}
            <FiltersForm filters={filters} metrics={metrics} />
            {data.incomplete && (
              <Notice tone="amber">Datos incompletos: el listado muestra los planes legibles sin cifras de cumplimiento.</Notice>
            )}
            <StudentsSection result={result} filters={filters} showAttendance={data.attendance !== null} />
          </>
        )}
      </div>
    );
  } finally {
    await dispose();
  }
}
