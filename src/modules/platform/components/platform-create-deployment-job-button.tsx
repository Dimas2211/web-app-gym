"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-create-deployment-job-button.tsx
//
// Botón para crear un Deployment Job desde una organización READY.
// Navega al job recién creado.
// ─────────────────────────────────────────────────────────────────

import { useState }           from "react";
import { useRouter }          from "next/navigation";
import { Rocket, Loader2 }    from "lucide-react";

import { createDeploymentJobAction } from "../actions/create-deployment-job.action";

interface Props {
  organizationId: string;
}

export function PlatformCreateDeploymentJobButton({ organizationId }: Props) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleCreate() {
    if (!confirm("¿Crear un Deployment Job para esta organización? Se generará en modo SIMULATION.")) {
      return;
    }

    setLoading(true);
    setError(null);

    const result = await createDeploymentJobAction(organizationId);
    setLoading(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    if (result?.jobId) {
      router.push(`/dashboard/platform/deployments/${result.jobId}`);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleCreate}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Creando…
          </>
        ) : (
          <>
            <Rocket size={15} />
            Crear Deployment Job
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
