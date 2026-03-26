"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { UserRole } from "@prisma/client";
import type { UserActionState } from "@/modules/users/actions";
import { ROLE_LABELS } from "@/lib/utils/roles";

export { ROLE_LABELS };

type BranchOption = { id: string; name: string };
type RoleOption = { value: UserRole; label: string };

type DefaultValues = {
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: UserRole;
  branch_id?: string | null;
};

type UserFormProps = {
  action: (prev: UserActionState, formData: FormData) => Promise<UserActionState>;
  defaultValues?: DefaultValues;
  branches: BranchOption[];
  availableRoles: RoleOption[];
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
      {pending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear usuario"}
    </button>
  );
}

export function UserForm({
  action,
  defaultValues,
  branches,
  availableRoles,
  isEdit = false,
}: UserFormProps) {
  const [state, formAction] = useActionState(action, undefined);
  const [selectedRole, setSelectedRole] = useState<UserRole | "">(
    defaultValues?.role ?? ""
  );

  // super_admin no necesita sucursal
  const requiresBranch = selectedRole !== "super_admin" && selectedRole !== "";

  return (
    <form action={formAction} className="space-y-5 max-w-lg">
      {isEdit && <input type="hidden" name="id" value={defaultValues?.id} />}

      {/* Nombre y apellido en una fila */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="first_name" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            required
            defaultValue={defaultValues?.first_name ?? ""}
            className="w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
          {state?.errors?.first_name && (
            <p className="text-red-600 text-xs mt-1">{state.errors.first_name[0]}</p>
          )}
        </div>
        <div>
          <label htmlFor="last_name" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Apellido <span className="text-red-500">*</span>
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            required
            defaultValue={defaultValues?.last_name ?? ""}
            className="w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
          {state?.errors?.last_name && (
            <p className="text-red-600 text-xs mt-1">{state.errors.last_name[0]}</p>
          )}
        </div>
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Correo electrónico <span className="text-red-500">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={defaultValues?.email ?? ""}
          className="w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
        />
        {state?.errors?.email && (
          <p className="text-red-600 text-xs mt-1">{state.errors.email[0]}</p>
        )}
      </div>

      {/* Rol */}
      <div>
        <label htmlFor="role" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Rol <span className="text-red-500">*</span>
        </label>
        <select
          id="role"
          name="role"
          required
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as UserRole)}
          className="w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
        >
          <option value="">Selecciona un rol...</option>
          {availableRoles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {state?.errors?.role && (
          <p className="text-red-600 text-xs mt-1">{state.errors.role[0]}</p>
        )}
      </div>

      {/* Sucursal (condicional según rol) */}
      <div>
        <label htmlFor="branch_id" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Sucursal {requiresBranch && <span className="text-red-500">*</span>}
        </label>
        <select
          id="branch_id"
          name="branch_id"
          disabled={!requiresBranch}
          defaultValue={defaultValues?.branch_id ?? ""}
          className="w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent disabled:bg-zinc-50 disabled:text-zinc-400"
        >
          <option value="">
            {requiresBranch ? "Selecciona una sucursal..." : "No aplica (acceso global)"}
          </option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {state?.errors?.branch_id && (
          <p className="text-red-600 text-xs mt-1">{state.errors.branch_id[0]}</p>
        )}
      </div>

      {/* Contraseña */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Contraseña {!isEdit && <span className="text-red-500">*</span>}
          {isEdit && (
            <span className="text-zinc-400 font-normal ml-1">(dejar vacío para no cambiar)</span>
          )}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required={!isEdit}
          placeholder={isEdit ? "••••••••" : "Mínimo 8 caracteres"}
          className="w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
        />
        {state?.errors?.password && (
          <p className="text-red-600 text-xs mt-1">{state.errors.password[0]}</p>
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
          href="/dashboard/users"
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
