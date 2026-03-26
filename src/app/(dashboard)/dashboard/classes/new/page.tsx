import Link from "next/link";
import { requireAdmin } from "@/lib/permissions/guards";
import {
  getClassTypeOptions,
  getTrainerOptionsForClass,
  getBranchOptionsForClass,
} from "@/modules/classes/queries";
import { createScheduledClassAction } from "@/modules/classes/actions";
import { ScheduledClassForm } from "@/components/forms/scheduled-class-form";

type Props = { searchParams: Promise<{ date?: string }> };

export default async function NewScheduledClassPage({ searchParams }: Props) {
  const sessionUser = await requireAdmin();
  const sp = await searchParams;

  const [classTypes, trainers, branches] = await Promise.all([
    getClassTypeOptions(sessionUser),
    getTrainerOptionsForClass(sessionUser),
    getBranchOptionsForClass(sessionUser),
  ]);

  const fixedBranchId =
    sessionUser.role === "branch_admin" ? sessionUser.branch_id! : undefined;

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
}
