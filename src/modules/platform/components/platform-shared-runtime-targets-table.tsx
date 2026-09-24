"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-shared-runtime-targets-table.tsx
//
// SHARED-PILOT-4C-B0. Tabla de PlatformSharedRuntimeTarget.
// NUNCA renderiza password, encrypted_password ni DATABASE_URL — el
// DTO (listSharedRuntimeTargets) ni siquiera los contiene.
// ─────────────────────────────────────────────────────────────────

import { Power, PlugZap, Loader2 } from "lucide-react";
import type { PlatformSharedRuntimeTargetItem } from "../queries/list-shared-runtime-targets";

interface Props {
  items:          PlatformSharedRuntimeTargetItem[];
  testingId:      string | null;
  togglingId:     string | null;
  onToggleActive: (t: PlatformSharedRuntimeTargetItem) => void;
  onTest:         (t: PlatformSharedRuntimeTargetItem) => void;
}

const TEST_STATUS_CFG: Record<string, { cls: string; label: string }> = {
  UNTESTED: { cls: "bg-zinc-100 text-zinc-500",   label: "Sin probar" },
  SUCCESS:  { cls: "bg-green-100 text-green-700", label: "Exitosa"    },
  FAILED:   { cls: "bg-red-100 text-red-700",     label: "Fallida"    },
};

const ENV_CFG: Record<string, string> = {
  LOCAL:      "bg-zinc-100 text-zinc-600",
  SANDBOX:    "bg-amber-100 text-amber-700",
  TEST:       "bg-sky-100 text-sky-700",
  STAGING:    "bg-orange-100 text-orange-700",
  PRODUCTION: "bg-red-100 text-red-700",
};

export function PlatformSharedRuntimeTargetsTable({
  items,
  testingId,
  togglingId,
  onToggleActive,
  onTest,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-zinc-400">
        No hay Shared Runtime Targets configurados.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 text-xs text-zinc-400 uppercase tracking-wide bg-zinc-50">
            <th className="px-4 py-3 text-left font-semibold">Nombre</th>
            <th className="px-4 py-3 text-left font-semibold">Ambiente</th>
            <th className="px-4 py-3 text-left font-semibold">Proveedor</th>
            <th className="px-4 py-3 text-left font-semibold">Host / Base</th>
            <th className="px-4 py-3 text-left font-semibold">Usuario</th>
            <th className="px-4 py-3 text-left font-semibold">SSL</th>
            <th className="px-4 py-3 text-left font-semibold">Orgs</th>
            <th className="px-4 py-3 text-left font-semibold">Estado</th>
            <th className="px-4 py-3 text-left font-semibold">Última prueba</th>
            <th className="px-4 py-3 text-left font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {items.map((t) => {
            const isTesting  = testingId  === t.id;
            const isToggling = togglingId === t.id;
            const status     = TEST_STATUS_CFG[t.last_test_status] ?? TEST_STATUS_CFG.UNTESTED;

            return (
              <tr key={t.id} className="hover:bg-zinc-50/70 transition-colors">
                <td className="px-4 py-3 font-medium text-zinc-800 whitespace-nowrap">
                  {t.label}
                </td>

                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${ENV_CFG[t.environment] ?? ENV_CFG.LOCAL}`}>
                    {t.environment}
                  </span>
                </td>

                <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                  {t.provider}
                </td>

                {/* Host / Base — nunca muestra password ni DATABASE_URL */}
                <td className="px-4 py-3 text-xs">
                  <span className="font-mono text-zinc-700">{t.db_host}</span>
                  {t.db_port != null && (
                    <span className="text-zinc-400">:{t.db_port}</span>
                  )}
                  <br />
                  <span className="text-zinc-500">{t.db_name}</span>
                </td>

                {/* Usuario — solo el username, nunca el password */}
                <td className="px-4 py-3 text-xs font-mono text-zinc-600 whitespace-nowrap">
                  {t.db_user}
                </td>

                <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                  {t.ssl_mode}
                </td>

                <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">
                  {t.organizationCount}
                </td>

                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    t.is_active ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                  }`}>
                    {t.is_active ? "Activo" : "Inactivo"}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.cls}`}>
                    {status.label}
                  </span>
                  {t.last_tested_at && (
                    <p className="text-xs text-zinc-400 mt-0.5 whitespace-nowrap">
                      {new Date(t.last_tested_at).toLocaleString("es-SV")}
                    </p>
                  )}
                  {t.last_test_message && (
                    <p
                      className="text-xs text-zinc-500 mt-0.5 max-w-[220px] truncate"
                      title={t.last_test_message}
                    >
                      {t.last_test_message}
                    </p>
                  )}
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onTest(t)}
                      disabled={isTesting}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                                 border border-zinc-200 rounded-lg text-zinc-600
                                 hover:bg-zinc-50 hover:border-zinc-300 transition-colors
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTesting ? <Loader2 size={11} className="animate-spin" /> : <PlugZap size={11} />}
                      {isTesting ? "Probando…" : "Probar conexión"}
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleActive(t)}
                      disabled={isToggling}
                      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg
                                  transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        t.is_active
                          ? "border-red-200 text-red-600 hover:bg-red-50"
                          : "border-green-200 text-green-700 hover:bg-green-50"
                      }`}
                    >
                      {isToggling ? <Loader2 size={11} className="animate-spin" /> : <Power size={11} />}
                      {t.is_active ? "Desactivar" : "Activar"}
                    </button>
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
