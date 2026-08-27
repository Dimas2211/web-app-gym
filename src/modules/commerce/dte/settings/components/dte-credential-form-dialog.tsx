"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/settings — dte-credential-form-dialog.tsx
//
// Formulario de credenciales MH + firmador para un DteIssuerConfig.
// Nunca precarga valores previos (el servidor jamás los devuelve) —
// campos en blanco = "mantener el valor guardado actualmente".
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect } from "react";
import { X, Lock } from "lucide-react";

import { upsertDteCredentialAction } from "../../actions/upsert-dte-credential.action";
import type { DteCredentialStatus } from "../../services/dte-credential.service";
import type { DteEnvironment } from "../../types/dte.types";

interface Props {
  issuerConfigId: string;
  environment: DteEnvironment;
  status: DteCredentialStatus | null;
  onClose: () => void;
}

export function DteCredentialFormDialog({ issuerConfigId, environment, status, onClose }: Props) {
  const [state, formAction, isPending] = useActionState(upsertDteCredentialAction, undefined);

  useEffect(() => {
    if (state && "success" in state && state.success) {
      const t = setTimeout(onClose, 1000);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
            <Lock size={16} className="text-zinc-400" />
            Credenciales MH — {environment === "PRODUCTION" ? "PRODUCCIÓN" : "PRUEBAS"}
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form action={formAction} className="p-5 space-y-4">
          <input type="hidden" name="issuer_config_id" value={issuerConfigId} />

          {state && "error" in state && state.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {state.error}
            </div>
          )}
          {state && "success" in state && state.success && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
              Credenciales guardadas.
            </div>
          )}

          <div className="bg-zinc-50 rounded-lg px-4 py-3 text-xs text-zinc-500">
            Los campos en blanco conservan el valor ya guardado. Nunca se muestran contraseñas ni secretos
            existentes — solo si están {status?.configured ? "configurados" : "sin configurar"}.
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Usuario MH {status?.has_api_user && <span className="text-emerald-600">(configurado)</span>}
            </label>
            <input
              type="text"
              name="apiUser"
              placeholder={status?.has_api_user ? "•••••••• (dejar en blanco para conservar)" : "Usuario ante Hacienda"}
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Contraseña MH {status?.has_api_password && <span className="text-emerald-600">(configurada)</span>}
            </label>
            <input
              type="password"
              name="apiPassword"
              placeholder={status?.has_api_password ? "•••••••• (dejar en blanco para conservar)" : "Contraseña ante Hacienda"}
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          <div className="pt-2 border-t border-zinc-100">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Firmador</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              URL del firmador {status?.has_signer_url && <span className="text-emerald-600">(configurada)</span>}
            </label>
            <input
              type="text"
              name="signerUrl"
              placeholder={status?.has_signer_url ? "•••••••• (dejar en blanco para conservar)" : "https://firmador.ejemplo.com/firma/firmardocumento/"}
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              NIT del firmador {status?.has_signer_nit && <span className="text-emerald-600">(configurado)</span>}
            </label>
            <input
              type="text"
              name="signerNit"
              placeholder={status?.has_signer_nit ? "•••••••• (dejar en blanco para conservar)" : "NIT del emisor para el firmador"}
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Contraseña de la llave privada</label>
            <input
              type="password"
              name="signerPrivateKeyPassword"
              placeholder="•••••••• (dejar en blanco para conservar)"
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

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
              disabled={isPending}
              className="px-4 py-2 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {isPending ? "Guardando…" : "Guardar credenciales"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
