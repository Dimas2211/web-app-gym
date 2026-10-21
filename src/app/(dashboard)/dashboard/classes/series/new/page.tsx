import Link from "next/link";
import { redirect } from "next/navigation";
import { openGymAdminPage } from "@/modules/classes/scheduling/admin-page-context";
import { getSeriesFormOptions } from "@/modules/classes/admin-queries";
import { createClassSeriesAction } from "@/modules/classes/series-actions";
import { ClassSeriesForm } from "@/components/forms/class-series-form";

// GYM-BOOKINGS 3A — alta de serie. Support Session (solo lectura) no entra.
export default async function NewClassSeriesPage() {
  const opened = await openGymAdminPage("gym.classes");
  if (!opened.ok) return <div className="p-8 text-sm text-red-500">{opened.error}</div>;
  const { handle, scope } = opened;

  try {
    const { context } = handle;
    if (context.readOnly) redirect("/dashboard/classes/series");
    const options = await getSeriesFormOptions(context.client, context.tenantId, scope.locationId);

    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/classes/series" className="hover:text-zinc-800 transition-colors">
            Series recurrentes
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Nueva</span>
        </div>
        <h1 className="text-xl font-bold text-zinc-800">Nueva serie recurrente</h1>
        <ClassSeriesForm
          action={createClassSeriesAction}
          branches={options.branches}
          classTypes={options.classTypes}
          trainers={options.trainers}
          fixedBranchId={scope.locationId}
        />
      </div>
    );
  } finally {
    await handle.dispose();
  }
}
