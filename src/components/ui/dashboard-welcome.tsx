"use client";

import { useState } from "react";
import Link from "next/link";

type Props = {
  firstName: string;
  dateLabel: string;
  roleLabel: string;
  roleClassName: string;
  credentialHref: string;
  email: string;
  locationLabel: string;
  userId: string;
};

/**
 * Encabezado del inicio. La información de sesión queda oculta por defecto
 * y se despliega con el botón "Mi sesión" (solo presentación).
 */
export function DashboardWelcome({
  firstName,
  dateLabel,
  roleLabel,
  roleClassName,
  credentialHref,
  email,
  locationLabel,
  userId,
}: Props) {
  const [showSession, setShowSession] = useState(false);

  return (
    <>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-800">Bienvenido, {firstName}</h1>
          <p className="text-zinc-500 text-sm mt-1">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${roleClassName}`}>
            {roleLabel}
          </span>
          <button
            type="button"
            onClick={() => setShowSession((v) => !v)}
            aria-expanded={showSession}
            aria-controls="dashboard-session-info"
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
              showSession
                ? "border-secondary-dark/40 bg-secondary/10 text-dark"
                : "border-zinc-300 text-zinc-600 hover:border-secondary-dark/40 hover:bg-secondary/10 hover:text-dark"
            }`}
          >
            Mi sesión
          </button>
          <Link
            href={credentialHref}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-zinc-300 text-zinc-600 hover:border-primary-dark/30 hover:bg-primary/5 hover:text-dark transition-colors whitespace-nowrap"
          >
            Mi Carnet
          </Link>
        </div>
      </div>

      {showSession && (
        <div
          id="dashboard-session-info"
          className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5"
        >
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
            Sesión activa
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-zinc-400">Correo</p>
              <p className="text-sm text-zinc-800 font-medium truncate">{email}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Sucursal</p>
              <p className="text-sm text-zinc-800 font-medium">{locationLabel}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs text-zinc-400">ID de usuario</p>
              <p className="text-xs font-mono text-zinc-500 break-all">{userId}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
