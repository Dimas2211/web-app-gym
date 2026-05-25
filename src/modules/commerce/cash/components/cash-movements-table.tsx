"use client";

import type {
  CashMovementItem,
  CashMovementDirection,
} from "../types/cash.types";

// ── Helpers ───────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return "$" + Number(value).toFixed(2);
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-SV", {
    day:    "2-digit",
    month:  "2-digit",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

// ── Props ─────────────────────────────────────────────────────────

interface CashMovementsTableProps {
  movements: CashMovementItem[];
  loading:   boolean;
  error:     string | null;
}

// ── Componente ────────────────────────────────────────────────────

export function CashMovementsTable({
  movements,
  loading,
  error,
}: CashMovementsTableProps) {
  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-zinc-400">
        Cargando movimientos...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-zinc-400">
        No hay movimientos registrados en esta sesión.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
            <th className="pb-2 pr-4 font-medium whitespace-nowrap">Fecha/Hora</th>
            <th className="pb-2 pr-4 font-medium">Tipo</th>
            <th className="pb-2 pr-4 font-medium">Dirección</th>
            <th className="pb-2 pr-4 font-medium text-right whitespace-nowrap">Monto</th>
            <th className="pb-2 pr-4 font-medium">Motivo</th>
            <th className="pb-2 pr-4 font-medium">Referencia</th>
            <th className="pb-2 pr-4 font-medium">Usuario</th>
            <th className="pb-2 font-medium">Notas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {movements.map((m) => (
            <tr key={m.id} className="text-zinc-700">
              <td className="py-2 pr-4 text-xs whitespace-nowrap text-zinc-500">
                {formatDate(m.performed_at)}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">
                {m.movement_type_label}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">
                <DirectionBadge direction={m.direction} />
              </td>
              <td
                className={`py-2 pr-4 text-right font-medium whitespace-nowrap ${
                  m.direction === "IN" ? "text-green-700" : "text-red-600"
                }`}
              >
                {m.direction === "IN" ? "+" : "-"}
                {formatCurrency(m.amount)}
              </td>
              <td className="py-2 pr-4 text-zinc-500">
                {m.reason ?? "—"}
              </td>
              <td className="py-2 pr-4 text-zinc-500">
                {m.reference ?? "—"}
              </td>
              <td className="py-2 pr-4 text-xs whitespace-nowrap text-zinc-500">
                {m.performed_by_name ?? m.performed_by}
              </td>
              <td className="max-w-[160px] truncate py-2 text-zinc-500">
                {m.notes ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Badge de dirección ────────────────────────────────────────────

function DirectionBadge({ direction }: { direction: CashMovementDirection }) {
  if (direction === "IN") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        Entrada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
      Salida
    </span>
  );
}
