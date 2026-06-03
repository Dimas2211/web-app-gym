"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-seed-instructions.tsx
//
// Instrucciones de seeds según los módulos activos de la org.
// No ejecuta seeds automáticamente — solo guía visual.
// ─────────────────────────────────────────────────────────────────

import { useState }    from "react";
import { Copy, Check } from "lucide-react";
import type { ManualDeploymentOrgDetails, PlatformModuleCategory } from "../types/platform.types";

interface Props {
  org: ManualDeploymentOrgDetails;
}

interface SeedEntry {
  label:    string;
  command:  string;
  required: boolean;
  reason:   string;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="ml-2 p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-colors"
    >
      {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
    </button>
  );
}

function categoriesOf(modules: { category: PlatformModuleCategory }[]): Set<PlatformModuleCategory> {
  return new Set(modules.map((m) => m.category));
}

export function PlatformSeedInstructions({ org }: Props) {
  const categories = categoriesOf(org.active_modules);
  const hasDTE     = org.active_modules.some((m) => m.code.toLowerCase().includes("dte"));
  const hasGym     = org.active_modules.some((m) => m.category === "VERTICAL" && org.vertical?.code === "GYM");

  const seeds: SeedEntry[] = [
    {
      label:    "Core Seed",
      command:  "npx ts-node prisma/seeds/core.seed.ts",
      required: true,
      reason:   "Roles, permisos y configuración base del sistema",
    },
    ...(categories.has("COMMERCE") ? [{
      label:    "Commerce Seed",
      command:  "npx ts-node prisma/seeds/commerce.seed.ts",
      required: true,
      reason:   "Unidades de medida, impuestos, categorías base",
    }] : []),
    ...(hasGym ? [{
      label:    "GYM Seed",
      command:  "npx ts-node prisma/seeds/gym.seed.ts",
      required: false,
      reason:   "Tipos de membresía, deportes y objetivos por defecto",
    }] : []),
    ...(hasDTE ? [{
      label:    "DTE Seed",
      command:  "npx ts-node prisma/seeds/dte.seed.ts",
      required: false,
      reason:   "Catálogos fiscales de Hacienda El Salvador",
    }] : []),
  ];

  return (
    <div className="space-y-4">

      <h3 className="text-sm font-semibold text-zinc-700">Instrucciones de Seeds</h3>

      <div className="mb-2">
        <p className="text-xs text-zinc-500 mb-2">
          Módulos activos en esta organización ({org.active_modules.length}):
        </p>
        <div className="flex flex-wrap gap-1.5">
          {org.active_modules.map((m) => (
            <span
              key={m.code}
              className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-[10px] font-mono rounded"
            >
              {m.code}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {seeds.map((s) => (
          <div
            key={s.label}
            className="border border-zinc-200 rounded-lg p-3 space-y-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-700">{s.label}</span>
              {s.required ? (
                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                  Requerido
                </span>
              ) : (
                <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-medium">
                  Opcional
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500">{s.reason}</p>
            <div className="bg-zinc-900 rounded px-3 py-2 flex items-center justify-between">
              <code className="font-mono text-xs text-green-400">{s.command}</code>
              <CopyButton value={s.command} />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <p className="text-xs text-amber-700">
          <strong>Nota:</strong> Ejecuta los seeds <em>después</em> de aplicar las migraciones.
          El orden recomendado es: Core → Commerce → Vertical → DTE.
        </p>
      </div>

    </div>
  );
}
