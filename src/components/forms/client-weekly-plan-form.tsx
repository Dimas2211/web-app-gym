"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Status } from "@prisma/client";
import type { WeeklyPlanActionState } from "@/modules/weekly-plans/actions";
import { STATUS_LABELS } from "@/lib/utils/labels";

type BranchOption = { id: string; name: string };
type TrainerOption = { id: string; first_name: string; last_name: string; branch_id: string };
type ClientOption = { id: string; first_name: string; last_name: string; document_id: string | null; branch_id: string };
type TemplateOption = {
  id: string;
  name: string;
  code: string | null;
  target_level: string | null;
  _count: { days: number };
};

type DefaultValues = {
  id?: string;
  client_id?: string;
  branch_id?: string;
  trainer_id?: string | null;
  template_id?: string | null;
  start_date?: string;
  end_date?: string;
  status?: Status;
  notes?: string | null;
};

type Props = {
  action: (prev: WeeklyPlanActionState, formData: FormData) => Promise<WeeklyPlanActionState>;
  defaultValues?: DefaultValues;
  branches: BranchOption[];
  trainers: TrainerOption[];
  clients: ClientOption[];
  templates: TemplateOption[];
  fixedBranchId?: string;
  fixedClientId?: string;
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
      {pending ? "Guardando..." : isEdit ? "Guardar cambios" : "Asignar plan"}
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

export function ClientWeeklyPlanForm({
  action,
  defaultValues,
  branches,
  trainers,
  clients,
  templates,
  fixedBranchId,
  fixedClientId,
  isEdit = false,
}: Props) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-5 max-w-2xl">
      {isEdit && <input type="hidden" name="id" value={defaultValues?.id} />}

      {/* Sucursal */}
      {fixedBranchId ? (
        <input type="hidden" name="branch_id" value={fixedBranchId} />
      ) : (
        <Field label="Sucursal" required error={state?.errors?.branch_id?.[0]}>
          <select
            name="branch_id"
            required
            defaultValue={defaultValues?.branch_id ?? ""}
            className={selectCls}
          >
            <option value="">Seleccionar sucursal…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Cliente */}
      {fixedClientId ? (
        <input type="hidden" name="client_id" value={fixedClientId} />
      ) : (
        <Field label="Cliente" required error={state?.errors?.client_id?.[0]}>
          <select
            name="client_id"
            required
            defaultValue={defaultValues?.client_id ?? ""}
            className={selectCls}
          >
            <option value="">Seleccionar cliente…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.last_name}, {c.first_name}
                {c.document_id ? ` (${c.document_id})` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Plantilla (opcional) */}
      {!isEdit && (
        <Field
          label="Plantilla base"
          hint="(opcional — si no seleccionas, podrás añadir días manualmente)"
          error={state?.errors?.template_id?.[0]}
        >
          <select
            name="template_id"
            defaultValue={defaultValues?.template_id ?? ""}
            className={selectCls}
          >
            <option value="">Sin plantilla (plan manual)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.code ? ` (${t.code})` : ""}
                {" · "}
                {t._count.days} día(s)
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Entrenador */}
      <Field label="Entrenador" hint="(opcional)" error={state?.errors?.trainer_id?.[0]}>
        <select
          name="trainer_id"
          defaultValue={defaultValues?.trainer_id ?? ""}
          className={selectCls}
        >
          <option value="">Sin entrenador asignado</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.last_name}, {t.first_name}
            </option>
          ))}
        </select>
      </Field>

      {/* Fechas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Fecha inicio" required error={state?.errors?.start_date?.[0]}>
          <input
            name="start_date"
            type="date"
            required
            defaultValue={defaultValues?.start_date ?? ""}
            className={inputCls}
          />
        </Field>
        <Field label="Fecha fin" required error={state?.errors?.end_date?.[0]}>
          <input
            name="end_date"
            type="date"
            required
            defaultValue={defaultValues?.end_date ?? ""}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Estado (solo en edición) */}
      {isEdit && (
        <Field label="Estado" required error={state?.errors?.status?.[0]}>
          <select
            name="status"
            required
            defaultValue={defaultValues?.status ?? "active"}
            className={selectCls}
          >
            {(["active", "inactive", "suspended"] as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Notas */}
      <Field label="Notas" hint="(opcional)" error={state?.errors?.notes?.[0]}>
        <textarea
          name="notes"
          rows={2}
          defaultValue={defaultValues?.notes ?? ""}
          className={inputCls + " resize-none"}
        />
      </Field>

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton isEdit={isEdit} />
        <a
          href="/dashboard/weekly-plans/client-plans"
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
