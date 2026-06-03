"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-provisioning-table.tsx
//
// Tabla principal del dashboard de provisioning.
// Lista organizaciones con su estado de provisioning.
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PlatformProvisioningStatusBadge } from "./platform-provisioning-status-badge";
import type {
  ProvisioningOrganizationItem,
  PlatformOrganizationStatus,
  PlatformLicenseStatus,
} from "../types/platform.types";

const ORG_STATUS_COLORS: Record<PlatformOrganizationStatus, string> = {
  PENDING:   "bg-yellow-100 text-yellow-700",
  ACTIVE:    "bg-green-100 text-green-700",
  SUSPENDED: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const LICENSE_COLORS: Record<PlatformLicenseStatus, string> = {
  TRIAL:     "bg-blue-100 text-blue-700",
  ACTIVE:    "bg-green-100 text-green-700",
  SUSPENDED: "bg-orange-100 text-orange-700",
  EXPIRED:   "bg-red-100 text-red-700",
  CANCELLED: "bg-zinc-100 text-zinc-500",
};

interface Props {
  organizations: ProvisioningOrganizationItem[];
}

export function PlatformProvisioningTable({ organizations }: Props) {
  if (organizations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-8 text-center">
        <p className="text-sm text-zinc-400">Sin organizaciones registradas.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Organización
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Vertical / Plan
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Estado org.
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Licencia
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Provisioning
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {organizations.map((org) => (
              <tr key={org.id} className="hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-zinc-800">{org.name}</p>
                  <p className="text-xs font-mono text-zinc-400">{org.code}</p>
                </td>
                <td className="px-4 py-3 text-zinc-600">
                  <p>{org.vertical?.name ?? <span className="text-zinc-300">—</span>}</p>
                  <p className="text-xs text-zinc-400">{org.plan?.name ?? "—"}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${ORG_STATUS_COLORS[org.status]}`}>
                    {org.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${LICENSE_COLORS[org.license_status]}`}>
                    {org.license_status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <PlatformProvisioningStatusBadge status={org.provisioning_status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/platform/provisioning/${org.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Detalle
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
