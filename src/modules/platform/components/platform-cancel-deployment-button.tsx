"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-cancel-deployment-button.tsx
//
// Botón para cancelar un Deployment Job en estado PENDING.
// ─────────────────────────────────────────────────────────────────

import { useState }        from "react";
import { useRouter }       from "next/navigation";
import { XCircle, Loader2 } from "lucide-react";

import { cancelDeploymentJobAction } from "../actions/cancel-deployment-job.action";

interface Props {
  jobId: string;
}

export function PlatformCancelDeploymentButton({ jobId }: Props) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleCancel() {
    if (!confirm("¿Cancelar este deployment job? La acción no se puede deshacer.")) {
      return;
    }

    setLoading(true);
    setError(null);

    const result = await cancelDeploymentJobAction(jobId);
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
        onClick={handleCancel}
        disabled={loading}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 border border-zinc-300 rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Cancelando…
          </>
        ) : (
          <>
            <XCircle size={14} />
            Cancelar Job
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
