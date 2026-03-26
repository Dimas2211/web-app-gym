"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-zinc-900 text-white py-3 px-4 rounded-lg font-semibold text-sm hover:bg-zinc-800 active:bg-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Verificando..." : "Iniciar sesión"}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useActionState(loginAction, undefined);

  return (
    <div className="min-h-screen bg-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header de la tarjeta */}
        <div className="bg-zinc-900 rounded-t-2xl px-8 py-7 text-center">
          <div className="text-white text-2xl font-black tracking-widest uppercase">
            GYM
          </div>
          <p className="text-zinc-400 text-xs mt-1 tracking-wide uppercase">
            Sistema de gestión
          </p>
        </div>

        {/* Formulario */}
        <div className="bg-white rounded-b-2xl px-8 py-8 shadow-lg">
          <h1 className="text-lg font-semibold text-zinc-800 mb-6">
            Acceso al sistema
          </h1>

          <form action={action} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-zinc-700 mb-1.5"
              >
                Correo electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="usuario@ejemplo.com"
                className="w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-zinc-700 mb-1.5"
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
              />
            </div>

            {state?.error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>{state.error}</span>
              </div>
            )}

            <div className="pt-1">
              <SubmitButton />
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-400 mt-4">
          Sistema GYM · Gestión multi-sucursal
        </p>
      </div>
    </div>
  );
}
