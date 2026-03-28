import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import type { UserRole } from "@prisma/client";

const ALLOWED_ROLES: UserRole[] = ["super_admin", "branch_admin", "reception"];

interface ReportEntry {
  href: string;
  label: string;
  description: string;
  roles: UserRole[];
  badge?: string;
}

interface ReportSection {
  title: string;
  icon: string;
  reports: ReportEntry[];
}

const REPORT_SECTIONS: ReportSection[] = [
  {
    title: "Membresías",
    icon: "M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z",
    reports: [
      {
        href: "/dashboard/reports/memberships/revenue-by-branch",
        label: "Ingresos por sucursal",
        description: "Ingresos de membresías activas con pago registrado, por sucursal.",
        roles: ["super_admin", "branch_admin", "reception"],
      },
      {
        href: "/dashboard/reports/memberships/active-by-branch",
        label: "Activas por sucursal",
        description: "Cantidad y valor en cartera de membresías activas agrupadas por sucursal.",
        roles: ["super_admin", "branch_admin", "reception"],
      },
      {
        href: "/dashboard/reports/memberships/expiring",
        label: "Por vencer",
        description: "Membresías activas próximas a vencer. Configura el horizonte en días.",
        roles: ["super_admin", "branch_admin", "reception"],
        badge: "Seguimiento",
      },
    ],
  },
  {
    title: "Clientes",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    reports: [
      {
        href: "/dashboard/reports/clients/active",
        label: "Clientes activos",
        description: "Listado completo de clientes con estado activo, membresía y entrenador asignado.",
        roles: ["super_admin", "branch_admin", "reception"],
      },
      {
        href: "/dashboard/reports/clients/low-adherence",
        label: "Baja adherencia",
        description: "Clientes con tasa de asistencia a clases por debajo del umbral configurado.",
        roles: ["super_admin", "branch_admin", "reception", "trainer"],
        badge: "Retención",
      },
    ],
  },
  {
    title: "Entrenadores",
    icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z",
    reports: [
      {
        href: "/dashboard/reports/trainers/classes-taught",
        label: "Clases impartidas",
        description: "Clases completadas por entrenador con total de asistentes y promedio por sesión.",
        roles: ["super_admin", "branch_admin", "reception"],
      },
    ],
  },
  {
    title: "Asistencia",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    reports: [
      {
        href: "/dashboard/reports/attendance/by-period",
        label: "Por período",
        description: "Resumen de asistencia con gráfica por día y detalle por sesión.",
        roles: ["super_admin", "branch_admin", "reception", "trainer"],
      },
    ],
  },
];

export default async function ReportsPage() {
  const user = await getSessionOrRedirect();

  if (!ALLOWED_ROLES.includes(user.role)) {
    redirect("/dashboard");
  }

  const visibleSections = REPORT_SECTIONS.map((section) => ({
    ...section,
    reports: section.reports.filter((r) => r.roles.includes(user.role)),
  })).filter((s) => s.reports.length > 0);

  const totalReports = visibleSections.reduce((sum, s) => sum + s.reports.length, 0);

  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Reportes</h1>
        <p className="text-zinc-400 text-sm mt-1">
          {totalReports} {totalReports === 1 ? "reporte disponible" : "reportes disponibles"}.
          Exportación a PDF y XLSX en cada reporte.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-8">
        {visibleSections.map((section) => (
          <div key={section.title}>
            {/* Section header */}
            <div className="flex items-center gap-2 mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 text-zinc-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={section.icon} />
              </svg>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                {section.title}
              </h2>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            {/* Report cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.reports.map((report) => (
                <Link
                  key={report.href}
                  href={report.href}
                  className="group block p-4 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/60 transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-white font-medium group-hover:text-zinc-100 transition-colors">
                      {report.label}
                    </p>
                    {report.badge && (
                      <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">
                        {report.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-zinc-400 text-sm leading-snug">
                    {report.description}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-zinc-600">
                    <span className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      XLSX
                    </span>
                    <span className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      PDF
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
