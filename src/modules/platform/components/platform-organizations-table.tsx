// ─────────────────────────────────────────────────────────────────
// platform — platform-organizations-table.tsx
//
// Tabla de organizaciones para el listado Platform Admin.
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { PlatformOrganizationListItem } from "../types/platform.types";

const ORG_STATUS_COLORS: Record<string, string> = {
  PENDING:   "bg-yellow-100 text-yellow-700",
  ACTIVE:    "bg-green-100 text-green-700",
  SUSPENDED: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const LICENSE_STATUS_COLORS: Record<string, string> = {
  TRIAL:     "bg-blue-100 text-blue-700",
  ACTIVE:    "bg-green-100 text-green-700",
  SUSPENDED: "bg-orange-100 text-orange-700",
  EXPIRED:   "bg-red-100 text-red-700",
  CANCELLED: "bg-zinc-100 text-zinc-500",
};

interface PlatformOrganizationsTableProps {
  items:     PlatformOrganizationListItem[];
  isLoading: boolean;
}

export function PlatformOrganizationsTable({
  items,
  isLoading,
}: PlatformOrganizationsTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-zinc-400">
        Cargando…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-zinc-400">
        Sin resultados.
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-white">
        <tr className="border-b border-zinc-100">
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Código</th>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Nombre</th>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Vertical</th>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Plan</th>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Status</th>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Licencia</th>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">País</th>
          <th className="px-4 py-2.5 text-xs font-semibold text-zinc-500 text-right">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {items.map((org) => (
          <tr key={org.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors">
            <td className="px-4 py-3 font-mono text-xs text-zinc-600">{org.code}</td>
            <td className="px-4 py-3 font-medium text-zinc-800 max-w-[200px] truncate">
              {org.name}
              {org.legal_name && (
                <span className="block text-xs font-normal text-zinc-400 truncate">
                  {org.legal_name}
                </span>
              )}
            </td>
            <td className="px-4 py-3 text-xs text-zinc-600">{org.vertical?.name ?? "—"}</td>
            <td className="px-4 py-3 text-xs text-zinc-600">{org.plan?.name ?? "—"}</td>
            <td className="px-4 py-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ORG_STATUS_COLORS[org.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                {org.status}
              </span>
            </td>
            <td className="px-4 py-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LICENSE_STATUS_COLORS[org.license_status] ?? "bg-zinc-100 text-zinc-500"}`}>
                {org.license_status}
              </span>
            </td>
            <td className="px-4 py-3 text-xs text-zinc-500">{org.country_code ?? "—"}</td>
            <td className="px-4 py-3 text-right">
              <Link
                href={`/dashboard/platform/organizations/${org.id}`}
                className="text-xs font-semibold text-zinc-700 hover:text-zinc-900 underline underline-offset-2"
              >
                Ver detalle
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
