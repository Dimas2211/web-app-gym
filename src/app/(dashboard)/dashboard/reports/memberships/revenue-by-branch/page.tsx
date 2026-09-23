import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { RevenueByBranchReport } from "./RevenueByBranchReport";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";
import { requireEffectiveVertical } from "@/modules/platform/runtime/effective-vertical";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export default async function RevenueByBranchPage() {
  const user = await getSessionOrRedirect();

  if (!ALLOWED_ROLES.includes(user.role)) {
    redirect("/dashboard/reports");
  }

  // PASO 6D: tenant/PrismaClient EFECTIVOS bajo sesión runtime "Operar como cliente".
  const { context, dispose } = await resolveEffectiveTenantContext(user);
  const db = context.client ?? prisma;

  try {
    // PASO 6F: reporte GYM — requiere la vertical efectiva GYM.
    await requireEffectiveVertical(context.tenantId, "GYM");

    // super_admin puede filtrar por sucursal — se le pasa la lista para el select
    const branches =
      user.role === "super_admin"
        ? await db.branch.findMany({
            where: { tenant_id: context.tenantId, status: "active" },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : [];

    return (
      <main className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <p className="text-zinc-500 text-sm">
            <Link href="/dashboard/reports" className="hover:text-zinc-300 transition-colors">
              Reportes
            </Link>
            {" / "}
            <span className="text-zinc-400">Membresías</span>
            {" / "}
            <span className="text-zinc-300">Ingresos por sucursal</span>
          </p>
          <h1 className="text-2xl font-bold text-white mt-2">
            Ingresos por sucursal
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Membresías activas con pago registrado (pagado o parcial), agrupadas
            por sucursal.
          </p>
        </div>

        <RevenueByBranchReport
          branches={branches}
          isSuperAdmin={user.role === "super_admin"}
        />
      </main>
    );
  } finally {
    await dispose();
  }
}
