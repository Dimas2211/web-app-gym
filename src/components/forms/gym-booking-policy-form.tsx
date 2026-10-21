"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { BookingPolicyActionState } from "@/modules/settings/actions";
import type { GymBookingPolicy } from "@/modules/classes/booking/booking-policy";
import { GYM_BOOKING_POLICY_LIMITS } from "@/modules/settings/schemas";

type Props = {
  action: (prev: BookingPolicyActionState, formData: FormData) => Promise<BookingPolicyActionState>;
  /** Política vigente ya resuelta (resolveGymBookingPolicy): fuente única de defaults. */
  policy: GymBookingPolicy;
};

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors"
    >
      {pending ? "Guardando..." : "Guardar política"}
    </button>
  );
}

function NumberField({
  name,
  label,
  hint,
  value,
  errors,
}: {
  name: keyof typeof GYM_BOOKING_POLICY_LIMITS;
  label: string;
  hint?: string;
  value: number;
  errors?: string[];
}) {
  const limits = GYM_BOOKING_POLICY_LIMITS[name];
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1">{label}</label>
      <input type="number" name={name} min={limits.min} max={limits.max} defaultValue={value} className={inputCls} required />
      {hint && <p className="text-xs text-zinc-400 mt-1">{hint}</p>}
      {errors?.[0] && <p className="text-red-500 text-xs mt-1">{errors[0]}</p>}
    </div>
  );
}

function Toggle({ name, label, hint, checked }: { name: string; label: string; hint?: string; checked: boolean }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 w-4 h-4 rounded border-zinc-300 accent-zinc-800" />
      <span>
        <span className="text-sm text-zinc-700">{label}</span>
        {hint && <span className="block text-xs text-zinc-400">{hint}</span>}
      </span>
    </label>
  );
}

export function GymBookingPolicyForm({ action, policy }: Props) {
  const [state, formAction] = useActionState(action, undefined);
  const e = state?.errors;

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{state.error}</div>
      )}
      {state?.success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-lg">
          {state.success}
        </div>
      )}

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Zona horaria y modalidades</h2>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Zona horaria (IANA)</label>
          <input
            type="text"
            name="timezone"
            defaultValue={policy.timezone ?? ""}
            placeholder="America/El_Salvador"
            className={inputCls}
          />
          <p className="text-xs text-zinc-400 mt-1">
            Sin zona horaria válida las sesiones personalizadas y grupales quedan bloqueadas.
          </p>
          {e?.timezone?.[0] && <p className="text-red-500 text-xs mt-1">{e.timezone[0]}</p>}
        </div>
        <div className="space-y-3">
          <Toggle
            name="personalized_booking_enabled"
            label="Habilitar reservas personalizadas"
            checked={policy.personalizedBookingEnabled}
          />
          <Toggle name="group_booking_enabled" label="Habilitar reservas grupales" checked={policy.groupBookingEnabled} />
        </div>
        <NumberField
          name="personalized_default_capacity"
          label="Cupo por defecto de sesiones personalizadas"
          hint="Se usa si el entrenador y la sesión no definen otro."
          value={policy.personalizedDefaultCapacity}
          errors={e?.personalized_default_capacity}
        />
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Reservas y cancelaciones</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <NumberField
            name="booking_horizon_days"
            label="Horizonte de reserva (días)"
            value={policy.bookingHorizonDays}
            errors={e?.booking_horizon_days}
          />
          <NumberField
            name="booking_min_lead_minutes"
            label="Anticipación mínima (min)"
            hint="Solo aplica al alumno."
            value={policy.bookingMinLeadMinutes}
            errors={e?.booking_min_lead_minutes}
          />
          <NumberField
            name="cancel_min_lead_minutes"
            label="Cancelación sin penalización (min)"
            value={policy.cancelMinLeadMinutes}
            errors={e?.cancel_min_lead_minutes}
          />
        </div>
        <Toggle
          name="late_cancel_consumes_session"
          label="La cancelación tardía consume la sesión"
          checked={policy.lateCancelConsumesSession}
        />
        <Toggle
          name="apply_policy_to_open"
          label="Aplicar también a clases abiertas (NORMAL)"
          hint="Desactivado: las clases abiertas conservan sus reglas actuales."
          checked={policy.applyPolicyToOpen}
        />
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Asistencia y series</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField
            name="attendance_edit_window_hours"
            label="Ventana de edición de asistencia (h)"
            value={policy.attendanceEditWindowHours}
            errors={e?.attendance_edit_window_hours}
          />
          <NumberField
            name="series_generation_weeks"
            label="Semanas a generar por serie"
            value={policy.seriesGenerationWeeks}
            errors={e?.series_generation_weeks}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
