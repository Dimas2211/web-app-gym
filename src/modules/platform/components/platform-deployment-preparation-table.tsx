"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-preparation-table.tsx
//
// Tabla de organizaciones en el Deployment Preparation Dashboard.
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ExternalLink, PackageCheck, Package } from "lucide-react";
import { PlatformProvisioningStatusBadge } from "./platform-provisioning-status-badge";
import type { DeploymentPreparationItem } from "../types/platform.types";

interface Props {
  items: DeploymentPreparationItem[];
}

export function PlatformDeploymentPreparationTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-400 italic py-6 text-center">
        No hay organizaciones registradas.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 uppercase tracking-wide">
            <th className="pb-2 pr-4 font-medium">Organización</th>
            <th className="pb-2 pr-4 font-medium">Vertical / Plan</th>
            <th className="pb-2 pr-4 font-medium">Provisioning</th>
            <th className="pb-2 pr-4 font-medium">Exportaciones</th>
            <th className="pb-2 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
              <td className="py-3 pr-4">
                <div className="font-medium text-zinc-800">{item.name}</div>
                <div className="text-xs text-zinc-400 font-mono">{item.code}</div>
              </td>
              <td className="py-3 pr-4">
                <div className="text-zinc-700">{item.vertical?.name ?? <span className="text-zinc-400 italic">Sin vertical</span>}</div>
                <div className="text-xs text-zinc-400">{item.plan?.name ?? "Sin plan"}</div>
              </td>
              <td className="py-3 pr-4">
                <PlatformProvisioningStatusBadge status={item.provisioning_status} />
              </td>
              <td className="py-3 pr-4">
                <div className="flex items-center gap-1.5 text-zinc-600">
                  {item.export_count > 0 ? (
                    <>
                      <PackageCheck size={13} className="text-emerald-500" />
                      <span className="text-xs">
                        {item.export_count} {item.export_count === 1 ? "exportación" : "exportaciones"}
                      </span>
                    </>
                  ) : (
                    <>
                      <Package size={13} className="text-zinc-400" />
                      <span className="text-xs text-zinc-400">Sin exportaciones</span>
                    </>
                  )}
                </div>
                {item.last_export_at && (
                  <div className="text-xs text-zinc-400 mt-0.5">
                    Última: {new Date(item.last_export_at).toLocaleDateString("es-SV")}
                  </div>
                )}
              </td>
              <td className="py-3">
                <Link
                  href={`/dashboard/platform/deployment-preparation/${item.id}`}
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <ExternalLink size={12} />
                  Preparar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
