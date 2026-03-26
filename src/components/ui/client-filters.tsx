"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type Option = { id: string; name: string };
type BranchOption = { id: string; name: string };

type ClientFiltersProps = {
  branches?: BranchOption[];
  goals: Option[];
  sports: Option[];
  showBranchFilter: boolean;
};

export function ClientFilters({
  branches = [],
  goals,
  sports,
  showBranchFilter,
}: ClientFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page"); // reset pagination on filter change
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
        placeholder="Buscar nombre, correo, teléfono..."
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => updateParam("search", e.target.value)}
        className={inputCls + " min-w-[220px] flex-1"}
      />

      {/* Sucursal (solo super_admin) */}
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
        <option value="">Activos e inactivos</option>
        <option value="active">Activos</option>
        <option value="inactive">Inactivos</option>
        <option value="suspended">Suspendidos</option>
      </select>

      {/* Deporte */}
      <select
        defaultValue={searchParams.get("sport_id") ?? ""}
        onChange={(e) => updateParam("sport_id", e.target.value)}
        className={inputCls}
      >
        <option value="">Todos los deportes</option>
        {sports.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {/* Meta */}
      <select
        defaultValue={searchParams.get("goal_id") ?? ""}
        onChange={(e) => updateParam("goal_id", e.target.value)}
        className={inputCls}
      >
        <option value="">Todas las metas</option>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  );
}
