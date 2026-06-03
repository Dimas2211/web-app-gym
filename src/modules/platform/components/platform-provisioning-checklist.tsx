"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-provisioning-checklist.tsx
//
// Muestra el checklist de validación de provisioning.
// ─────────────────────────────────────────────────────────────────

import { CheckCircle2, XCircle } from "lucide-react";
import type { ProvisioningCheckItem } from "../types/platform.types";

interface Props {
  checks: ProvisioningCheckItem[];
}

export function PlatformProvisioningChecklist({ checks }: Props) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
        Checklist de provisioning
      </h2>

      <div className="space-y-2">
        {checks.map((check) => (
          <div
            key={check.key}
            className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border ${
              check.passed
                ? "border-green-100 bg-green-50"
                : "border-red-100 bg-red-50"
            }`}
          >
            {check.passed ? (
              <CheckCircle2 size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
            ) : (
              <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            )}
            <div>
              <p className={`text-sm font-medium ${check.passed ? "text-green-800" : "text-red-700"}`}>
                {check.label}
              </p>
              {!check.passed && check.message && (
                <p className="text-xs text-red-600 mt-0.5">{check.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-zinc-500">
          {checks.filter((c) => c.passed).length} / {checks.length} verificaciones exitosas
        </span>
      </div>
    </div>
  );
}
