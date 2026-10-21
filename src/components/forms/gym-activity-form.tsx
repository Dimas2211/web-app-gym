"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActivityActionState } from "@/modules/classes/activities-actions";

type Props = {
  action: (prev: ActivityActionState, formData: FormData) => Promise<ActivityActionState>;
  activityId?: string;
  branches: { id: string; name: string }[];
  /** BA: la sede no se elige (la acción la fija con el rol LIVE). */
  canChooseLocation: boolean;
  defaultValues?: {
    code?: string | null;
    name?: string;
    description?: string | null;
    location_id?: string | null;
    sort_order?: number;
  };
};

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400";

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

/** GYM-BOOKINGS 3A — actividad del catálogo (GymActivity). */
export function GymActivityForm({ action, activityId, branches, canChooseLocation, defaultValues = {} }: Props) {
  const [state, formAction] = useActionState(action, undefined);
  const e = state?.errors;

  return (
    <form action={formAction} className="space-y-4">
      {activityId && <input type="hidden" name="id" value={activityId} />}
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{state.error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input type="text" name="name" defaultValue={defaultValues.name ?? ""} className={inputCls} />
          {e?.name?.[0] && <p className="text-red-500 text-xs mt-1">{e.name[0]}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Código</label>
          <input type="text" name="code" defaultValue={defaultValues.code ?? ""} className={inputCls} />
          {e?.code?.[0] && <p className="text-red-500 text-xs mt-1">{e.code[0]}</p>}
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-zinc-700 mb-1">Sucursal</label>
          {canChooseLocation ? (
            <select
              name="location_id"
              defaultValue={defaultValues.location_id ?? ""}
              className={inputCls + " bg-white"}
            >
              <option value="">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
              {branches.find((b) => b.id === defaultValues.location_id)?.name ?? "Tu sucursal"}
            </p>
          )}
          {e?.location_id?.[0] && <p className="text-red-500 text-xs mt-1">{e.location_id[0]}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Orden</label>
          <input
            type="number"
            name="sort_order"
            min={0}
            max={9999}
            defaultValue={defaultValues.sort_order ?? 0}
            className={inputCls}
          />
          {e?.sort_order?.[0] && <p className="text-red-500 text-xs mt-1">{e.sort_order[0]}</p>}
        </div>
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción</label>
          <textarea
            name="description"
            rows={2}
            defaultValue={defaultValues.description ?? ""}
            className={inputCls + " resize-none"}
          />
          {e?.description?.[0] && <p className="text-red-500 text-xs mt-1">{e.description[0]}</p>}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/dashboard/classes/activities"
          className="text-sm text-zinc-600 px-4 py-2.5 rounded-lg border border-zinc-300 hover:bg-zinc-50 transition-colors"
        >
          Cancelar
        </Link>
        <SubmitButton label={activityId ? "Guardar cambios" : "Crear actividad"} />
      </div>
    </form>
  );
}
