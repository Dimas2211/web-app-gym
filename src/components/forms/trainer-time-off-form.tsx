"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { TimeOffActionState } from "@/modules/trainers/time-off-actions";

type Props = {
  action: (prev: TimeOffActionState, formData: FormData) => Promise<TimeOffActionState>;
  trainerId: string;
  /** Edición: id de la ausencia y valores actuales. */
  timeOffId?: string;
  defaultValues?: {
    starts_on?: string;
    ends_on?: string;
    start_time?: string | null;
    end_time?: string | null;
    reason?: string | null;
  };
  cancelHref?: string;
};

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors"
    >
      {pending ? "Guardando..." : label}
    </button>
  );
}

/** GYM-BOOKINGS 3A — ausencia del entrenador (día completo o por horario). */
export function TrainerTimeOffForm({ action, trainerId, timeOffId, defaultValues = {}, cancelHref }: Props) {
  const [state, formAction] = useActionState(action, undefined);
  const e = state?.errors;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="trainer_id" value={trainerId} />
      {timeOffId && <input type="hidden" name="id" value={timeOffId} />}

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg space-y-1">
          <p>{state.error}</p>
          {state.conflicts && state.conflicts.length > 0 && (
            <ul className="list-disc pl-5 text-xs">
              {state.conflicts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state?.success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-lg">
          {state.success}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Desde</label>
          <input type="date" name="starts_on" defaultValue={defaultValues.starts_on ?? ""} className={inputCls} required />
          {e?.starts_on?.[0] && <p className="text-red-500 text-xs mt-1">{e.starts_on[0]}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Hasta</label>
          <input type="date" name="ends_on" defaultValue={defaultValues.ends_on ?? ""} className={inputCls} required />
          {e?.ends_on?.[0] && <p className="text-red-500 text-xs mt-1">{e.ends_on[0]}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Hora inicio (opcional)</label>
          <input type="time" name="start_time" defaultValue={defaultValues.start_time ?? ""} className={inputCls} />
          {e?.start_time?.[0] && <p className="text-red-500 text-xs mt-1">{e.start_time[0]}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Hora fin (opcional)</label>
          <input type="time" name="end_time" defaultValue={defaultValues.end_time ?? ""} className={inputCls} />
          {e?.end_time?.[0] && <p className="text-red-500 text-xs mt-1">{e.end_time[0]}</p>}
        </div>
      </div>
      <p className="text-xs text-zinc-400">Sin horas = día completo. Con horas, el intervalo aplica a cada día del rango.</p>

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">Motivo</label>
        <input type="text" name="reason" maxLength={500} defaultValue={defaultValues.reason ?? ""} className={inputCls} />
        {e?.reason?.[0] && <p className="text-red-500 text-xs mt-1">{e.reason[0]}</p>}
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label={timeOffId ? "Guardar cambios" : "Registrar ausencia"} />
        {cancelHref && (
          <Link href={cancelHref} className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors">
            Cancelar
          </Link>
        )}
      </div>
    </form>
  );
}
