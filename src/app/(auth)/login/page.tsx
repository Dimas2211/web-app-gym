"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ZOLVI_BRAND, ZolviLogo, ZolviMark } from "@/components/ui/zolvi-logo";
import { loginAction } from "./actions";

const INPUT_CLASS =
  "w-full rounded-xl border border-dark/15 bg-white px-4 py-3 text-sm text-dark placeholder:text-dark/40 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-secondary";

// Textos del sitio público getzolvi.com.
const HIGHLIGHTS = [
  "Facturación electrónica DTE integrada",
  "Preparado para varias sucursales",
  "Un entorno propio para tu empresa",
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition-colors duration-200 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Verificando..." : "Iniciar sesión"}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useActionState(loginAction, undefined);

  return (
    <div className="flex min-h-screen bg-white">
      {/* Panel de marca (solo escritorio) */}
      <aside
        className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-dark px-12 py-12 text-white lg:flex"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 120% 90% at 50% 0%, rgba(63,169,224,.22), transparent 80%), radial-gradient(ellipse 80% 60% at 90% 100%, rgba(236,28,84,.20), transparent 70%)",
        }}
      >
        <ZolviLogo tone="onDark" />

        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-white">
            {ZOLVI_BRAND.tagline}
          </p>
          <h2 className="mt-4 font-display text-4xl font-bold leading-[1.12] tracking-tight">
            Zolvi conecta los procesos en{" "}
            <span className="text-secondary">una sola plataforma</span>
          </h2>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((text) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/70">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-secondary">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                  >
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/50">{ZOLVI_BRAND.footer}</p>
      </aside>

      {/* Formulario */}
      <main className="flex w-full items-center justify-center px-4 py-12 sm:px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <ZolviMark size={56} priority />
            <div className="mt-3 font-display text-2xl font-bold tracking-tight text-dark">
              {ZOLVI_BRAND.name}
            </div>
          </div>

          <h1 className="font-display text-3xl font-bold tracking-tight text-dark">Bienvenido</h1>
          <p className="mb-8 mt-2 text-base leading-relaxed text-dark/70">
            Ingresa con tu cuenta para continuar.
          </p>

          <form action={action} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-dark/80">
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
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-dark/80">
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
              <div className="flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary-dark">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>{state.error}</span>
              </div>
            )}

            <div className="pt-1">
              <SubmitButton />
            </div>
          </form>

          <p className="mt-10 text-center text-xs text-dark/45 lg:hidden">{ZOLVI_BRAND.footer}</p>
        </div>
      </main>
    </div>
  );
}
