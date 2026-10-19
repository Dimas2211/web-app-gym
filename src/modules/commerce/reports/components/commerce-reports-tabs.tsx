// ─────────────────────────────────────────────────────────────────
// commerce/reports — commerce-reports-tabs.tsx
//
// Navegación interna de Commerce → Consultas y reportes.
// Cada consulta tiene su propia ruta (enlazable y con guard propio).
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";

export type CommerceReportTab = "dashboard" | "inventory-movements";

const TABS: { id: CommerceReportTab; label: string; href: string }[] = [
  { id: "dashboard",           label: "Ventas y compras",         href: "/dashboard/reports/commerce" },
  { id: "inventory-movements", label: "Movimientos por producto", href: "/dashboard/reports/commerce/inventory-movements" },
];

export function CommerceReportsTabs({ active }: { active: CommerceReportTab }) {
  return (
    <nav aria-label="Consultas y reportes" className="mb-6 flex gap-1 border-b border-zinc-800">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            t.id === active
              ? "border-zinc-100 text-zinc-100"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
