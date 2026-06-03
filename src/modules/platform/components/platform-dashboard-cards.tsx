// ─────────────────────────────────────────────────────────────────
// platform — platform-dashboard-cards.tsx
//
// Cards de resumen para el panel principal de Platform Admin.
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { PlatformStats } from "../queries/get-platform-stats";

interface StatCardProps {
  label:       string;
  value:       number;
  description: string;
  href?:       string;
}

function StatCard({ label, value, description, href }: StatCardProps) {
  const inner = (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 h-full">
      <p className="text-3xl font-bold text-zinc-800">{value}</p>
      <p className="text-sm font-semibold text-zinc-700 mt-1">{label}</p>
      <p className="text-xs text-zinc-400 mt-0.5">{description}</p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="hover:shadow-md transition-shadow rounded-xl">
        {inner}
      </Link>
    );
  }

  return inner;
}

export function PlatformDashboardCards({ stats }: { stats: PlatformStats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      <StatCard
        label="Organizaciones"
        value={stats.totalOrgs}
        description="Total registradas"
        href="/dashboard/platform/organizations"
      />
      <StatCard
        label="Activas"
        value={stats.activeOrgs}
        description="Status ACTIVE"
        href="/dashboard/platform/organizations"
      />
      <StatCard
        label="En Trial"
        value={stats.trialOrgs}
        description="Licencia TRIAL"
        href="/dashboard/platform/organizations"
      />
      <StatCard
        label="Módulos"
        value={stats.totalModules}
        description="Catálogo de módulos"
      />
      <StatCard
        label="Verticales"
        value={stats.totalVerticals}
        description="Verticales activas"
      />
    </div>
  );
}
