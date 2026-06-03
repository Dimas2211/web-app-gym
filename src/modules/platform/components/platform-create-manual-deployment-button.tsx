"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-create-manual-deployment-button.tsx
//
// Botón para crear un Manual Deployment Job desde la tabla
// de Manual Deployment. Abre un dialog de confirmación.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { useRouter }               from "next/navigation";
import { ClipboardList }           from "lucide-react";
import { createManualDeploymentJobAction } from "../actions/create-manual-deployment-job.action";

interface Props {
  organizations: { id: string; name: string; code: string }[];
}

export function PlatformCreateManualDeploymentButton({ organizations }: Props) {
  const router = useRouter();
  const [open,   setOpen]   = useState(false);
  const [orgId,  setOrgId]  = useState(organizations[0]?.id ?? "");
  const [notes,  setNotes]  = useState("");
  const [error,  setError]  = useState<string | null>(null);
  const [isPending, start]  = useTransition();

  function handleSubmit() {
    if (!orgId) return;
    setError(null);
    start(async () => {
      const result = await createManualDeploymentJobAction(orgId, notes || undefined);
      if (result?.error) {
        setError(result.error);
      } else if (result?.jobId) {
        setOpen(false);
        router.push(`/dashboard/platform/manual-deployment/${result.jobId}`);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
      >
        <ClipboardList size={14} />
        Nuevo Deployment Manual
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">

            <h2 className="text-base font-semibold text-zinc-900">Crear Deployment Manual</h2>
            <p className="text-sm text-zinc-500">
              Se creará un Deployment Job con los 11 pasos del runbook manual.
              La organización debe tener provisioning READY y bundle exportado.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">
                  Organización
                </label>
                <select
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">
                  Notas (opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Contexto del deployment, versión, responsable…"
                  className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSubmit}
                disabled={isPending || !orgId}
                className="flex-1 h-9 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? "Creando…" : "Crear job manual"}
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
