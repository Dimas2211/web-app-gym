"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { PAYMENT_STATUS_LABELS, MEMBERSHIP_STATUS_LABELS } from "@/lib/utils/labels";
import type { PaymentStatus, MembershipStatus } from "@prisma/client";

type BranchOption = { id: string; name: string };

type MembershipFiltersProps = {
  branches?: BranchOption[];
  showBranchFilter: boolean;
};

export function MembershipFilters({
  branches = [],
  showBranchFilter,
}: MembershipFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const inputCls =
    "border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";

  return (
    <div className="flex flex-wrap gap-3">
      {/* Búsqueda */}
      <input
        type="search"
        placeholder="Buscar cliente..."
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => updateParam("search", e.target.value)}
        className={inputCls + " min-w-[200px] flex-1"}
      />

      {/* Vista rápida */}
      <select
        defaultValue={searchParams.get("view") ?? ""}
        onChange={(e) => updateParam("view", e.target.value)}
        className={inputCls}
      >
        <option value="">Todas</option>
        <option value="active">Activas vigentes</option>
        <option value="expiring">Por vencer (7 días)</option>
        <option value="expired">Vencidas</option>
      </select>

      {/* Sucursal */}
      {showBranchFilter && (
        <select
          defaultValue={searchParams.get("branch_id") ?? ""}
          onChange={(e) => updateParam("branch_id", e.target.value)}
          className={inputCls}
        >
          <option value="">Todas las sucursales</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      {/* Estado */}
      <select
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => updateParam("status", e.target.value)}
        className={inputCls}
      >
        <option value="">Todos los estados</option>
        {(Object.keys(MEMBERSHIP_STATUS_LABELS) as MembershipStatus[]).map((s) => (
          <option key={s} value={s}>
            {MEMBERSHIP_STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      {/* Estado de pago */}
      <select
        defaultValue={searchParams.get("payment_status") ?? ""}
        onChange={(e) => updateParam("payment_status", e.target.value)}
        className={inputCls}
      >
        <option value="">Todos los pagos</option>
        {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((s) => (
          <option key={s} value={s}>
            {PAYMENT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
