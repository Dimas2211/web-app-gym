import Link from "next/link";
import { requireClassViewer } from "@/lib/permissions/guards";
import {
  hasOrganizationModule,
  requireOrganizationModule,
  resolveCommercialEnforcementContext,
} from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";
import { resolveGymClock, TIMEZONE_NOT_CONFIGURED_MESSAGE } from "@/modules/weekly-plans/gym-clock";
import { loadTrainingAnalytics, resolveTrainingAnalyticsAccess } from "@/modules/weekly-plans/training-analytics-queries";
import { parseAnalyticsFilters, resolveBranchFilter } from "@/modules/weekly-plans/training-analytics-rules";
import { prisma } from "@/lib/db/prisma";
import {
  AttendanceSection,
  BranchesSection,
  EvolutionSection,
  FiltersForm,
  ModalitiesSection,
  Notice,
  OverviewSection,
  RelatedLinks,
  TrainersSection,
} from "./analytics-sections";

// GYM-5D — analítica gerencial de entrenamiento. Solo lectura, solo
// super_admin / branch_admin LIVE. Reutiliza las reglas de GYM-5A/5B/5C;
// ninguna escritura ni acción de servidor.

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Header() {
  return (
    <div>
      <p className="text-sm text-zinc-500">
        <Link href="/dashboard/reports" className="hover:text-zinc-800">
          Reportes
        </Link>{" "}
        / Entrenamiento
      </p>
      <h1 className="text-xl font-bold text-zinc-800 mt-1">Analítica de entrenamiento</h1>
      <p className="text-sm text-zinc-500 mt-0.5">
        Seguimiento agregado de los planes semanales: cumplimiento, registros pendientes, sucursales, entrenadores, asistencia y
        modalidades.
      </p>
    </div>
  );
}

export default async function TrainingAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const sessionUser = await requireClassViewer();
  const filters = parseAnalyticsFilters(await searchParams);

  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  try {
    await requireOrganizationModule(context.tenantId, "gym.weekly_plans");

    // Rol LIVE super_admin / branch_admin con identidad vigente, ANTES de leer datos.
    const access = await resolveTrainingAnalyticsAccess(sessionUser, context);
    if (!access.ok) {
      return (
        <main className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
          <Header />
          <Notice tone="amber">{access.message}</Notice>
        </main>
      );
    }

    const db = context.client ?? prisma;
    const clock = await resolveGymClock(db, context.tenantId);
    if (!clock) {
      return (
        <main className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
          <Header />
          <Notice tone="amber">{TIMEZONE_NOT_CONFIGURED_MESSAGE}</Notice>
        </main>
      );
    }

    // gym.classes apagado ⇒ no se consultan sus tablas y sus indicadores no aparecen.
    const commercial = await resolveCommercialEnforcementContext(context.tenantId);
    const includeClasses = hasOrganizationModule(commercial, "gym.classes");

    // `sede` solo filtra dentro de las sucursales autorizadas; branch_admin siempre su sede.
    const isSuperAdmin = access.role === "super_admin";
    const branchId = isSuperAdmin ? resolveBranchFilter(filters.branch, access.branches.map((b) => b.id)) : null;
    const branches = branchId ? access.branches.filter((b) => b.id === branchId) : access.branches;

    const data = await loadTrainingAnalytics(db, {
      tenantId: context.tenantId,
      branches,
      wholeTenant: isSuperAdmin && branchId === null,
      today: clock.today,
      timezone: clock.timezone,
      range: filters.range,
      includeClasses,
    });

    return (
      <main className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <Header />
        <FiltersForm range={filters.range} branches={access.branches} branchId={branchId} canChooseBranch={isSuperAdmin} />
        <OverviewSection data={data} />
        <EvolutionSection data={data} />
        <BranchesSection
          data={data}
          title={!isSuperAdmin ? "Tu sucursal" : branchId ? "Sucursal seleccionada" : "Comparación entre sucursales"}
          single={!isSuperAdmin || branchId !== null}
        />
        <TrainersSection data={data} classes={includeClasses} />
        <AttendanceSection data={data} />
        <ModalitiesSection data={data} />
        <RelatedLinks classes={includeClasses} />
      </main>
    );
  } finally {
    await dispose();
  }
}
