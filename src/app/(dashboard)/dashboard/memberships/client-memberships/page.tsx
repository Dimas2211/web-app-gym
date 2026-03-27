import Link from "next/link";
import { Suspense } from "react";
import { requireMembershipManager } from "@/lib/permissions/guards";
import { getClientMemberships } from "@/modules/memberships/queries";
import { getBranchOptions } from "@/modules/branches/queries";
import {
  toggleClientMembershipStatusAction,
  deleteClientMembershipAction,
} from "@/modules/memberships/actions";
import { DeleteAuthorizationDialog } from "@/components/forms/delete-authorization-dialog";
import { MembershipFilters } from "@/components/ui/membership-filters";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  MEMBERSHIP_STATUS_LABELS,
  MEMBERSHIP_STATUS_COLORS,
} from "@/lib/utils/labels";
import type { PaymentStatus, MembershipStatus } from "@prisma/client";

type SearchParams = Promise<{
  search?: string;
  status?: string;
  payment_status?: string;
  branch_id?: string;
  view?: string;
}>;

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isExpiringSoon(end_date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  const d = new Date(end_date);
  return d >= today && d <= in7Days;
}

export default async function ClientMembershipsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sessionUser = await requireMembershipManager();
  const params = await searchParams;

  const [memberships, branches] = await Promise.all([
    getClientMemberships(sessionUser, {
      search: params.search,
      status: params.status as MembershipStatus | undefined,
      payment_status: params.payment_status as PaymentStatus | undefined,
      branch_id: params.branch_id,
      view: params.view as "expiring" | "expired" | "active" | undefined,
    }),
    getBranchOptions(sessionUser),
  ]);

  const showBranchFilter = sessionUser.role === "super_admin";
  const isAdmin = sessionUser.role === "super_admin" || sessionUser.role === "branch_admin";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Membresías de clientes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{memberships.length} membresía(s)</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/dashboard/memberships/plans"
              className="text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
            >
              Gestionar planes
            </Link>
          )}
          <Link
            href="/dashboard/memberships/client-memberships/new"
            className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            + Asignar membresía
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <Suspense>
        <MembershipFilters branches={branches} showBranchFilter={showBranchFilter} />
      </Suspense>

      {/* Tabla */}
      {memberships.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
          <p className="text-zinc-400 text-sm">No hay membresías que coincidan con los filtros.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Cliente
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden md:table-cell">
                    Plan
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">
                    Vigencia
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Estado
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">
                    Pago
                  </th>
                  {showBranchFilter && (
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden lg:table-cell">
                      Sucursal
                    </th>
                  )}
                  <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {memberships.map((m) => {
                  const expiringSoon =
                    m.status === "active" && isExpiringSoon(m.end_date);
                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-zinc-50 transition-colors ${
                        expiringSoon ? "bg-amber-50/40" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/clients/${m.client.id}`}
                          className="font-medium text-zinc-800 hover:underline"
                        >
                          {m.client.first_name} {m.client.last_name}
                        </Link>
                        {m.client.email && (
                          <p className="text-xs text-zinc-400 mt-0.5 hidden md:block">
                            {m.client.email}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-zinc-700">{m.membership_plan.name}</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-zinc-600 text-xs">
                          {formatDate(m.start_date)} → {formatDate(m.end_date)}
                        </p>
                        {expiringSoon && (
                          <p className="text-amber-600 text-xs font-medium mt-0.5">
                            ⚠ Vence pronto
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            MEMBERSHIP_STATUS_COLORS[m.status as MembershipStatus]
                          }`}
                        >
                          {MEMBERSHIP_STATUS_LABELS[m.status as MembershipStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            PAYMENT_STATUS_COLORS[m.payment_status as PaymentStatus]
                          }`}
                        >
                          {PAYMENT_STATUS_LABELS[m.payment_status as PaymentStatus]}
                        </span>
                      </td>
                      {showBranchFilter && (
                        <td className="px-4 py-3 text-zinc-500 text-xs hidden lg:table-cell">
                          {m.branch.name}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/memberships/client-memberships/${m.id}/edit`}
                            className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                          >
                            Editar
                          </Link>
                          <form action={toggleClientMembershipStatusAction}>
                            <input type="hidden" name="id" value={m.id} />
                            <button
                              type="submit"
                              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                                m.status === "active"
                                  ? "text-amber-700 border-amber-200 hover:bg-amber-50"
                                  : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                              }`}
                            >
                              {m.status === "active" ? "Cancelar" : "Activar"}
                            </button>
                          </form>
                          <DeleteAuthorizationDialog
                            entityLabel={`la membresía de ${m.client.first_name} ${m.client.last_name}`}
                            userRole={sessionUser.role}
                            hiddenFields={{ id: m.id }}
                            action={deleteClientMembershipAction}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
