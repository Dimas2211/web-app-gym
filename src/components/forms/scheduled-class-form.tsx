"use client";

import Link from "next/link";
import { useActionState, useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import type { ClassActionState } from "@/modules/classes/actions";

type ClassTypeOption = {
  id: string;
  name: string;
  default_duration_minutes: number | null;
  capacity_default: number | null;
};

type TrainerOption = {
  id: string;
  first_name: string;
  last_name: string;
  branch_id: string;
  specialty: string | null;
};

type BranchOption = { id: string; name: string };

type DefaultValues = {
  branch_id?: string;
  class_type_id?: string;
  trainer_id?: string;
  title?: string;
  class_date?: string;
  start_time?: string;
  end_time?: string;
  capacity?: number;
  room_name?: string | null;
  is_personalized?: boolean;
  notes?: string | null;
};

type Props = {
  action: (prev: ClassActionState, formData: FormData) => Promise<ClassActionState>;
  classId?: string;
  classTypes: ClassTypeOption[];
  trainers: TrainerOption[];
  branches: BranchOption[];
  fixedBranchId?: string;
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

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export function ScheduledClassForm({
  action,
  classId,
  classTypes,
  trainers,
  branches,
  fixedBranchId,
  defaultValues = {},
  submitLabel = "Guardar clase",
}: Props) {
  const [state, formAction] = useActionState(action, undefined);

  const [selectedBranchId, setSelectedBranchId] = useState(
    fixedBranchId ?? defaultValues.branch_id ?? ""
  );
  const [selectedTypeId, setSelectedTypeId] = useState(
    defaultValues.class_type_id ?? ""
  );
  const [startTime, setStartTime] = useState(defaultValues.start_time ?? "");
  const [endTime, setEndTime] = useState(defaultValues.end_time ?? "");
  const [capacity, setCapacity] = useState(
    String(defaultValues.capacity ?? "")
  );

  // Filtrar entrenadores por sucursal seleccionada
  const filteredTrainers = selectedBranchId
    ? trainers.filter((t) => t.branch_id === selectedBranchId)
    : trainers;

  // Auto-fill end_time y capacity cuando cambia el tipo o la hora de inicio
  useEffect(() => {
    const classType = classTypes.find((ct) => ct.id === selectedTypeId);
    if (!classType) return;

    if (classType.capacity_default && !defaultValues.capacity) {
      setCapacity(String(classType.capacity_default));
    }
    if (classType.default_duration_minutes && startTime && !defaultValues.end_time) {
      setEndTime(addMinutesToTime(startTime, classType.default_duration_minutes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTypeId, startTime]);

  return (
    <form action={formAction} className="space-y-6">
      {classId && <input type="hidden" name="id" value={classId} />}

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      {/* ── Configuración ── */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Configuración de la clase
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Sucursal */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Sucursal <span className="text-red-500">*</span>
            </label>
            {fixedBranchId ? (
              <>
                <input type="hidden" name="branch_id" value={fixedBranchId} />
                <p className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
                  {branches.find((b) => b.id === fixedBranchId)?.name ?? fixedBranchId}
                </p>
              </>
            ) : (
              <select
                name="branch_id"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 bg-white"
              >
                <option value="">— Selecciona sucursal —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            <FieldError errors={state?.errors?.branch_id} />
          </div>

          {/* Tipo de clase */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Tipo de clase <span className="text-red-500">*</span>
            </label>
            <select
              name="class_type_id"
              value={selectedTypeId}
              onChange={(e) => setSelectedTypeId(e.target.value)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 bg-white"
            >
              <option value="">— Selecciona tipo —</option>
              {classTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.name}
                  {ct.default_duration_minutes ? ` · ${ct.default_duration_minutes} min` : ""}
                </option>
              ))}
            </select>
            <FieldError errors={state?.errors?.class_type_id} />
          </div>

          {/* Entrenador */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Entrenador <span className="text-red-500">*</span>
            </label>
            <select
              name="trainer_id"
              defaultValue={defaultValues.trainer_id ?? ""}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 bg-white"
            >
              <option value="">— Selecciona entrenador —</option>
              {filteredTrainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.first_name} {t.last_name}
                  {t.specialty ? ` · ${t.specialty}` : ""}
                </option>
              ))}
            </select>
            {selectedBranchId && filteredTrainers.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No hay entrenadores activos en esta sucursal.
              </p>
            )}
            <FieldError errors={state?.errors?.trainer_id} />
          </div>

          {/* Título */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              defaultValue={defaultValues.title ?? ""}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="Ej. Yoga matutino avanzado"
            />
            <FieldError errors={state?.errors?.title} />
          </div>
        </div>
      </div>

      {/* ── Horario ── */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Fecha y horario
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Fecha <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="class_date"
              defaultValue={defaultValues.class_date ?? ""}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <FieldError errors={state?.errors?.class_date} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Hora inicio <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              name="start_time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <FieldError errors={state?.errors?.start_time} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Hora fin <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              name="end_time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <FieldError errors={state?.errors?.end_time} />
          </div>
        </div>
      </div>

      {/* ── Cupo y sala ── */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Cupo y sala
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Capacidad <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="capacity"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              min={1}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <FieldError errors={state?.errors?.capacity} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Sala / espacio
            </label>
            <input
              type="text"
              name="room_name"
              defaultValue={defaultValues.room_name ?? ""}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="Ej. Sala A"
            />
            <FieldError errors={state?.errors?.room_name} />
          </div>

          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="is_personalized"
                defaultChecked={defaultValues.is_personalized ?? false}
                className="w-4 h-4 rounded border-zinc-300 accent-zinc-800"
              />
              <span className="text-sm text-zinc-700">Clase personalizada</span>
            </label>
          </div>
        </div>
      </div>

      {/* ── Notas ── */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <label className="block text-sm font-medium text-zinc-700 mb-2">
          Notas
        </label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={defaultValues.notes ?? ""}
          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-none"
        />
      </div>

      {/* ── Acciones ── */}
      <div className="flex items-center justify-end gap-3">
        <Link
          href="/dashboard/classes"
          className="text-sm text-zinc-600 px-4 py-2.5 rounded-lg border border-zinc-300 hover:bg-zinc-50 transition-colors"
        >
          Cancelar
        </Link>
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
