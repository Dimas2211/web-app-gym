// ─────────────────────────────────────────────────────────────────
// platform — data-onboarding-unavailable.tsx
//
// SHARED-OPS-PARITY-1. Estado de error del Data Onboarding Center cuando
// el runtime de la organización no se puede resolver (sin tenant_id,
// runtime inactivo, perfil de otra organización…). Solo muestra el
// mensaje del resolver — nunca credenciales.
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export function DataOnboardingUnavailable({ reason }: { reason: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Link
        href="/dashboard/platform/database-profiles"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
      >
        <ArrowLeft size={14} />
        Volver a Perfiles de BD
      </Link>
      <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50">
        <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-800">Data Onboarding no disponible</p>
          <p className="text-xs text-red-700 mt-1">{reason}</p>
        </div>
      </div>
    </div>
  );
}
