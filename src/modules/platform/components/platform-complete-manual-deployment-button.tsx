"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-complete-manual-deployment-button.tsx
//
// Botón para marcar un Deployment Job MANUAL como completado
// o fallido. Confirma con el super_admin antes de ejecutar.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { CheckCircle, XCircle }    from "lucide-react";
import { completeManualDeploymentJobAction } from "../actions/complete-manual-deployment-job.action";

interface Props {
  jobId: string;
}

export function PlatformCompleteManualDeploymentButton({ jobId }: Props) {
  const [open,      setOpen]      = useState(false);
  const [mode,      setMode]      = useState<"SUCCESS" | "FAILED">("SUCCESS");
  const [notes,     setNotes]     = useState("");
  const [error,     setError]     = useState<string | null>(null);
  const [isPending, start]        = useTransition();

  function openWith(m: "SUCCESS" | "FAILED") {
    setMode(m);
    setNotes("");
    setError(null);
    setOpen(true);
  }

  function handleSubmit() {
    setError(null);
    start(async () => {
      const result = await completeManualDeploymentJobAction(jobId, mode, notes || undefined);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={() => openWith("SUCCESS")}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
        >
          <CheckCircle size={14} />
          Marcar Deployed
        </button>
        <button
          onClick={() => openWith("FAILED")}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
        >
          <XCircle size={14} />
          Marcar Fallido
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">

            <h2 className="text-base font-semibold text-zinc-900">
              {mode === "SUCCESS" ? "Confirmar Deployment Exitoso" : "Registrar Deployment Fallido"}
            </h2>
            <p className="text-sm text-zinc-500">
              {mode === "SUCCESS"
                ? "El job quedará marcado como SUCCESS. Esta acción es definitiva."
                : "El job quedará marcado como FAILED. Esta acción es definitiva."}
            </p>

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                {mode === "SUCCESS" ? "Notas finales (opcional)" : "Motivo del fallo"}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={mode === "SUCCESS"
                  ? "URL de la instancia desplegada, observaciones…"
                  : "Describe qué falló durante el deployment…"}
                className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className={`flex-1 h-9 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
                  mode === "SUCCESS"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isPending ? "Guardando…" : mode === "SUCCESS" ? "Confirmar éxito" : "Registrar fallo"}
              </button>
              <button
                onClick={() => { setOpen(false); setError(null); }}
                className="h-9 px-4 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                Cancelar
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
