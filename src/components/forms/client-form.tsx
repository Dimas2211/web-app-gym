"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Gender } from "@prisma/client";
import type { ClientActionState } from "@/modules/clients/actions";
import { GENDER_LABELS } from "@/lib/utils/labels";

type Option = { id: string; name: string };
type TrainerOption = { id: string; first_name: string; last_name: string };
type BranchOption = { id: string; name: string };

type DefaultValues = {
  id?: string;
  first_name?: string;
  last_name?: string;
  document_id?: string | null;
  birth_date?: Date | null;
  gender?: Gender | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  sport_id?: string | null;
  goal_id?: string | null;
  assigned_trainer_id?: string | null;
  notes?: string | null;
  branch_id?: string;
};

type ClientFormProps = {
  action: (prev: ClientActionState, formData: FormData) => Promise<ClientActionState>;
  defaultValues?: DefaultValues;
  branches: BranchOption[];
  trainers: TrainerOption[];
  sports: Option[];
  goals: Option[];
  isEdit?: boolean;
  /** Si el usuario solo puede ver su propia sucursal (branch_admin / reception) */
  fixedBranchId?: string | null;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Guardando..." : isEdit ? "Guardar cambios" : "Registrar cliente"}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide pb-1 border-b border-zinc-100 mb-4">
      {children}
    </h3>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
}

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";
const selectCls = inputCls + " bg-white";

export function ClientForm({
  action,
  defaultValues,
  branches,
  trainers,
  sports,
  goals,
  isEdit = false,
  fixedBranchId,
}: ClientFormProps) {
  const [state, formAction] = useActionState(action, undefined);

  const birthDateStr = defaultValues?.birth_date
    ? new Date(defaultValues.birth_date).toISOString().split("T")[0]
    : "";

  return (
    <form action={formAction} className="space-y-8 max-w-2xl">
      {isEdit && <input type="hidden" name="id" value={defaultValues?.id} />}

      {/* Sucursal (oculta si está fija) */}
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
            <option value="">Selecciona una sucursal...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* ── Datos personales ── */}
      <div>
        <SectionTitle>Datos personales</SectionTitle>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre" required error={state?.errors?.first_name?.[0]}>
              <input
                name="first_name"
                type="text"
                required
                defaultValue={defaultValues?.first_name ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Apellido" required error={state?.errors?.last_name?.[0]}>
              <input
                name="last_name"
                type="text"
                required
                defaultValue={defaultValues?.last_name ?? ""}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Documento / ID" error={state?.errors?.document_id?.[0]}>
              <input
                name="document_id"
                type="text"
                defaultValue={defaultValues?.document_id ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Fecha de nacimiento" error={state?.errors?.birth_date?.[0]}>
              <input
                name="birth_date"
                type="date"
                defaultValue={birthDateStr}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Género" error={state?.errors?.gender?.[0]}>
            <select
              name="gender"
              defaultValue={defaultValues?.gender ?? ""}
              className={selectCls}
            >
              <option value="">Sin especificar</option>
              {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* ── Contacto ── */}
      <div>
        <SectionTitle>Contacto</SectionTitle>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Correo electrónico" error={state?.errors?.email?.[0]}>
              <input
                name="email"
                type="email"
                defaultValue={defaultValues?.email ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Teléfono" error={state?.errors?.phone?.[0]}>
              <input
                name="phone"
                type="tel"
                defaultValue={defaultValues?.phone ?? ""}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Dirección" error={state?.errors?.address?.[0]}>
            <input
              name="address"
              type="text"
              defaultValue={defaultValues?.address ?? ""}
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      {/* ── Contacto de emergencia ── */}
      <div>
        <SectionTitle>Contacto de emergencia</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Nombre"
            error={state?.errors?.emergency_contact_name?.[0]}
          >
            <input
              name="emergency_contact_name"
              type="text"
              defaultValue={defaultValues?.emergency_contact_name ?? ""}
              className={inputCls}
            />
          </Field>
          <Field
            label="Teléfono"
            error={state?.errors?.emergency_contact_phone?.[0]}
          >
            <input
              name="emergency_contact_phone"
              type="tel"
              defaultValue={defaultValues?.emergency_contact_phone ?? ""}
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      {/* ── Perfil deportivo ── */}
      <div>
        <SectionTitle>Perfil deportivo</SectionTitle>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Deporte" error={state?.errors?.sport_id?.[0]}>
              <select
                name="sport_id"
                defaultValue={defaultValues?.sport_id ?? ""}
                className={selectCls}
              >
                <option value="">Sin asignar</option>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Meta" error={state?.errors?.goal_id?.[0]}>
              <select
                name="goal_id"
                defaultValue={defaultValues?.goal_id ?? ""}
                className={selectCls}
              >
                <option value="">Sin asignar</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Entrenador asignado" error={state?.errors?.assigned_trainer_id?.[0]}>
            <select
              name="assigned_trainer_id"
              defaultValue={defaultValues?.assigned_trainer_id ?? ""}
              className={selectCls}
            >
              <option value="">Sin asignar</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.first_name} {t.last_name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* ── Observaciones ── */}
      <div>
        <SectionTitle>Observaciones</SectionTitle>
        <Field label="Notas internas" error={state?.errors?.notes?.[0]}>
          <textarea
            name="notes"
            rows={3}
            defaultValue={defaultValues?.notes ?? ""}
            placeholder="Notas relevantes sobre el cliente..."
            className={inputCls + " resize-none"}
          />
        </Field>
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
          href="/dashboard/clients"
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
