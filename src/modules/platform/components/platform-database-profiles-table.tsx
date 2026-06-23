"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-database-profiles-table.tsx
//
// Tabla de PlatformDatabaseProfile.
// NUNCA renderiza password ni encrypted_password.
// Los valores de credencial (db_user) se muestran como metadatos
// operativos, nunca el password.
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Pencil, Power, PlugZap, Loader2, ShieldCheck, Search, ExternalLink } from "lucide-react";
import type {
  PlatformDatabaseProfileItem,
  PlatformDatabaseConnectionTestStatus,
  PlatformDatabaseProfileEnvironment,
} from "../types/platform.types";

interface Props {
  items:           PlatformDatabaseProfileItem[];
  testingId:       string | null;
  togglingId:      string | null;
  preflightingId:  string | null;
  onEdit:          (p: PlatformDatabaseProfileItem) => void;
  onToggleActive:  (p: PlatformDatabaseProfileItem) => void;
  onTest:          (p: PlatformDatabaseProfileItem) => void;
  onPreflight:     (p: PlatformDatabaseProfileItem) => void;
  onInspect:       (p: PlatformDatabaseProfileItem) => void;
}

function TestStatusBadge({ status }: { status: PlatformDatabaseConnectionTestStatus }) {
  const cfg: Record<PlatformDatabaseConnectionTestStatus, { cls: string; label: string }> = {
    UNTESTED: { cls: "bg-zinc-100 text-zinc-500",   label: "Sin probar" },
    SUCCESS:  { cls: "bg-green-100 text-green-700", label: "Exitosa"    },
    FAILED:   { cls: "bg-red-100 text-red-700",     label: "Fallida"    },
  };
  const { cls, label } = cfg[status] ?? cfg.UNTESTED;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function EnvBadge({ env }: { env: PlatformDatabaseProfileEnvironment }) {
  const cfg: Record<PlatformDatabaseProfileEnvironment, string> = {
    LOCAL:      "bg-zinc-100 text-zinc-600",
    SANDBOX:    "bg-amber-100 text-amber-700",
    TEST:       "bg-sky-100 text-sky-700",
    STAGING:    "bg-orange-100 text-orange-700",
    PRODUCTION: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg[env] ?? cfg.LOCAL}`}>
      {env}
    </span>
  );
}

export function PlatformDatabaseProfilesTable({
  items,
  testingId,
  togglingId,
  preflightingId,
  onEdit,
  onToggleActive,
  onTest,
  onPreflight,
  onInspect,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-zinc-400">
        No hay perfiles de base de datos configurados.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 text-xs text-zinc-400 uppercase tracking-wide bg-zinc-50">
            <th className="px-4 py-3 text-left font-semibold">Nombre</th>
            <th className="px-4 py-3 text-left font-semibold">Organización</th>
            <th className="px-4 py-3 text-left font-semibold">Ambiente</th>
            <th className="px-4 py-3 text-left font-semibold">Proveedor</th>
            <th className="px-4 py-3 text-left font-semibold">Host / Base</th>
            <th className="px-4 py-3 text-left font-semibold">Usuario</th>
            <th className="px-4 py-3 text-left font-semibold">SSL</th>
            <th className="px-4 py-3 text-left font-semibold">Estado</th>
            <th className="px-4 py-3 text-left font-semibold">Última prueba</th>
            <th className="px-4 py-3 text-left font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {items.map((p) => {
            const isTesting      = testingId      === p.id;
            const isToggling     = togglingId     === p.id;
            const isPreflighting = preflightingId === p.id;

            return (
              <tr key={p.id} className="hover:bg-zinc-50/70 transition-colors">

                {/* Nombre */}
                <td className="px-4 py-3 font-medium text-zinc-800 whitespace-nowrap">
                  {p.label}
                </td>

                {/* Organización */}
                <td className="px-4 py-3 text-zinc-600 text-xs whitespace-nowrap">
                  <span className="font-medium">{p.organization.code}</span>
                  <span className="text-zinc-400 ml-1">— {p.organization.name}</span>
                </td>

                {/* Ambiente */}
                <td className="px-4 py-3">
                  <EnvBadge env={p.environment} />
                </td>

                {/* Proveedor */}
                <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                  {p.provider}
                </td>

                {/* Host / Base — nunca muestra password ni DATABASE_URL */}
                <td className="px-4 py-3 text-xs">
                  <span className="font-mono text-zinc-700">{p.db_host}</span>
                  {p.db_port != null && (
                    <span className="text-zinc-400">:{p.db_port}</span>
                  )}
                  <br />
                  <span className="text-zinc-500">{p.db_name}</span>
                </td>

                {/* Usuario — solo el username, nunca el password */}
                <td className="px-4 py-3 text-xs font-mono text-zinc-600 whitespace-nowrap">
                  {p.db_user}
                </td>

                {/* SSL */}
                <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                  {p.ssl_mode}
                </td>

                {/* Estado activo */}
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    p.is_active
                      ? "bg-green-100 text-green-700"
                      : "bg-zinc-100 text-zinc-500"
                  }`}>
                    {p.is_active ? "Activo" : "Inactivo"}
                  </span>
                </td>

                {/* Última prueba */}
                <td className="px-4 py-3">
                  <TestStatusBadge status={p.last_test_status} />
                  {p.last_tested_at && (
                    <p className="text-xs text-zinc-400 mt-0.5 whitespace-nowrap">
                      {new Date(p.last_tested_at).toLocaleString("es-SV")}
                    </p>
                  )}
                  {p.last_test_message && (
                    <p
                      className="text-xs text-zinc-500 mt-0.5 max-w-[220px] truncate"
                      title={p.last_test_message}
                    >
                      {p.last_test_message}
                    </p>
                  )}
                </td>

                {/* Acciones */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">

                    {/* Editar */}
                    <button
                      type="button"
                      onClick={() => onEdit(p)}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                                 border border-zinc-200 rounded-lg text-zinc-600
                                 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                    >
                      <Pencil size={11} />
                      Editar
                    </button>

                    {/* Activar / Desactivar */}
                    <button
                      type="button"
                      onClick={() => onToggleActive(p)}
                      disabled={isToggling}
                      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                                  border rounded-lg transition-colors disabled:opacity-50 ${
                        p.is_active
                          ? "border-orange-200 text-orange-600 hover:bg-orange-50"
                          : "border-green-200 text-green-600 hover:bg-green-50"
                      }`}
                    >
                      {isToggling
                        ? <Loader2 size={11} className="animate-spin" />
                        : <Power size={11} />
                      }
                      {p.is_active ? "Desactivar" : "Activar"}
                    </button>

                    {/* Probar conexión */}
                    <button
                      type="button"
                      onClick={() => onTest(p)}
                      disabled={isTesting}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                                 border border-blue-200 rounded-lg text-blue-600
                                 hover:bg-blue-50 transition-colors disabled:opacity-50"
                    >
                      {isTesting
                        ? <Loader2 size={11} className="animate-spin" />
                        : <PlugZap size={11} />
                      }
                      {isTesting ? "Probando…" : "Probar"}
                    </button>

                    {/* Preflight de base de datos */}
                    <button
                      type="button"
                      onClick={() => onPreflight(p)}
                      disabled={isPreflighting}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                                 border border-indigo-200 rounded-lg text-indigo-600
                                 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                      title="Ejecutar preflight de base de datos"
                    >
                      {isPreflighting
                        ? <Loader2 size={11} className="animate-spin" />
                        : <ShieldCheck size={11} />
                      }
                      Preflight
                    </button>

                    {/* Inspector read-only (C4) */}
                    <button
                      type="button"
                      onClick={() => onInspect(p)}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                                 border border-blue-200 rounded-lg text-blue-700
                                 hover:bg-blue-50 transition-colors"
                      title="Inspeccionar base de datos (read-only)"
                    >
                      <Search size={11} />
                      Inspeccionar
                    </button>

                    {/* Visor completo read-only (C6) */}
                    <Link
                      href={`/dashboard/platform/client-view/${p.id}`}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                                 border border-emerald-200 rounded-lg text-emerald-700
                                 hover:bg-emerald-50 transition-colors whitespace-nowrap"
                      title="Abrir visor read-only de esta base de datos"
                    >
                      <ExternalLink size={11} />
                      Abrir visor
                    </Link>

                  </div>
                </td>

              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
