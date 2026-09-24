"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-shared-target-organizations-table.tsx
//
// SHARED-OPS-PARITY-1. Subtabla de ORGANIZACIONES asignadas a un Shared
// Runtime Target. Separa explícitamente las capacidades:
//   A) BASE FÍSICA (fila del target): editar, probar conexión, activar.
//   B) ORGANIZACIÓN / TENANT (esta subtabla): operar como cliente, data
//      onboarding, baseline Commerce.
// No existe ninguna acción tenant-scoped sobre el target sin organización:
// cada botón lleva el organizationId de SU fila; tenant y runtime se
// resuelven server-side.
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import { FileSpreadsheet, LogIn } from "lucide-react";
import { enterOrganizationRuntimeAction } from "../actions/enter-organization-runtime.action";
import { EnsureOrganizationBaselineButton } from "./ensure-organization-baseline-button";
import type { SharedRuntimeTargetOrganizationItem } from "../queries/list-shared-runtime-targets";

interface Props {
  organizations: SharedRuntimeTargetOrganizationItem[];
}

export function PlatformSharedTargetOrganizationsTable({ organizations }: Props) {
  if (organizations.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-zinc-400">
        Este Shared Runtime no tiene organizaciones asignadas.
      </p>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] text-zinc-400 uppercase tracking-wide">
          <th className="px-3 py-2 text-left font-semibold">Código</th>
          <th className="px-3 py-2 text-left font-semibold">Nombre</th>
          <th className="px-3 py-2 text-left font-semibold">Tenant ID</th>
          <th className="px-3 py-2 text-left font-semibold">Estado</th>
          <th className="px-3 py-2 text-left font-semibold">Provisioning</th>
          <th className="px-3 py-2 text-left font-semibold">Dominio</th>
          <th className="px-3 py-2 text-left font-semibold">Acciones de organización</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-violet-100">
        {organizations.map((org) => {
          const hasTenant = !!org.tenant_id;
          return (
            <tr key={org.id} data-organization-id={org.id}>
              <td className="px-3 py-2 font-mono text-zinc-700 whitespace-nowrap">{org.code}</td>
              <td className="px-3 py-2 text-zinc-800 whitespace-nowrap">{org.name}</td>
              <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                {org.tenant_id ?? <span className="text-amber-600">sin tenant</span>}
              </td>
              <td className="px-3 py-2 text-zinc-600 whitespace-nowrap">{org.status}</td>
              <td className="px-3 py-2 text-zinc-600 whitespace-nowrap">{org.provisioning_status}</td>
              <td className="px-3 py-2 text-zinc-600 whitespace-nowrap">{org.domain ?? "—"}</td>
              <td className="px-3 py-2">
                <div className="flex items-start gap-1.5 flex-wrap">
                  {/* Operar como cliente — por ORGANIZACIÓN (nunca por target) */}
                  <form action={enterOrganizationRuntimeAction}>
                    <input type="hidden" name="organizationId" value={org.id} />
                    <button
                      type="submit"
                      disabled={!hasTenant}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                                 border border-amber-300 rounded-lg text-amber-700
                                 hover:bg-amber-50 transition-colors disabled:opacity-40
                                 disabled:cursor-not-allowed whitespace-nowrap"
                      title={hasTenant
                        ? "Entrar al dashboard real operando temporalmente como esta organización (solo lectura)"
                        : "La organización necesita un tenant provisionado"}
                    >
                      <LogIn size={11} />
                      Operar como cliente
                    </button>
                  </form>

                  {hasTenant ? (
                    <Link
                      href={`/dashboard/platform/data-onboarding/org/${org.id}`}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                                 border border-violet-200 rounded-lg text-violet-700
                                 hover:bg-violet-50 transition-colors whitespace-nowrap"
                      title="Abrir Data Onboarding Center para esta organización"
                    >
                      <FileSpreadsheet size={11} />
                      Data onboarding
                    </Link>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                                 border border-zinc-200 rounded-lg text-zinc-400 opacity-60 whitespace-nowrap"
                      title="La organización necesita un tenant provisionado"
                    >
                      <FileSpreadsheet size={11} />
                      Data onboarding
                    </span>
                  )}

                  <EnsureOrganizationBaselineButton
                    organizationId={org.id}
                    organizationCode={org.code}
                    disabled={!hasTenant}
                  />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
