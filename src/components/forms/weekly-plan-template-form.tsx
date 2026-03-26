"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Gender, PlanLevel } from "@prisma/client";
import type { WeeklyPlanActionState } from "@/modules/weekly-plans/actions";
import { GENDER_LABELS, PLAN_LEVEL_LABELS } from "@/lib/utils/labels";

type BranchOption = { id: string; name: string };
type SportOption = { id: string; name: string };
type GoalOption = { id: string; name: string };

type DefaultValues = {
  id?: string;
  code?: string | null;
  name?: string;
  description?: string | null;
  branch_id?: string | null;
  target_gender?: Gender | null;
  target_sport_id?: string | null;
  target_goal_id?: string | null;
  target_level?: PlanLevel | null;
};

type Props = {
  action: (prev: WeeklyPlanActionState, formData: FormData) => Promise<WeeklyPlanActionState>;
  defaultValues?: DefaultValues;
  branches: BranchOption[];
  sports: SportOption[];
  goals: GoalOption[];
  fixedBranchId?: string | null;
  isEdit?: boolean;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear plantilla"}
    </button>
  );
}

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";
const selectCls = inputCls + " bg-white";

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="text-zinc-400 font-normal ml-1 text-xs">{hint}</span>}
      </label>
      {children}
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
}

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: GENDER_LABELS.male },
  { value: "female", label: GENDER_LABELS.female },
  { value: "other", label: GENDER_LABELS.other },
  { value: "prefer_not_to_say", label: GENDER_LABELS.prefer_not_to_say },
];

const LEVELS: { value: PlanLevel; label: string }[] = [
  { value: "beginner", label: PLAN_LEVEL_LABELS.beginner },
  { value: "intermediate", label: PLAN_LEVEL_LABELS.intermediate },
  { value: "advanced", label: PLAN_LEVEL_LABELS.advanced },
];

export function WeeklyPlanTemplateForm({
  action,
  defaultValues,
  branches,
  sports,
  goals,
  fixedBranchId,
  isEdit = false,
}: Props) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-5 max-w-2xl">
      {isEdit && <input type="hidden" name="id" value={defaultValues?.id} />}

      {/* Sucursal */}
      {fixedBranchId !== undefined ? (
        <input type="hidden" name="branch_id" value={fixedBranchId ?? ""} />
      ) : (
        <Field
          label="Sucursal"
          hint="(vacío = plantilla global para todo el gimnasio)"
          error={state?.errors?.branch_id?.[0]}
        >
          <select
            name="branch_id"
            defaultValue={defaultValues?.branch_id ?? ""}
            className={selectCls}
          >
            <option value="">Global (todo el gimnasio)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Código y nombre */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Código" hint="(opcional)" error={state?.errors?.code?.[0]}>
          <input
            name="code"
            type="text"
            maxLength={20}
            defaultValue={defaultValues?.code ?? ""}
            className={inputCls}
          />
        </Field>
        <div className="col-span-2">
          <Field label="Nombre" required error={state?.errors?.name?.[0]}>
            <input
              name="name"
              type="text"
              required
              defaultValue={defaultValues?.name ?? ""}
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      {/* Descripción */}
      <Field label="Descripción" error={state?.errors?.description?.[0]}>
        <textarea
          name="description"
          rows={2}
          defaultValue={defaultValues?.description ?? ""}
          className={inputCls + " resize-none"}
        />
      </Field>

      {/* Segmentación */}
      <div className="border-t border-zinc-100 pt-4">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
          Segmentación (opcional)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Género objetivo" error={state?.errors?.target_gender?.[0]}>
            <select
              name="target_gender"
              defaultValue={defaultValues?.target_gender ?? ""}
              className={selectCls}
            >
              <option value="">Sin restricción</option>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nivel" error={state?.errors?.target_level?.[0]}>
            <select
              name="target_level"
              defaultValue={defaultValues?.target_level ?? ""}
              className={selectCls}
            >
              <option value="">Sin restricción</option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Deporte objetivo" error={state?.errors?.target_sport_id?.[0]}>
            <select
              name="target_sport_id"
              defaultValue={defaultValues?.target_sport_id ?? ""}
              className={selectCls}
            >
              <option value="">Sin restricción</option>
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Meta objetivo" error={state?.errors?.target_goal_id?.[0]}>
            <select
              name="target_goal_id"
              defaultValue={defaultValues?.target_goal_id ?? ""}
              className={selectCls}
            >
              <option value="">Sin restricción</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton isEdit={isEdit} />
        <Link
          href="/dashboard/weekly-plans/templates"
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
