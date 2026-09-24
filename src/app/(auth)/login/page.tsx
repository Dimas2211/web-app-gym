"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ZOLVI_BRAND, ZolviMark } from "@/components/ui/zolvi-logo";
import { loginAction } from "./actions";

const INPUT_CLASS =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-blue";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand-navy px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-navy-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 active:bg-brand-navy-dark disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Verificando..." : "Iniciar sesión"}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useActionState(loginAction, undefined);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-canvas p-4">
      {/* Halos decorativos con los colores de marca */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-blue/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-brand-magenta/10 blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center text-center">
          <ZolviMark size={64} priority />
          <div className="mt-4 text-3xl font-bold tracking-tight text-brand-navy">
            {ZOLVI_BRAND.name}
          </div>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            {ZOLVI_BRAND.tagline}
          </p>
        </div>

        {/* Tarjeta de acceso */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl shadow-brand-navy/5 ring-1 ring-zinc-200/80">
          <div aria-hidden className="bg-brand-gradient h-1" />

          <div className="px-8 py-8">
            <h1 className="text-lg font-semibold text-brand-navy">Acceso al sistema</h1>
            <p className="mb-6 mt-1 text-sm text-zinc-500">
              Ingresa con tu cuenta para continuar.
            </p>

            <form action={action} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-zinc-700"
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
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-zinc-700"
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
                  className={INPUT_CLASS}
                />
              </div>

              {state?.error && (
                <div className="flex items-start gap-2.5 rounded-lg border border-brand-magenta/30 bg-brand-magenta-soft px-4 py-3 text-sm text-red-700">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <span>{state.error}</span>
                </div>
              )}

              <div className="pt-1">
                <SubmitButton />
              </div>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400">{ZOLVI_BRAND.footer}</p>
      </div>
    </div>
  );
}
