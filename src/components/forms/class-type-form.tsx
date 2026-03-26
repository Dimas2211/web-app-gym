"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ClassActionState } from "@/modules/classes/actions";

type DefaultValues = {
  code?: string | null;
  name?: string;
  description?: string | null;
  default_duration_minutes?: number | null;
  capacity_default?: number | null;
};

type Props = {
  action: (prev: ClassActionState, formData: FormData) => Promise<ClassActionState>;
  typeId?: string;
  defaultValues?: DefaultValues;
  submitLabel?: string;
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-red-500 text-xs mt-1">{errors[0]}</p>;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors"
    >
      {pending ? "Guardando..." : label}
    </button>
  );
}

export function ClassTypeForm({
  action,
  typeId,
  defaultValues = {},
  submitLabel = "Guardar tipo de clase",
}: Props) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-6">
      {typeId && <input type="hidden" name="id" value={typeId} />}

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Información del tipo de clase
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Código interno
            </label>
            <input
              type="text"
              name="code"
              defaultValue={defaultValues.code ?? ""}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="Ej. YOGA-01"
            />
            <FieldError errors={state?.errors?.code} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              defaultValue={defaultValues.name ?? ""}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="Ej. Yoga, CrossFit, Spinning..."
            />
            <FieldError errors={state?.errors?.name} />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Descripción
            </label>
            <textarea
              name="description"
              rows={2}
              defaultValue={defaultValues.description ?? ""}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-none"
            />
            <FieldError errors={state?.errors?.description} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Duración por defecto (minutos)
            </label>
            <input
              type="number"
              name="default_duration_minutes"
              defaultValue={defaultValues.default_duration_minutes ?? ""}
              min={1}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="Ej. 60"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Se usa para calcular el horario de fin al programar una clase.
            </p>
            <FieldError errors={state?.errors?.default_duration_minutes} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Capacidad por defecto
            </label>
            <input
              type="number"
              name="capacity_default"
              defaultValue={defaultValues.capacity_default ?? ""}
              min={1}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="Ej. 20"
            />
            <FieldError errors={state?.errors?.capacity_default} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <a
          href="/dashboard/classes/types"
          className="text-sm text-zinc-600 px-4 py-2.5 rounded-lg border border-zinc-300 hover:bg-zinc-50 transition-colors"
        >
          Cancelar
        </a>
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
