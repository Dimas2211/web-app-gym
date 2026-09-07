import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/permissions/guards";
import {
  getClassTypeOptions,
  getTrainerOptionsForClass,
  getBranchOptionsForClass,
} from "@/modules/classes/queries";
import { createScheduledClassAction } from "@/modules/classes/actions";
import { ScheduledClassForm } from "@/components/forms/scheduled-class-form";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

type Props = { searchParams: Promise<{ date?: string }> };

export default async function NewScheduledClassPage({ searchParams }: Props) {
  const sessionUser = await requireAdmin();
  const sp = await searchParams;

  // PASO 6D: página de escritura pura. Bajo sesión runtime "Operar como
  // cliente" redirige ANTES de cargar los selectores — nunca se cargan
  // options (tipos/entrenadores/sucursales) del tenant real del super_admin.
  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const effectiveUser = context.runtime
    ? { ...sessionUser, tenant_id: context.tenantId }
    : sessionUser;

  try {
    await requireOrganizationModule(context.tenantId, "gym.classes");
    if (context.runtime) {
      redirect("/dashboard/classes");
    }

    const [classTypes, trainers, branches] = await Promise.all([
      getClassTypeOptions(effectiveUser, context.client),
      getTrainerOptionsForClass(effectiveUser, context.client),
      getBranchOptionsForClass(effectiveUser, context.client),
    ]);

    const fixedBranchId =
      sessionUser.role === "branch_admin" ? sessionUser.location_id! : undefined;

    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/classes" className="hover:text-zinc-800 transition-colors">
            Agenda
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Programar clase</span>
        </div>
        <h1 className="text-xl font-bold text-zinc-800">Programar nueva clase</h1>
        <ScheduledClassForm
          action={createScheduledClassAction}
          classTypes={classTypes}
          trainers={trainers}
          branches={branches}
          fixedBranchId={fixedBranchId}
          defaultValues={{ class_date: sp.date }}
          submitLabel="Programar clase"
        />
      </div>
    );
  } finally {
    await dispose();
  }
}
