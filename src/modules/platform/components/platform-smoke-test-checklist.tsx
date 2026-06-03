"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-smoke-test-checklist.tsx
//
// Checklist de smoke test post-deploy. Estado local en cliente.
// No persiste en base de datos — es una guía visual interactiva.
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import type { ManualDeploymentOrgDetails } from "../types/platform.types";

interface SmokeItem {
  id:       string;
  label:    string;
  category: string;
}

const SMOKE_TESTS: SmokeItem[] = [
  { id: "login_admin",       label: "Login admin funciona correctamente",            category: "Auth" },
  { id: "dashboard_load",    label: "Dashboard principal carga sin errores",          category: "Core" },
  { id: "clients_load",      label: "Módulo Clientes carga y lista registros",        category: "Core" },
  { id: "products_load",     label: "Módulo Productos carga y lista catálogo",        category: "Commerce" },
  { id: "inventory_load",    label: "Módulo Inventario carga correctamente",          category: "Commerce" },
  { id: "sales_load",        label: "Módulo Ventas carga y permite crear venta",      category: "Commerce" },
  { id: "cash_load",         label: "Módulo Caja carga y permite abrir sesión",       category: "Commerce" },
  { id: "vertical_load",     label: "Módulos de vertical (GYM/VET/etc.) cargan",     category: "Vertical" },
  { id: "branding_ok",       label: "Branding (logo, colores) se muestra correctamente", category: "Branding" },
  { id: "permissions_ok",    label: "Permisos de roles funcionan correctamente",      category: "Auth" },
  { id: "no_console_errors", label: "Sin errores en consola del navegador",           category: "QA" },
  { id: "responsive_ok",     label: "Vista responsive funciona en móvil",             category: "QA" },
];

interface Props {
  org?: ManualDeploymentOrgDetails;
}

export function PlatformSmokeTestChecklist({ org }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const total  = SMOKE_TESTS.length;
  const passed = Object.values(checked).filter(Boolean).length;
  const pct    = Math.round((passed / total) * 100);

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const categories = [...new Set(SMOKE_TESTS.map((t) => t.category))];

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700">Smoke Test Checklist</h3>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                pct === 100 ? "bg-green-500" : "bg-blue-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`text-xs font-semibold ${pct === 100 ? "text-green-600" : "text-zinc-500"}`}>
            {passed}/{total}
          </span>
        </div>
      </div>

      {pct === 100 && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <p className="text-xs text-green-700 font-medium">
            Todos los checks de smoke test completados. La instancia parece funcionar correctamente.
          </p>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat}>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">
            {cat}
          </p>
          <div className="space-y-1">
            {SMOKE_TESTS.filter((t) => t.category === cat).map((test) => (
              <label
                key={test.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  checked[test.id]
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!checked[test.id]}
                  onChange={() => toggle(test.id)}
                  className="w-3.5 h-3.5 accent-green-600 shrink-0"
                />
                <span className="text-sm">{test.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {org?.deployment_url && (
        <div className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
          URL destino:{" "}
          <span className="font-mono text-zinc-700 break-all">{org.deployment_url}</span>
        </div>
      )}

    </div>
  );
}
