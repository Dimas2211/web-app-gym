import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MembershipStatus, PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions/guards";
vi.mock("@/lib/db/prisma", () => ({ prisma: new Proxy({}, { get() { throw new Error("No usar base global"); } }) }));
import { getClientMemberships, getClientMembershipById, getClientMembershipsByClientId } from "./queries";
import { getMembershipToday } from "./membership-calendar";
import { getMyActiveMembership, getMyMemberships, hasActiveMembership, loadPortalMembershipSummary } from "@/modules/client-portal/queries";
import { getActiveMembershipsByBranch, getExpiringMemberships } from "@/modules/reports/queries";
import { GYM_BOOKING_POLICY_DEFAULTS } from "@/modules/classes/booking/booking-policy";

type Row = Record<string, unknown>;
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (value as Row[]).every(w => matches(row, w));
    if (key === "OR") return (value as Row[]).some(w => matches(row, w));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const ops = value as Row;
      const actual = row[key] as Date;
      if ("lt" in ops && !(actual < (ops.lt as Date))) return false;
      if ("lte" in ops && !(actual <= (ops.lte as Date))) return false;
      if ("gte" in ops && !(actual >= (ops.gte as Date))) return false;
      if ("lt" in ops || "lte" in ops || "gte" in ops) return true;
      if ("in" in ops) return (ops.in as unknown[]).includes(row[key]);
    }
    return row[key] === value;
  });
}
function membership(id: string, end: string, status: MembershipStatus = "active", extra: Row = {}) {
  return { id, gym_id: "gym-extension-a", membership_plan_id: "plan", tenant_id: "gym-a", branch_id: "branch-a", client_id: "doris", status,
    start_date: new Date("2026-10-09T00:00:00Z"), end_date: new Date(`${end}T00:00:00Z`),
    payment_status: "paid", modality: "NORMAL", sessions_total: null, sessions_used: 0, final_amount: 30,
    client: { first_name: "Persona", last_name: "Prueba" }, branch: { name: "Sede" },
    membership_plan: { name: "Mensual", description: null, access_type: "unlimited" }, assigned_trainer: null, ...extra };
}
const rows = [
  membership("old", "2026-11-08"), membership("renewal", "2026-12-09", "active", { start_date: new Date("2026-11-09T00:00:00Z") }),
  membership("today", "2026-11-19"), membership("cancelled", "2026-11-08", "cancelled"),
  membership("suspended", "2026-11-08", "suspended"), membership("manual-expired", "2026-12-09", "expired"),
  membership("future", "2026-12-30", "active", { start_date: new Date("2026-12-01T00:00:00Z") }),
  membership("neighbor", "2026-11-19", "active", { tenant_id: "gym-b", gym_id: "gym-extension-b", client_id: "other" }),
];
const user = { id: "admin", tenant_id: "gym-a", role: "super_admin", location_id: "branch-a" } as SessionUser;
function database() {
  const settings = vi.fn(async ({ where }: { where: { gym: { tenant_id?: string; clients?: { some: { id: string } } } } }) => ({
    ...GYM_BOOKING_POLICY_DEFAULTS,
    timezone: (where.gym.tenant_id ?? rows.find(m => m.client_id === where.gym.clients?.some.id)?.tenant_id) === "gym-b" ? "Asia/Tokyo" : "America/El_Salvador",
  }));
  const findMany = vi.fn(async ({ where, take }: { where: Row; take?: number }) => rows.filter(row => matches(row, where)).slice(0, take));
  const findFirst = vi.fn(async ({ where }: { where: Row }) => rows.find(row => matches(row, where)) ?? null);
  const groupBy = vi.fn(async ({ where }: { where: Row }) => {
    const selected = rows.filter(row => matches(row, where));
    return selected.length ? [{ branch_id: "branch-a", membership_plan_id: "plan", _count: { id: selected.length },
      _sum: { final_amount: selected.reduce((sum, row) => sum + Number(row.final_amount), 0) } }] : [];
  });
  return { db: {
    gym: { findUnique: vi.fn(async ({ where }: { where: { tenant_id: string } }) => ({ id: where.tenant_id === "gym-b" ? "gym-extension-b" : "gym-extension-a" })) },
    branch: { findMany: vi.fn(async () => [{ id: "branch-a", name: "Sede" }]) },
    membershipPlan: { findMany: vi.fn(async () => [{ id: "plan", name: "Mensual" }]) },
    gymSettings: { findFirst: settings }, clientMembership: { findMany, findFirst, groupBy },
  } as unknown as PrismaClient, settings, findMany };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-20T02:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("consultas de vencimiento comunes a todos los gimnasios", () => {
  it("listado e historial de Doris muestran la misma caducidad sin cambiar el registro original", async () => {
    const { db } = database();
    const list = await getClientMemberships(user, {}, db);
    const history = await getClientMembershipsByClientId("doris", user, db);
    for (const result of [list, history]) {
      expect(result.find(m => m.id === "old")?.status).toBe("expired");
      expect(result.find(m => m.id === "renewal")?.status).toBe("active");
      expect(result.find(m => m.id === "today")?.status).toBe("active");
      expect(result.some(m => m.id === "neighbor")).toBe(false);
    }
    expect(rows.find(m => m.id === "old")?.status).toBe("active");
  });
  it("el filtro Vencida y la vista Vencidas coinciden, excluyendo canceladas y suspendidas", async () => {
    const { db } = database();
    for (const filter of [{ status: "expired" as const }, { view: "expired" as const }]) {
      expect((await getClientMemberships(user, filter, db)).map(m => m.id)).toEqual(["old", "manual-expired"]);
    }
  });
  it("Activa excluye vencidas, y Activas vigentes excluye además las futuras", async () => {
    const { db } = database();
    expect((await getClientMemberships(user, { status: "active" }, db)).map(m => m.id)).toEqual(["renewal", "today", "future"]);
    expect((await getClientMemberships(user, { view: "active" }, db)).map(m => m.id)).toEqual(["renewal", "today"]);
    expect((await getClientMemberships(user, { view: "expiring" }, db)).map(m => m.id)).toEqual(["today"]);
  });
  it("combina filtros sin sobrescribir condiciones ni mezclar estados explícitos", async () => {
    const { db } = database();
    expect(await getClientMemberships(user, { status: "active", view: "expired" }, db)).toEqual([]);
    expect((await getClientMemberships(user, { status: "cancelled" }, db)).map(m => m.id)).toEqual(["cancelled"]);
    expect((await getClientMemberships(user, { status: "suspended" }, db)).map(m => m.id)).toEqual(["suspended"]);
  });
  it("los gimnasios vecinos vencen a su medianoche local en la misma base", async () => {
    const { db, settings } = database();
    const a = await getClientMemberships(user, {}, db);
    const b = await getClientMemberships({ ...user, tenant_id: "gym-b" }, {}, db);
    expect(a.find(m => m.id === "today")?.status).toBe("active");
    expect(b.map(m => [m.id, m.status])).toEqual([["neighbor", "expired"]]);
    expect(settings).toHaveBeenCalledWith({ where: { gym: { tenant_id: "gym-b" } }, select: { timezone: true } });
  });
  it("la edición conoce el vencimiento y conserva el estado almacenado para cambios ajenos", async () => {
    const { db } = database();
    expect(await getClientMembershipById("old", user, db)).toMatchObject({ status: "expired", stored_status: "active" });
    expect(await getClientMembershipById("neighbor", user, db)).toBeNull();
  });
  it("conserva aislamiento de sucursal, cliente, búsqueda y pago", async () => {
    const { db, findMany } = database();
    await getClientMemberships({ ...user, role: "branch_admin" }, { search: "Doris", payment_status: "paid" }, db);
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({
      tenant_id: "gym-a", branch_id: "branch-a", payment_status: "paid", client: expect.any(Object),
    }) }));
    expect(await getClientMembershipsByClientId("doris", { ...user, role: "branch_admin", location_id: "other-branch" }, db)).toEqual([]);
  });
  it("el portal y administración coinciden en el historial y conservan la renovación vigente", async () => {
    const { db } = database();
    const portal = await loadPortalMembershipSummary({ db, tenantId: "gym-a", client: { id: "doris", modality: "NORMAL" } });
    expect(portal.history.find(m => m.id === "old")?.status).toBe("expired");
    expect(portal.history.find(m => m.id === "suspended")?.status).toBe("suspended");
    expect(portal.current.map(m => m.id)).toEqual(["today", "renewal"]);
    expect(portal.upcoming.map(m => m.id)).toEqual(["future"]);
  });
  it("el reporte de activas por sucursal excluye vencidas, canceladas y futuras", async () => {
    const { db } = database();
    const report = await getActiveMembershipsByBranch({ tenantId: "gym-a" }, db);
    expect(report.summary.totalActive).toBe(2);
    expect(report.summary.totalValue).toBe(60);
    const neighbor = await getActiveMembershipsByBranch({ tenantId: "gym-b" }, db);
    expect(neighbor.summary.totalActive).toBe(0);
  });
  it("el reporte por vencer usa el mismo día local y ventana que el listado", async () => {
    const { db } = database();
    const report = await getExpiringMemberships({ tenantId: "gym-a", daysAhead: 7 }, db);
    expect(report.items.map(item => [item.membershipId, item.daysRemaining])).toEqual([["today", 0]]);
    expect(report.summary.total).toBe(1);
  });
  it("las consultas heredadas del portal también derivan la fecha desde el gimnasio del alumno", async () => {
    const { db } = database();
    const history = await getMyMemberships("doris", db);
    expect(history.find(m => m.id === "old")?.status).toBe("expired");
    expect(history.find(m => m.id === "renewal")?.status).toBe("active");
    expect(await getMyActiveMembership("doris", db)).not.toBeNull();
    expect(await getMyActiveMembership("other", db)).toBeNull();
    expect(await hasActiveMembership("other", db)).toBe(false);
  });
  it("no consulta una configuración ajena si falta el tenant", async () => {
    const { db, settings } = database();
    await expect(getMembershipToday(db, "")).rejects.toThrow("Tenant");
    expect(settings).not.toHaveBeenCalled();
  });
});
