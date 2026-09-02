"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-organization-modules-panel.tsx
//
// Panel de gestión de módulos por organización. Muestra el estado
// EFECTIVO de cada módulo (plan + override) y permite las tres
// operaciones deterministas del Bloque A:
//   HEREDAR    → elimina el override (vuelve a depender del plan)
//   HABILITAR  → crea/actualiza override is_active=true
//   DESHABILITAR → crea/actualiza override is_active=false
// Los módulos is_core están bloqueados (no aceptan override).
// ─────────────────────────────────────────────────────────────────

import { useTransition, useState } from "react";
import { CheckCircle, Circle, Lock } from "lucide-react";

import { activateOrganizationModuleAction }          from "../actions/activate-organization-module.action";
import { deactivateOrganizationModuleAction }        from "../actions/deactivate-organization-module.action";
import { revertOrganizationModuleToInheritAction }   from "../actions/revert-organization-module-to-inherit.action";

import type { EffectiveModule, PlatformModuleCategory } from "../types/platform.types";

interface Props {
  organizationId: string;
  effectiveModules: EffectiveModule[];
}

const CATEGORY_LABELS: Record<PlatformModuleCategory, string> = {
  CORE:        "Core",
  COMMERCE:    "Commerce",
  VERTICAL:    "Vertical",
  INTEGRATION: "Integración",
};

const CATEGORY_ORDER: PlatformModuleCategory[] = ["CORE", "COMMERCE", "VERTICAL", "INTEGRATION"];

const SOURCE_LABELS: Record<EffectiveModule["source"], string> = {
  PLAN:                            "Heredado del plan",
  ORGANIZATION_OVERRIDE_ADDED:     "Override: habilitado",
  ORGANIZATION_OVERRIDE_REMOVED:   "Override: deshabilitado",
  UNCONFIGURED:                    "Sin configurar",
};

function ModuleRow({ organizationId, module: mod }: { organizationId: string; module: EffectiveModule }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  const hasOverride = mod.source === "ORGANIZATION_OVERRIDE_ADDED" || mod.source === "ORGANIZATION_OVERRIDE_REMOVED";

  type ModuleAction = typeof activateOrganizationModuleAction;

  function run(action: ModuleAction) {
    setError(null);
    const fd = new FormData();
    fd.set("organization_id", organizationId);
    fd.set("module_id", mod.module_id);
    if (action === deactivateOrganizationModuleAction) {
      fd.set("reason", "Ajustado manualmente desde Platform Admin.");
    }
    startTransition(async () => {
      const result = await action(undefined, fd);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <tr className="border-b border-zinc-50 last:border-b-0 hover:bg-zinc-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {mod.enabled ? (
            <CheckCircle size={15} className="text-green-500 shrink-0" />
          ) : (
            <Circle size={15} className="text-zinc-300 shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-zinc-800">{mod.name}</p>
            <p className="text-xs font-mono text-zinc-400">{mod.code}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-zinc-500">{SOURCE_LABELS[mod.source]}</td>
      <td className="px-4 py-3">
        {mod.is_core ? (
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <Lock size={12} />
            Core
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              disabled={isPending || !hasOverride}
              onClick={() => run(revertOrganizationModuleToInheritAction)}
              className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Volver a depender del plan"
            >
              Heredar
            </button>
            <button
              type="button"
              disabled={isPending || mod.source === "ORGANIZATION_OVERRIDE_ADDED"}
              onClick={() => run(activateOrganizationModuleAction)}
              className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Habilitar
            </button>
            <button
              type="button"
              disabled={isPending || mod.source === "ORGANIZATION_OVERRIDE_REMOVED"}
              onClick={() => run(deactivateOrganizationModuleAction)}
              className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Deshabilitar
            </button>
            {isPending && <span className="text-xs text-zinc-400">…</span>}
            {error && <p className="text-xs text-red-600 basis-full">{error}</p>}
          </div>
        )}
      </td>
    </tr>
  );
}

export function PlatformOrganizationModulesPanel({ organizationId, effectiveModules }: Props) {
  const byCategory = CATEGORY_ORDER
    .map((cat) => ({ cat, modules: effectiveModules.filter((m) => m.category === cat) }))
    .filter((g) => g.modules.length > 0);

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Módulos ({effectiveModules.length} en catálogo) — estado efectivo (plan + overrides)
        </h2>
      </div>

      <div className="divide-y divide-zinc-100">
        {byCategory.map(({ cat, modules }) => (
          <div key={cat}>
            <div className="px-5 py-2 bg-zinc-50">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                {CATEGORY_LABELS[cat]}
              </p>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {modules.map((mod) => (
                  <ModuleRow key={mod.module_id} organizationId={organizationId} module={mod} />
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
