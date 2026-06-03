"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-organization-modules-panel.tsx
//
// Panel de gestión de módulos por organización.
// Permite activar / desactivar módulos no-core.
// Los módulos is_core están bloqueados (no pueden desactivarse).
// ─────────────────────────────────────────────────────────────────

import { useTransition, useState } from "react";
import { CheckCircle, Circle, Lock } from "lucide-react";

import { activateOrganizationModuleAction }   from "../actions/activate-organization-module.action";
import { deactivateOrganizationModuleAction } from "../actions/deactivate-organization-module.action";

import type { PlatformModuleItem, OrganizationModuleItem, PlatformModuleCategory } from "../types/platform.types";

interface Props {
  organizationId: string;
  orgModules:     OrganizationModuleItem[];
  allModules:     PlatformModuleItem[];
}

const CATEGORY_LABELS: Record<PlatformModuleCategory, string> = {
  CORE:        "Core",
  COMMERCE:    "Commerce",
  VERTICAL:    "Vertical",
  INTEGRATION: "Integración",
};

const CATEGORY_ORDER: PlatformModuleCategory[] = ["CORE", "COMMERCE", "VERTICAL", "INTEGRATION"];

function ModuleRow({
  organizationId,
  module,
  orgModule,
}: {
  organizationId: string;
  module:         PlatformModuleItem;
  orgModule:      OrganizationModuleItem | undefined;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  const isActive = orgModule?.is_active ?? false;
  const isCore   = module.is_core;

  function handleToggle() {
    setError(null);
    const fd = new FormData();
    fd.set("organization_id", organizationId);
    fd.set("module_id", module.id);

    startTransition(async () => {
      if (isActive) {
        fd.set("reason", "Desactivado manualmente desde Platform Admin.");
        const result = await deactivateOrganizationModuleAction(undefined, fd);
        if (result?.error) setError(result.error);
      } else {
        const result = await activateOrganizationModuleAction(undefined, fd);
        if (result?.error) setError(result.error);
      }
    });
  }

  return (
    <tr className="border-b border-zinc-50 last:border-b-0 hover:bg-zinc-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {isActive ? (
            <CheckCircle size={15} className="text-green-500 shrink-0" />
          ) : (
            <Circle size={15} className="text-zinc-300 shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-zinc-800">{module.name}</p>
            <p className="text-xs font-mono text-zinc-400">{module.code}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-zinc-500">
        {module.description ?? "—"}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-zinc-500">{module.version}</span>
      </td>
      <td className="px-4 py-3">
        {isCore ? (
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <Lock size={12} />
            Core
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={handleToggle}
              disabled={isPending}
              className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors disabled:opacity-50
                ${isActive
                  ? "bg-red-50 text-red-600 hover:bg-red-100"
                  : "bg-green-50 text-green-700 hover:bg-green-100"
                }`}
            >
              {isPending ? "…" : isActive ? "Desactivar" : "Activar"}
            </button>
            {error && (
              <p className="text-xs text-red-600 mt-0.5 max-w-[200px]">{error}</p>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function PlatformOrganizationModulesPanel({
  organizationId,
  orgModules,
  allModules,
}: Props) {
  const orgModuleMap = new Map(orgModules.map((m) => [m.module_id, m]));

  const byCategory = CATEGORY_ORDER
    .map((cat) => ({
      cat,
      modules: allModules.filter((m) => m.category === cat),
    }))
    .filter((g) => g.modules.length > 0);

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Módulos ({allModules.length} disponibles)
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
                  <ModuleRow
                    key={mod.id}
                    organizationId={organizationId}
                    module={mod}
                    orgModule={orgModuleMap.get(mod.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
