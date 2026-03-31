"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { SettingsActionState } from "@/modules/settings/actions";

type DefaultValues = {
  name?: string;
  slug?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
};

type GymFormProps = {
  action: (prev: SettingsActionState, formData: FormData) => Promise<SettingsActionState>;
  defaultValues?: DefaultValues;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Guardando..." : "Guardar cambios"}
    </button>
  );
}

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";

export function GymForm({ action, defaultValues }: GymFormProps) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-6 max-w-lg">
      {/* Sección: Identidad */}
      <div className="space-y-5">
        <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide border-b border-zinc-100 pb-2">
          Identidad
        </h2>

        {/* Nombre */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Nombre del gimnasio <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={defaultValues?.name ?? ""}
            placeholder="Power Gym, Fitness Zone..."
            className={inputCls}
          />
          {state?.errors?.name && (
            <p className="text-red-600 text-xs mt-1">{state.errors.name[0]}</p>
          )}
        </div>

        {/* Slug */}
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Slug (URL) <span className="text-red-500">*</span>
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            defaultValue={defaultValues?.slug ?? ""}
            placeholder="power-gym, fitness-zone..."
            className={inputCls}
          />
          <p className="text-xs text-zinc-400 mt-1">
            Solo letras minúsculas, números y guiones. Ej: <code>mi-gimnasio</code>
          </p>
          {state?.errors?.slug && (
            <p className="text-red-600 text-xs mt-1">{state.errors.slug[0]}</p>
          )}
        </div>
      </div>

      {/* Sección: Contacto */}
      <div className="space-y-5">
        <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide border-b border-zinc-100 pb-2">
          Contacto
        </h2>

        {/* Dirección */}
        <div>
          <label htmlFor="address" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Dirección
          </label>
          <input
            id="address"
            name="address"
            type="text"
            defaultValue={defaultValues?.address ?? ""}
            placeholder="Av. Principal 123, Col. Centro"
            className={inputCls}
          />
          {state?.errors?.address && (
            <p className="text-red-600 text-xs mt-1">{state.errors.address[0]}</p>
          )}
        </div>

        {/* Teléfono */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Teléfono
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={defaultValues?.phone ?? ""}
            placeholder="+52 555 000 0000"
            className={inputCls}
          />
          {state?.errors?.phone && (
            <p className="text-red-600 text-xs mt-1">{state.errors.phone[0]}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={defaultValues?.email ?? ""}
            placeholder="contacto@migym.com"
            className={inputCls}
          />
          {state?.errors?.email && (
            <p className="text-red-600 text-xs mt-1">{state.errors.email[0]}</p>
          )}
        </div>

        {/* Sitio web */}
        <div>
          <label htmlFor="website" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Sitio web
          </label>
          <input
            id="website"
            name="website"
            type="text"
            defaultValue={defaultValues?.website ?? ""}
            placeholder="https://www.migym.com"
            className={inputCls}
          />
          {state?.errors?.website && (
            <p className="text-red-600 text-xs mt-1">{state.errors.website[0]}</p>
          )}
        </div>
      </div>

      {/* Error general */}
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton />
        <a
          href="/dashboard/settings"
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
