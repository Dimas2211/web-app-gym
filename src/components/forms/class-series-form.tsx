"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { GymSessionKind } from "@prisma/client";
import type { SeriesActionState } from "@/modules/classes/series-actions";
import { GYM_SESSION_KINDS } from "@/modules/classes/schemas";
import { SESSION_KIND_LABELS } from "@/modules/classes/scheduling/scheduling-rules";
import { DAY_OF_WEEK_LABELS, WEEK_DAYS_ORDER } from "@/lib/utils/labels";

type Action = (prev: SeriesActionState, formData: FormData) => Promise<SeriesActionState>;

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400";
const selectCls = inputCls + " bg-white";

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

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-zinc-700 mb-1">
      {children} {required && <span className="text-red-500">*</span>}
    </label>
  );
}

type CreateProps = {
  action: Action;
  branches: { id: string; name: string }[];
  classTypes: { id: string; name: string }[];
  trainers: { id: string; first_name: string; last_name: string; branch_id: string }[];
  fixedBranchId?: string | null;
};

/** GYM-BOOKINGS 3A — alta de una serie recurrente (ClassSeries). */
export function ClassSeriesForm({ action, branches, classTypes, trainers, fixedBranchId }: CreateProps) {
  const [state, formAction] = useActionState(action, undefined);
  const [branchId, setBranchId] = useState(fixedBranchId ?? "");
  const [kind, setKind] = useState<GymSessionKind>("OPEN");
  const e = state?.errors;
  const branchTrainers = branchId ? trainers.filter((t) => t.branch_id === branchId) : trainers;

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{state.error}</div>
      )}

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Configuración</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>Sucursal</Label>
            {fixedBranchId ? (
              <>
                <input type="hidden" name="location_id" value={fixedBranchId} />
                <p className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
                  {branches.find((b) => b.id === fixedBranchId)?.name ?? fixedBranchId}
                </p>
              </>
            ) : (
              <select name="location_id" value={branchId} onChange={(ev) => setBranchId(ev.target.value)} className={selectCls}>
                <option value="">— Selecciona sucursal —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <FieldError errors={e?.location_id} />
          </div>
          <div>
            <Label required>Tipo de sesión</Label>
            <select
              name="session_kind"
              value={kind}
              onChange={(ev) => setKind(ev.target.value as GymSessionKind)}
              className={selectCls}
            >
              {GYM_SESSION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {SESSION_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <FieldError errors={e?.session_kind} />
          </div>
          <div>
            <Label required>Tipo de clase</Label>
            <select name="class_type_id" defaultValue="" className={selectCls}>
              <option value="">— Selecciona tipo —</option>
              {classTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError errors={e?.class_type_id} />
          </div>
          <div>
            <Label required>Entrenador</Label>
            <select name="trainer_id" defaultValue="" className={selectCls}>
              <option value="">— Selecciona entrenador —</option>
              {branchTrainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.first_name} {t.last_name}
                </option>
              ))}
            </select>
            <FieldError errors={e?.trainer_id} />
          </div>
          <div className="sm:col-span-2">
            <Label required>Título</Label>
            <input type="text" name="title" className={inputCls} placeholder="Ej. Funcional lunes 7:00" />
            <FieldError errors={e?.title} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Recurrencia</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label required>Día de la semana</Label>
            <select name="weekday" defaultValue="1" className={selectCls}>
              {WEEK_DAYS_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DAY_OF_WEEK_LABELS[d]}
                </option>
              ))}
            </select>
            <FieldError errors={e?.weekday} />
          </div>
          <div>
            <Label required>Hora inicio</Label>
            <input type="time" name="start_time" className={inputCls} />
            <FieldError errors={e?.start_time} />
          </div>
          <div>
            <Label required>Hora fin</Label>
            <input type="time" name="end_time" className={inputCls} />
            <FieldError errors={e?.end_time} />
          </div>
          <div>
            <Label required>Vigente desde</Label>
            <input type="date" name="valid_from" className={inputCls} />
            <FieldError errors={e?.valid_from} />
          </div>
          <div>
            <Label>Vigente hasta</Label>
            <input type="date" name="valid_until" className={inputCls} />
            <FieldError errors={e?.valid_until} />
          </div>
          <div>
            <Label>Capacidad</Label>
            <input type="number" name="capacity" min={1} className={inputCls} />
            <p className="text-xs text-zinc-400 mt-1">
              {kind === "PERSONALIZED"
                ? "Vacío = cupo personalizado del entrenador o de la configuración."
                : "Vacío = cupo por defecto del tipo de clase."}
            </p>
            <FieldError errors={e?.capacity} />
          </div>
          <div className="sm:col-span-3">
            <Label>Sala / espacio</Label>
            <input type="text" name="room_name" className={inputCls} />
            <FieldError errors={e?.room_name} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/dashboard/classes/series"
          className="text-sm text-zinc-600 px-4 py-2.5 rounded-lg border border-zinc-300 hover:bg-zinc-50 transition-colors"
        >
          Cancelar
        </Link>
        <SubmitButton label="Crear serie" />
      </div>
    </form>
  );
}

type EditProps = {
  action: Action;
  seriesId: string;
  defaultValues: { title: string; capacity: number | null; room_name: string | null; valid_until: string | null };
};

/** Edición de campos no estructurales; las sesiones ya generadas no cambian. */
export function ClassSeriesEditForm({ action, seriesId, defaultValues }: EditProps) {
  const [state, formAction] = useActionState(action, undefined);
  const e = state?.errors;
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={seriesId} />
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{state.error}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label required>Título</Label>
          <input type="text" name="title" defaultValue={defaultValues.title} className={inputCls} />
          <FieldError errors={e?.title} />
        </div>
        <div>
          <Label>Capacidad</Label>
          <input type="number" name="capacity" min={1} defaultValue={defaultValues.capacity ?? ""} className={inputCls} />
          <FieldError errors={e?.capacity} />
        </div>
        <div>
          <Label>Vigente hasta</Label>
          <input type="date" name="valid_until" defaultValue={defaultValues.valid_until ?? ""} className={inputCls} />
          <FieldError errors={e?.valid_until} />
        </div>
        <div className="sm:col-span-2">
          <Label>Sala / espacio</Label>
          <input type="text" name="room_name" defaultValue={defaultValues.room_name ?? ""} className={inputCls} />
        </div>
      </div>
      <p className="text-xs text-zinc-400">
        Los cambios aplican a las sesiones que se generen después. Para cambiar entrenador, día, horario, sede o tipo
        de sesión crea una serie nueva.
      </p>
      <SubmitButton label="Guardar cambios" />
    </form>
  );
}
