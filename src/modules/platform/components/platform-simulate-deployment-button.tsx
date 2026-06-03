"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-simulate-deployment-button.tsx
//
// Botón para ejecutar simulación de un Deployment Job PENDING.
// ─────────────────────────────────────────────────────────────────

import { useState }          from "react";
import { useRouter }         from "next/navigation";
import { PlayCircle, Loader2 } from "lucide-react";

import { simulateDeploymentJobAction } from "../actions/simulate-deployment-job.action";

interface Props {
  jobId: string;
}

export function PlatformSimulateDeploymentButton({ jobId }: Props) {
  const router   = useRouter();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSimulate() {
    if (!confirm("¿Ejecutar simulación de deployment? El job recorrerá todos sus pasos en modo SIMULATION.")) {
      return;
    }

    setLoading(true);
    setError(null);

    const result = await simulateDeploymentJobAction(jobId);
    setLoading(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleSimulate}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Simulando…
          </>
        ) : (
          <>
            <PlayCircle size={15} />
            Ejecutar Simulación
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
