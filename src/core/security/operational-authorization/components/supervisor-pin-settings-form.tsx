"use client";

// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — supervisor-pin-settings-form.tsx
//
// Formulario de Configuración → Seguridad. Establece / cambia /
// restablece la Clave de Supervisor. Nunca muestra ni recibe la clave
// existente: el servidor solo informa si hay una configurada.
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useRef } from "react";
import { setSupervisorPinAction, type SetSupervisorPinState } from "../actions/set-supervisor-pin.action";

interface SupervisorPinSettingsFormProps {
  configured: boolean;
  readOnly: boolean;
  minLength: number;
  maxLength: number;
}

export function SupervisorPinSettingsForm({
  configured,
  readOnly,
  minLength,
  maxLength,
}: SupervisorPinSettingsFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [state, formAction, isPending] = useActionState<SetSupervisorPinState, FormData>(
    setSupervisorPinAction,
    undefined,
  );

  // Nunca conservar la clave en el DOM tras un intento.
  useEffect(() => {
    if (state) formRef.current?.reset();
  }, [state]);

  const inputCls =
    "w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 " +
    "focus:ring-zinc-900 focus:border-transparent text-zinc-800 disabled:bg-zinc-50 disabled:text-zinc-400";

  return (
    <form ref={formRef} action={formAction} className="space-y-4 max-w-sm">
      <div>
        <label htmlFor="new_pin" className="block text-xs font-medium text-zinc-700 mb-1.5">
          {configured ? "Nueva clave de supervisor" : "Clave de supervisor"}
        </label>
        <input
          id="new_pin"
          name="new_pin"
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          maxLength={maxLength}
          required
          disabled={readOnly || isPending}
          className={inputCls}
        />
        <p className="text-xs text-zinc-400 mt-1">
          Entre {minLength} y {maxLength} caracteres, sin espacios.
        </p>
      </div>

      <div>
        <label htmlFor="confirm_pin" className="block text-xs font-medium text-zinc-700 mb-1.5">
          Confirmar clave
        </label>
        <input
          id="confirm_pin"
          name="confirm_pin"
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          maxLength={maxLength}
          required
          disabled={readOnly || isPending}
          className={inputCls}
        />
      </div>

      {state && !state.ok && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={readOnly || isPending}
        className="px-4 py-2 text-sm rounded-lg bg-zinc-900 text-white font-medium hover:bg-zinc-800
                   disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando…" : configured ? "Cambiar / restablecer clave" : "Establecer clave"}
      </button>
    </form>
  );
}
