"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { SettingsActionState } from "@/modules/settings/actions";

type DefaultValues = {
  id?: string;
  name?: string;
  description?: string | null;
};

type GoalFormProps = {
  action: (prev: SettingsActionState, formData: FormData) => Promise<SettingsActionState>;
  defaultValues?: DefaultValues;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear meta"}
    </button>
  );
}

export function GoalForm({ action, defaultValues }: GoalFormProps) {
  const [state, formAction] = useActionState(action, undefined);
  const isEdit = !!defaultValues?.id;

  return (
    <form action={formAction} className="space-y-5 max-w-lg">
      {isEdit && <input type="hidden" name="id" value={defaultValues?.id} />}

      {/* Nombre */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Nombre <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultValues?.name ?? ""}
          placeholder="Pérdida de peso, Hipertrofia, Rendimiento..."
          className="w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
        />
        {state?.errors?.name && (
          <p className="text-red-600 text-xs mt-1">{state.errors.name[0]}</p>
        )}
      </div>

      {/* Descripción */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Descripción
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ""}
          placeholder="Describe brevemente esta meta de entrenamiento..."
          className="w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-none"
        />
        {state?.errors?.description && (
          <p className="text-red-600 text-xs mt-1">{state.errors.description[0]}</p>
        )}
      </div>

      {/* Error general */}
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton isEdit={isEdit} />
        <a
          href="/dashboard/settings/goals"
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
