"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-provisioning-validator.tsx
//
// Botón que ejecuta el motor de validación de provisioning
// para una organización, mostrando el resultado inline.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { validateProvisioningAction } from "../actions/validate-provisioning.action";

interface Props {
  organizationId: string;
  organizationName: string;
  onValidated?: () => void;
}

export function PlatformProvisioningValidator({ organizationId, organizationName, onValidated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    status:  "READY" | "NOT_READY";
    errors:  string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleValidate() {
    setResult(null);
    setError(null);

    startTransition(async () => {
      const res = await validateProvisioningAction(organizationId);
      if (res?.error) {
        setError(res.error);
      } else if (res?.status) {
        setResult({ status: res.status, errors: res.errors ?? [] });
        onValidated?.();
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
            Validar provisioning
          </h2>
          <p className="text-sm text-zinc-500">
            Ejecuta todas las verificaciones para <strong className="text-zinc-700">{organizationName}</strong> y actualiza el estado de provisioning.
          </p>
        </div>

        <button
          type="button"
          onClick={handleValidate}
          disabled={isPending}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-900 disabled:bg-zinc-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ShieldCheck size={15} />
          )}
          {isPending ? "Validando..." : "Ejecutar validación"}
        </button>
      </div>

      {/* Resultado */}
      {error && (
        <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className={`mt-4 rounded-lg border px-4 py-3 ${
          result.status === "READY"
            ? "bg-green-50 border-green-100"
            : "bg-red-50 border-red-100"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {result.status === "READY" ? (
              <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />
            ) : (
              <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
            )}
            <p className={`text-sm font-semibold ${
              result.status === "READY" ? "text-green-700" : "text-red-700"
            }`}>
              {result.status === "READY"
                ? "Organización lista para provisioning."
                : "Organización NO está lista para provisioning."}
            </p>
          </div>

          {result.errors.length > 0 && (
            <ul className="mt-1 space-y-1 list-disc list-inside">
              {result.errors.map((e, i) => (
                <li key={i} className="text-xs text-red-600">{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
