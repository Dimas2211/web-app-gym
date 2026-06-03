"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-provisioning-package-viewer.tsx
//
// Muestra el Provisioning Package como JSON estructurado.
// Solo visualización — sin exportación ni descarga todavía.
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import { ChevronDown, ChevronUp, Code2 } from "lucide-react";
import type { ProvisioningPackage } from "../types/platform.types";

interface Props {
  pkg: ProvisioningPackage;
}

export function PlatformProvisioningPackageViewer({ pkg }: Props) {
  const [expanded, setExpanded] = useState(false);

  const json = JSON.stringify(
    {
      generated_at:        pkg.generated_at,
      organization_id:     pkg.organization_id,
      provisioning_status: pkg.provisioning_status,
      validation_status:   pkg.validation.status,
      config:              pkg.config,
    },
    null,
    2,
  );

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Code2 size={16} className="text-zinc-400" />
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Provisioning Package
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp size={14} />
              Ocultar
            </>
          ) : (
            <>
              <ChevronDown size={14} />
              Ver package completo
            </>
          )}
        </button>
      </div>

      {/* Resumen siempre visible */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div>
          <p className="text-xs text-zinc-400">Estado</p>
          <p className="text-sm font-semibold text-zinc-700">{pkg.provisioning_status}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Validación</p>
          <p className={`text-sm font-semibold ${pkg.validation.status === "READY" ? "text-green-700" : "text-red-600"}`}>
            {pkg.validation.status}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Módulos</p>
          <p className="text-sm font-semibold text-zinc-700">{pkg.config.active_modules.length}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Generado</p>
          <p className="text-sm font-semibold text-zinc-700">
            {new Date(pkg.generated_at).toLocaleTimeString("es-SV")}
          </p>
        </div>
      </div>

      {/* JSON expandible */}
      {expanded && (
        <pre className="bg-zinc-950 text-green-400 text-xs p-4 rounded-lg overflow-x-auto max-h-96 overflow-y-auto font-mono leading-relaxed">
          {json}
        </pre>
      )}
    </div>
  );
}
