// ─────────────────────────────────────────────────────────────────
// Inicio — "Resumen de hoy" (solo lectura).
//
// Indicadores del día para el inicio del dashboard. Reglas de acceso:
// - Solo roles operativos/administrativos LIVE: super_admin, branch_admin,
//   reception (entrenador y cliente no ven indicadores).
// - Cada indicador exige que su módulo ya sea visible en el menú del usuario
//   (mismo filtro rol + módulo comercial + vertical que el sidebar).
// - Base efectiva (runtime dedicado/shared o global) vía
//   resolveEffectiveTenantContext, igual que caja.
// - Alcance por sucursal: la location efectiva (misma resolución que caja).
//   Solo super_admin sin location activa ve el total del tenant.
// Nunca escribe. Cualquier error degrada a "sin indicadores".
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";
import type { ModuleGroup } from "@/lib/navigation/dashboard-nav";

const SUMMARY_ROLES = new Set(["super_admin", "branch_admin", "reception"]);
// El producto opera en El Salvador; "hoy" se calcula en esa zona horaria.
const SUMMARY_TIMEZONE = "America/El_Salvador";

export type TodayStat = {
  key: "sales" | "cash" | "classes" | "expiring";
  label: string;
  value: string;
  hint: string;
  href: string;
};

export type TodaySummary = { scopeLabel: string; stats: TodayStat[] };

/** "YYYY-MM-DD" del día calendario en la zona indicada. */
export function localDateString(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const asDate = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

const money = (v: Prisma.Decimal | number | null) =>
  new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(Number(v ?? 0));

export async function getTodaySummary(
  user: SessionUser,
  visibleGroups: ModuleGroup[],
): Promise<TodaySummary | null> {
  const visibleHrefs = new Set(visibleGroups.flatMap((g) => g.items.map((i) => i.href)));
  const wants = {
    sales: visibleHrefs.has("/dashboard/sales"),
    cash: visibleHrefs.has("/dashboard/cash"),
    classes: visibleHrefs.has("/dashboard/classes"),
    expiring: visibleHrefs.has("/dashboard/memberships/client-memberships"),
  };
  if (!Object.values(wants).some(Boolean)) return null;

  const { context, dispose } = await resolveEffectiveTenantContext(user);
  try {
    if (!SUMMARY_ROLES.has(context.effectiveRole) || !context.tenantId) return null;

    const db = context.client ?? prisma;
    const tenant_id = context.tenantId;
    const location_id = context.runtime
      ? await resolveRuntimeFirstLocationId(context)
      : (context.locationId ?? (await getEffectiveLocationId(user, context.client, tenant_id)));

    // Sin location: solo super_admin ve el consolidado del tenant.
    if (!location_id && context.effectiveRole !== "super_admin") return null;

    const today = localDateString(SUMMARY_TIMEZONE);
    const inSevenDays = addDaysIso(today, 7);
    const stats: TodayStat[] = [];

    if (wants.sales) {
      const agg = await db.sale.aggregate({
        where: {
          tenant_id,
          ...(location_id ? { location_id } : {}),
          status: "CONFIRMED",
          sale_date: asDate(today),
        },
        _count: { _all: true },
        _sum: { total_amount: true },
      });
      stats.push({
        key: "sales",
        label: "Ventas de hoy",
        value: money(agg._sum.total_amount),
        hint: `${agg._count._all} confirmada${agg._count._all === 1 ? "" : "s"}`,
        href: "/dashboard/sales",
      });
    }

    if (wants.cash) {
      const open = await db.cashSession.count({
        where: { tenant_id, ...(location_id ? { location_id } : {}), status: "OPEN" },
      });
      stats.push({
        key: "cash",
        label: "Caja",
        value: open > 0 ? "Abierta" : "Cerrada",
        hint: open > 1 ? `${open} sesiones abiertas` : open === 1 ? "1 sesión abierta" : "Sin sesión abierta",
        href: "/dashboard/cash",
      });
    }

    if (wants.classes) {
      const classes = await db.scheduledClass.count({
        where: {
          tenant_id,
          ...(location_id ? { branch_id: location_id } : {}),
          class_date: asDate(today),
          status: { not: "cancelled" },
        },
      });
      stats.push({
        key: "classes",
        label: "Clases de hoy",
        value: String(classes),
        hint: classes === 1 ? "sesión programada" : "sesiones programadas",
        href: "/dashboard/classes",
      });
    }

    if (wants.expiring) {
      const expiring = await db.clientMembership.count({
        where: {
          tenant_id,
          ...(location_id ? { branch_id: location_id } : {}),
          status: "active",
          end_date: { gte: asDate(today), lte: asDate(inSevenDays) },
        },
      });
      stats.push({
        key: "expiring",
        label: "Membresías por vencer",
        value: String(expiring),
        hint: "en los próximos 7 días",
        href: "/dashboard/memberships/client-memberships",
      });
    }

    return { scopeLabel: location_id ? "Sucursal activa" : "Todas las sucursales", stats };
  } catch {
    return null;
  } finally {
    await dispose();
  }
}
