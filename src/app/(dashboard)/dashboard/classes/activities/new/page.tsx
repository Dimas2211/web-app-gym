import Link from "next/link";
import { redirect } from "next/navigation";
import { openGymAdminPage } from "@/modules/classes/scheduling/admin-page-context";
import { createGymActivityAction } from "@/modules/classes/activities-actions";
import { GymActivityForm } from "@/components/forms/gym-activity-form";

export default async function NewGymActivityPage() {
  const opened = await openGymAdminPage("gym.classes");
  if (!opened.ok) return <div className="p-8 text-sm text-red-500">{opened.error}</div>;
  const { handle, scope } = opened;

  try {
    const { context } = handle;
    if (context.readOnly) redirect("/dashboard/classes/activities");
    const branches = await context.client.branch.findMany({
      where: { tenant_id: context.tenantId, status: "active", ...(scope.locationId ? { id: scope.locationId } : {}) },
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
          <span className="text-zinc-800 font-medium">Nueva</span>
        </div>
        <h1 className="text-xl font-bold text-zinc-800">Nueva actividad</h1>
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <GymActivityForm
            action={createGymActivityAction}
            branches={branches}
            canChooseLocation={scope.isGlobal}
            defaultValues={{ location_id: scope.locationId }}
          />
        </div>
      </div>
    );
  } finally {
    await handle.dispose();
  }
}
