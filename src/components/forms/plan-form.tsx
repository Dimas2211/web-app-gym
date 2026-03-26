"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AccessType } from "@prisma/client";
import type { MembershipActionState } from "@/modules/memberships/actions";
import { ACCESS_TYPE_LABELS } from "@/lib/utils/labels";

type BranchOption = { id: string; name: string };

type DefaultValues = {
  id?: string;
  code?: string | null;
  name?: string;
  description?: string | null;
  duration_days?: number;
  sessions_limit?: number | null;
  price?: string;
  access_type?: AccessType;
  is_recurring?: boolean;
  branch_id?: string | null;
};

type PlanFormProps = {
  action: (prev: MembershipActionState, formData: FormData) => Promise<MembershipActionState>;
  defaultValues?: DefaultValues;
  branches: BranchOption[];
  /** Si la sucursal está fija (branch_admin no puede cambiarla) */
  fixedBranchId?: string | null;
  isEdit?: boolean;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear plan"}
    </button>
  );
}

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";
const selectCls = inputCls + " bg-white";

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="text-zinc-400 font-normal ml-1 text-xs">{hint}</span>}
      </label>
      {children}
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
}

export function PlanForm({
  action,
  defaultValues,
  branches,
  fixedBranchId,
  isEdit = false,
}: PlanFormProps) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-5 max-w-lg">
      {isEdit && <input type="hidden" name="id" value={defaultValues?.id} />}

      {/* Sucursal */}
      {fixedBranchId ? (
        <input type="hidden" name="branch_id" value={fixedBranchId} />
      ) : (
        <Field
          label="Sucursal"
          hint="(vacío = plan global para todo el gimnasio)"
          error={state?.errors?.branch_id?.[0]}
        >
          <select
            name="branch_id"
            defaultValue={defaultValues?.branch_id ?? ""}
            className={selectCls}
          >
            <option value="">Global (todo el gimnasio)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Código y nombre */}
      <div className="grid grid-cols-3 gap-4">
        <Field label="Código" hint="(opcional)" error={state?.errors?.code?.[0]}>
          <input
            name="code"
            type="text"
            maxLength={20}
            defaultValue={defaultValues?.code ?? ""}
            className={inputCls}
          />
        </Field>
        <div className="col-span-2">
          <Field label="Nombre" required error={state?.errors?.name?.[0]}>
            <input
              name="name"
              type="text"
              required
              defaultValue={defaultValues?.name ?? ""}
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      {/* Descripción */}
      <Field label="Descripción" error={state?.errors?.description?.[0]}>
        <textarea
          name="description"
          rows={2}
          defaultValue={defaultValues?.description ?? ""}
          className={inputCls + " resize-none"}
        />
      </Field>

      {/* Duración, sesiones, precio */}
      <div className="grid grid-cols-3 gap-4">
        <Field label="Duración (días)" required error={state?.errors?.duration_days?.[0]}>
          <input
            name="duration_days"
            type="number"
            min={1}
            required
            defaultValue={defaultValues?.duration_days ?? ""}
            className={inputCls}
          />
        </Field>
        <Field label="Límite sesiones" hint="(opcional)" error={state?.errors?.sessions_limit?.[0]}>
          <input
            name="sessions_limit"
            type="number"
            min={1}
            defaultValue={defaultValues?.sessions_limit ?? ""}
            className={inputCls}
          />
        </Field>
        <Field label="Precio" required error={state?.errors?.price?.[0]}>
          <input
            name="price"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={defaultValues?.price ?? ""}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Tipo de acceso */}
      <Field label="Tipo de acceso" required error={state?.errors?.access_type?.[0]}>
        <select
          name="access_type"
          required
          defaultValue={defaultValues?.access_type ?? "full"}
          className={selectCls}
        >
          {(Object.keys(ACCESS_TYPE_LABELS) as AccessType[]).map((t) => (
            <option key={t} value={t}>
              {ACCESS_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>

      {/* Recurrente */}
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          name="is_recurring"
          type="checkbox"
          defaultChecked={defaultValues?.is_recurring ?? false}
          className="w-4 h-4 rounded border-zinc-300 accent-zinc-900"
        />
        <span className="text-sm text-zinc-700">Plan recurrente (se renueva automáticamente)</span>
      </label>

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton isEdit={isEdit} />
        <a
          href="/dashboard/memberships/plans"
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
