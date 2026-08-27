"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/settings — switch-dte-environment-dialog.tsx
//
// Confirmación fuerte para activar un ambiente DTE. Para PRODUCTION
// exige escribir "PRODUCCION" y muestra el preflight completo — el
// botón de confirmar queda deshabilitado si el preflight está BLOCKED.
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useState } from "react";
import { X, AlertTriangle, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

import { switchDteEnvironmentAction } from "../../actions/switch-dte-environment.action";
import type { DteProductionPreflightResult } from "../../services/dte-production-preflight.service";
import type { DteEnvironment } from "../../types/dte.types";

interface Props {
  targetIssuerConfigId: string;
  targetEnvironment: DteEnvironment;
  preflight: DteProductionPreflightResult | null;
  onClose: () => void;
}

const CONFIRM_TEXT = "PRODUCCION";

function PreflightBadge({ status }: { status: DteProductionPreflightResult["status"] }) {
  const map = {
    READY:   { icon: ShieldCheck, cls: "bg-emerald-100 text-emerald-700", label: "READY" },
    WARNING: { icon: ShieldAlert, cls: "bg-amber-100 text-amber-700",    label: "WARNING" },
    BLOCKED: { icon: ShieldX,     cls: "bg-red-100 text-red-700",        label: "BLOCKED" },
  } as const;
  const { icon: Icon, cls, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      <Icon size={12} /> {label}
    </span>
  );
}

export function SwitchDteEnvironmentDialog({ targetIssuerConfigId, targetEnvironment, preflight, onClose }: Props) {
  const [state, formAction, isPending] = useActionState(switchDteEnvironmentAction, undefined);
  const [confirmInput, setConfirmInput] = useState("");

  useEffect(() => {
    if (state && "success" in state && state.success) {
      const t = setTimeout(onClose, 1000);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  const isProduction = targetEnvironment === "PRODUCTION";
  const blocked = isProduction && preflight?.status === "BLOCKED";
  const confirmMatches = !isProduction || confirmInput === CONFIRM_TEXT;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <h2 className="text-base font-bold text-zinc-800">
            Activar {isProduction ? "PRODUCCIÓN" : "PRUEBAS"}
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form action={formAction} className="p-5 space-y-4">
          <input type="hidden" name="target_issuer_config_id" value={targetIssuerConfigId} />
          {isProduction && <input type="hidden" name="confirm_text" value={confirmInput} />}

          {state && "error" in state && state.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {state.error}
            </div>
          )}
          {state && "success" in state && state.success && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
              Ambiente activado: {state.environment}.
            </div>
          )}

          {isProduction && (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex gap-2">
                <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-800">
                  Está a punto de activar <strong>PRODUCCIÓN</strong>. Los próximos Documentos Tributarios
                  Electrónicos de esta sucursal serán generados y transmitidos al ambiente productivo real
                  del Ministerio de Hacienda. Esto no afecta documentos ya emitidos en TEST.
                </p>
              </div>

              {preflight && (
                <div className="border border-zinc-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Preflight PRODUCTION</span>
                    <PreflightBadge status={preflight.status} />
                  </div>
                  <ul className="divide-y divide-zinc-50 max-h-56 overflow-y-auto">
                    {preflight.checks.map((c) => (
                      <li key={c.code} className="px-4 py-2 text-xs flex items-start gap-2">
                        <span
                          className={
                            c.status === "ok"
                              ? "text-emerald-500"
                              : c.status === "warning"
                              ? "text-amber-500"
                              : "text-red-500"
                          }
                        >
                          {c.status === "ok" ? "✓" : c.status === "warning" ? "△" : "✕"}
                        </span>
                        <span className="flex-1">
                          <span className="text-zinc-700">{c.label}</span>
                          {c.detail && <span className="block text-zinc-400 mt-0.5">{c.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {blocked ? (
                <p className="text-xs text-red-600 font-medium">
                  El preflight está BLOCKED — no se puede activar PRODUCCIÓN hasta resolver los checks marcados.
                </p>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1">
                    Escriba <span className="font-mono text-red-600">{CONFIRM_TEXT}</span> para confirmar
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder={CONFIRM_TEXT}
                    className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                  />
                </div>
              )}
            </>
          )}

          {!isProduction && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Va a activar el ambiente de <strong>PRUEBAS</strong>. Los próximos DTE de esta sucursal se
                emitirán contra el ambiente TEST del Ministerio de Hacienda, no producción.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || blocked || !confirmMatches}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isProduction ? "bg-red-600 text-white hover:bg-red-700" : "bg-zinc-900 text-white hover:bg-zinc-800"
              }`}
            >
              {isPending ? "Activando…" : isProduction ? "Activar PRODUCCIÓN" : "Activar PRUEBAS"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
