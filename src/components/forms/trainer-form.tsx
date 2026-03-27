"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import type { TrainerActionState } from "@/modules/trainers/actions";

type BranchOption = { id: string; name: string };
type UserOption = { id: string; first_name: string; last_name: string; email: string };

type DefaultValues = {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  specialty?: string | null;
  notes?: string | null;
  branch_id?: string;
};

type Props = {
  action: (prev: TrainerActionState, formData: FormData) => Promise<TrainerActionState>;
  trainerId?: string; // solo en edición
  branches: BranchOption[];
  /** Usuario ya vinculado al entrenador (muestra info read-only, sin selector) */
  linkedUser?: UserOption | null;
  /** Usuarios disponibles para vincular (solo cuando linkedUser es null) */
  userOptions?: UserOption[];
  fixedBranchId?: string; // branch_admin no puede cambiar sucursal
  defaultValues?: DefaultValues;
  submitLabel?: string;
};

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

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-red-500 text-xs mt-1">{errors[0]}</p>;
}

export function TrainerForm({
  action,
  trainerId,
  branches,
  linkedUser,
  userOptions = [],
  fixedBranchId,
  defaultValues = {},
  submitLabel = "Guardar entrenador",
}: Props) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-6">
      {trainerId && <input type="hidden" name="id" value={trainerId} />}

      {/* Error global */}
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      {/* ── Datos personales ── */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Datos personales
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="first_name"
              defaultValue={defaultValues.first_name ?? ""}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="Nombre"
            />
            <FieldError errors={state?.errors?.first_name} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Apellido <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="last_name"
              defaultValue={defaultValues.last_name ?? ""}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="Apellido"
            />
            <FieldError errors={state?.errors?.last_name} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Correo electrónico
            </label>
            <input
              type="email"
              name="email"
              defaultValue={defaultValues.email ?? ""}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="correo@ejemplo.com"
            />
            <FieldError errors={state?.errors?.email} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Teléfono
            </label>
            <input
              type="tel"
              name="phone"
              defaultValue={defaultValues.phone ?? ""}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="+52 555 000 0000"
            />
            <FieldError errors={state?.errors?.phone} />
          </div>
        </div>
      </div>

      {/* ── Datos profesionales ── */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Perfil profesional
        </h2>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Especialidad
          </label>
          <input
            type="text"
            name="specialty"
            defaultValue={defaultValues.specialty ?? ""}
            className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            placeholder="Ej. Musculación, CrossFit, Yoga..."
          />
          <FieldError errors={state?.errors?.specialty} />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Notas internas
          </label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={defaultValues.notes ?? ""}
            className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-none"
            placeholder="Observaciones, certificaciones, etc."
          />
          <FieldError errors={state?.errors?.notes} />
        </div>
      </div>

      {/* ── Configuración ── */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Configuración
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
                defaultValue={defaultValues.branch_id ?? ""}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 bg-white"
              >
                <option value="">— Selecciona sucursal —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <FieldError errors={state?.errors?.branch_id} />
          </div>

          {/* Cuenta de usuario vinculada */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Cuenta de acceso al sistema
            </label>
            {linkedUser ? (
              // Ya vinculado: mostrar info read-only
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <span className="text-sm text-emerald-800 font-medium">
                  {linkedUser.first_name} {linkedUser.last_name}
                </span>
                <span className="text-xs text-emerald-600">({linkedUser.email})</span>
              </div>
            ) : userOptions.length > 0 ? (
              // Sin vínculo y hay usuarios disponibles: permitir vincular (registros legacy)
              <>
                <select
                  name="user_id"
                  defaultValue=""
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 bg-white"
                >
                  <option value="">— Sin cuenta vinculada —</option>
                  {userOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name} {u.last_name} ({u.email})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-400 mt-1">
                  Vincula un usuario con rol entrenador existente para que pueda iniciar sesión.
                  Los nuevos entrenadores se crean desde el módulo de Usuarios.
                </p>
                <FieldError errors={state?.errors?.user_id} />
              </>
            ) : (
              // Sin vínculo y sin opciones disponibles
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
                <p className="text-sm text-zinc-400">Sin cuenta vinculada</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Para vincular una cuenta, crea un usuario con rol Entrenador desde el módulo de Usuarios.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Acciones ── */}
      <div className="flex items-center justify-end gap-3">
        <Link
          href="/dashboard/trainers"
          className="text-sm text-zinc-600 px-4 py-2.5 rounded-lg border border-zinc-300 hover:bg-zinc-50 transition-colors"
        >
          Cancelar
        </Link>
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
