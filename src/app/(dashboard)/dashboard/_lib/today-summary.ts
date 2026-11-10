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
// - Alcance: UNA sucursal, resuelta exactamente como caja/ventas/compras:
//     · Support Session → primera sucursal activa (referencia de soporte).
//     · Resto → location del JWT/runtime o la sede elegida en el selector.
//   Sin sucursal no hay consolidado: se pide elegir sede (misma política
//   que Reportes Comerciales). La etiqueta nombra la sucursal mostrada.
// - "Hoy" = día calendario de la zona horaria de la organización.
// Nunca escribe. Un error de lectura se informa como "no disponible" (no
// como un resumen vacío) y se registra en el servidor sin detalles sensibles.
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

export type TodayStat = {
  key: "sales" | "cash" | "classes" | "expiring";
  label: string;
  value: string;
  hint: string;
  href: string;
};

/**
 * - ok: indicadores de la sucursal `scopeLabel`.
 * - needs_location: el usuario debe elegir sede (o el tenant no tiene sedes activas).
 * - error: la lectura falló; mostrar "no disponible", nunca ceros.
 */
export type TodaySummary =
  | { status: "ok"; scopeLabel: string; stats: TodayStat[] }
  | { status: "needs_location"; message: string }
  | { status: "error" };

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

// Columnas @db.Date: Prisma las compara como medianoche UTC del día calendario.
const asDate = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

const money = (v: Prisma.Decimal | number | null) =>
  new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(Number(v ?? 0));

/** Registro server-side sin mensajes de Prisma (pueden incluir valores de consulta). */
function logSummaryError(err: unknown): void {
  const code =
    err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : undefined;
  const name = err instanceof Error ? err.name : "UnknownError";
  console.error(`[today-summary] lectura fallida (${name}${code ? ` ${code}` : ""})`);
}

export async function getTodaySummary(
  user: SessionUser,
  visibleGroups: ModuleGroup[],
  options: { timeZone: string; now?: Date },
): Promise<TodaySummary | null> {
  const visibleHrefs = new Set(
    visibleGroups.flatMap((g) => g.items.filter((i) => !i.disabled).map((i) => i.href)),
  );
  const wants = {
    sales: visibleHrefs.has("/dashboard/sales"),
    cash: visibleHrefs.has("/dashboard/cash"),
    classes: visibleHrefs.has("/dashboard/classes"),
    expiring: visibleHrefs.has("/dashboard/memberships/client-memberships"),
  };
  if (!Object.values(wants).some(Boolean)) return null;

  // Fuera del try: un RUNTIME_CLIENT inválido falla cerrado (igual que el resto del dashboard).
  const { context, dispose } = await resolveEffectiveTenantContext(user);
  try {
    if (!SUMMARY_ROLES.has(context.effectiveRole) || !context.tenantId) return null;

    const db = context.client ?? prisma;
    const tenant_id = context.tenantId;
    const isSupportReference = context.runtime !== null;
    const location_id = isSupportReference
      ? await resolveRuntimeFirstLocationId(context)
      : (context.locationId ?? (await getEffectiveLocationId(user, context.client, tenant_id)));

    if (!location_id) {
      if (isSupportReference) {
        return { status: "needs_location", message: "La organización no tiene sucursales activas." };
      }
      // Solo el usuario global puede elegir sede; un rol con sede fija sin sede no ve indicadores.
      if (context.effectiveRole !== "super_admin") return null;
      return {
        status: "needs_location",
        message: "Elige la sede en el selector de la barra superior para ver el resumen de hoy.",
      };
    }

    // La sucursal debe pertenecer al tenant efectivo (defensa en profundidad).
    const branch = await db.branch.findFirst({
      where: { id: location_id, tenant_id },
      select: { name: true },
    });
    if (!branch) return null;

    const today = localDateString(options.timeZone, options.now);
    const inSevenDays = addDaysIso(today, 7);
    const stats: TodayStat[] = [];

    if (wants.sales) {
      const agg = await db.sale.aggregate({
        where: { tenant_id, location_id, status: "CONFIRMED", sale_date: asDate(today) },
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
        where: { tenant_id, location_id, status: "OPEN" },
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
          branch_id: location_id,
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
      // Misma ventana que la vista "Por vencer" de membresías: hoy … hoy + 7.
      const expiring = await db.clientMembership.count({
        where: {
          tenant_id,
          branch_id: location_id,
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

    const scopeLabel = isSupportReference
      ? `Sucursal de referencia (soporte): ${branch.name}`
      : `Sucursal: ${branch.name}`;
    return { status: "ok", scopeLabel, stats };
  } catch (err) {
    logSummaryError(err);
    return { status: "error" };
  } finally {
    await dispose();
  }
}
