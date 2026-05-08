"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — sale-dte-badge.tsx
//
// Badge informativo de estado DTE. Fase 4B: solo placeholder.
// ─────────────────────────────────────────────────────────────────

interface SaleDteBadgeProps {
  status?: string | null;
}

export function SaleDteBadge({ status }: SaleDteBadgeProps) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-500 border border-zinc-700">
        DTE no generado
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
      {status}
    </span>
  );
}
