"use client";

import { useActionState } from "react";
import type { SettingsActionState } from "@/modules/settings/actions";

interface GymSettingsFormProps {
  action: (prev: SettingsActionState, formData: FormData) => Promise<SettingsActionState>;
  defaultValues: {
    staff_code_prefix: string;
    staff_code_digits: number;
    staff_code_start: number;
    client_code_prefix: string;
    client_code_digits: number;
    client_code_start: number;
  };
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="mt-1 text-xs text-red-600">{errors[0]}</p>;
}

export function GymSettingsForm({ action, defaultValues }: GymSettingsFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Personal / Staff */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          Códigos de personal (admins, recepción, entrenadores)
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Prefijo
            </label>
            <input
              type="text"
              name="staff_code_prefix"
              defaultValue={defaultValues.staff_code_prefix}
              maxLength={5}
              placeholder="A"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none uppercase"
            />
            <FieldError errors={state?.errors?.staff_code_prefix} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Dígitos mínimos
            </label>
            <input
              type="number"
              name="staff_code_digits"
              defaultValue={defaultValues.staff_code_digits}
              min={1}
              max={8}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
            />
            <FieldError errors={state?.errors?.staff_code_digits} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Número inicial
            </label>
            <input
              type="number"
              name="staff_code_start"
              defaultValue={defaultValues.staff_code_start}
              min={1}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
            />
            <FieldError errors={state?.errors?.staff_code_start} />
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Ejemplo con estos valores: <span className="font-mono font-semibold text-zinc-600">
            {defaultValues.staff_code_prefix}
            {String(defaultValues.staff_code_start).padStart(defaultValues.staff_code_digits, "0")}
          </span>
        </p>
      </div>

      {/* Clientes */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          Códigos de clientes
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Prefijo
            </label>
            <input
              type="text"
              name="client_code_prefix"
              defaultValue={defaultValues.client_code_prefix}
              maxLength={5}
              placeholder="C"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none uppercase"
            />
            <FieldError errors={state?.errors?.client_code_prefix} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Dígitos mínimos
            </label>
            <input
              type="number"
              name="client_code_digits"
              defaultValue={defaultValues.client_code_digits}
              min={1}
              max={8}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
            />
            <FieldError errors={state?.errors?.client_code_digits} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Número inicial
            </label>
            <input
              type="number"
              name="client_code_start"
              defaultValue={defaultValues.client_code_start}
              min={1}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
            />
            <FieldError errors={state?.errors?.client_code_start} />
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Ejemplo con estos valores: <span className="font-mono font-semibold text-zinc-600">
            {defaultValues.client_code_prefix}
            {String(defaultValues.client_code_start).padStart(defaultValues.client_code_digits, "0")}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-zinc-900 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          {pending ? "Guardando..." : "Guardar configuración"}
        </button>
      </div>
    </form>
  );
}
