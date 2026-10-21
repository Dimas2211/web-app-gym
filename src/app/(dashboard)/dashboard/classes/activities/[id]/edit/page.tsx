import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { openGymAdminPage } from "@/modules/classes/scheduling/admin-page-context";
import { getGymActivityById } from "@/modules/classes/admin-queries";
import { scopeCoversLocation } from "@/modules/classes/scheduling/admin-support";
import { updateGymActivityAction } from "@/modules/classes/activities-actions";
import { GymActivityForm } from "@/components/forms/gym-activity-form";

type Props = { params: Promise<{ id: string }> };

export default async function EditGymActivityPage({ params }: Props) {
  const { id } = await params;
  const opened = await openGymAdminPage("gym.classes");
  if (!opened.ok) return <div className="p-8 text-sm text-red-500">{opened.error}</div>;
  const { handle, scope } = opened;

  try {
    const { context } = handle;
    if (context.readOnly) redirect("/dashboard/classes/activities");
    const activity = await getGymActivityById(context.client, context.tenantId, id);
    if (!activity || !scopeCoversLocation(scope, activity.location_id)) notFound();
    const branches = await context.client.branch.findMany({
      where: { tenant_id: context.tenantId, ...(scope.locationId ? { id: scope.locationId } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/classes/activities" className="hover:text-zinc-800 transition-colors">
            Actividades
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">{activity.name}</span>
        </div>
        <h1 className="text-xl font-bold text-zinc-800">Editar actividad</h1>
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <GymActivityForm
            action={updateGymActivityAction}
            activityId={activity.id}
            branches={branches}
            canChooseLocation={scope.isGlobal}
            defaultValues={{
              code: activity.code,
              name: activity.name,
              description: activity.description,
              location_id: activity.location_id,
              sort_order: activity.sort_order,
            }}
          />
        </div>
      </div>
    );
  } finally {
    await handle.dispose();
  }
}
