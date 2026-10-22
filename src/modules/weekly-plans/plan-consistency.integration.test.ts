// ─────────────────────────────────────────────────────────────────
// GYM-5A §6 — consistencia de planes semanales (PostgreSQL REAL desechable).
//
// Reproduce, con las Server Actions reales, los defectos de integridad:
//   C1 plantilla de otro tenant        C2 sede inconsistente / de otro tenant
//   C3 entrenador inactivo / otra sede / otro tenant
//   C4 planes activos solapados por concurrencia
//   C5 plan creado sin sus días (creación parcial)
//   C6 cambio de entrenador sin autorización
//   C7 fechas con formato inválido      C8 asignación segmentada atómica y sin solapes
// Se escribieron ANTES de la corrección (deben fallar contra el código previo).
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async () => (await import("./testing/plan-action-mocks")).navigationMock());
vi.mock("@/lib/permissions/guards", async () => (await import("./testing/plan-action-mocks")).guardsMock());
vi.mock("@/modules/platform/runtime/require-operational-context", async () => (await import("./testing/plan-action-mocks")).operationalContextMock());

import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "@/modules/classes/booking/testing/pg-it-harness";
import { createMember, T1 } from "@/modules/classes/booking/testing/booking-fixtures";
import { FAKE_USERS, seedPlan, seedClient, seedPlanWorld, W } from "./testing/plan-it-harness";
import { formData as fd, planActionState as state, resetPlanActionState, runAction as run } from "./testing/plan-action-mocks";
import { assignTemplateSegmentedAction, createClientPlanAction, toggleClientPlanStatusAction, updateClientPlanAction } from "./actions";

describe.skipIf(!IT_ENABLED)("GYM-5A — consistencia de planes (PostgreSQL real)", () => {
  let it5: ItDatabase;
  let db: PrismaClient;

  const plansOf = (clientId: string) => db.clientWeeklyPlan.findMany({ where: { client_id: clientId }, include: { days: true } });
  const create = (o: Record<string, string>) => run(createClientPlanAction(undefined, fd(o)));

  beforeAll(async () => {
    it5 = await createItDatabase();
    db = it5.db;
    state.db = db;
    await seedPlanWorld(db);
    await db.weeklyPlanTemplateDay.createMany({
      data: [
        { template_id: W.TPL_T1, weekday: 1, session_name: "T1 lunes", duration_minutes: 60 },
        { template_id: W.TPL_T1, weekday: 3, session_name: "T1 miércoles", duration_minutes: 60 },
        { template_id: W.TPL_T2, weekday: 1, session_name: "T2 SECRETO", duration_minutes: 60 },
        { template_id: W.TPL_B2, weekday: 2, session_name: "B2 martes", duration_minutes: 60 },
        { template_id: W.TPL_BOOM, weekday: 1, session_name: "ok", duration_minutes: 60 },
        { template_id: W.TPL_BOOM, weekday: 2, session_name: "BOOM", duration_minutes: 60 },
      ],
    });
    // Falla real de BD al insertar un día "BOOM" (reproduce creación parcial sin mocks de Prisma).
    await db.$executeRawUnsafe(
      `CREATE FUNCTION it_boom() RETURNS trigger AS $$ BEGIN IF NEW.session_name = 'BOOM' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`
    );
    await db.$executeRawUnsafe(`CREATE TRIGGER it_boom_trg BEFORE INSERT ON client_weekly_plan_days FOR EACH ROW EXECUTE FUNCTION it_boom()`);
  }, 180_000);

  afterAll(async () => {
    await it5?.drop();
    await disconnectAdmin();
  });

  beforeEach(() => {
    resetPlanActionState(FAKE_USERS.sa1);
    state.db = db;
  });

  const base = (clientId: string, over: Record<string, string> = {}) => ({
    client_id: clientId,
    branch_id: W.B1,
    trainer_id: W.TR1,
    start_date: "2026-03-02",
    end_date: "2026-03-29",
    ...over,
  });

  it("C1 plantilla de otro tenant: se rechaza y no copia sus días", async () => {
    const { clientId } = await seedClient(db);
    const res = await create(base(clientId, { template_id: W.TPL_T2 }));
    expect(res).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(await plansOf(clientId)).toHaveLength(0);
    expect(await db.clientWeeklyPlanDay.count({ where: { session_name: "T2 SECRETO" } })).toBe(0);
  });

  it("C1b plantilla restringida a otra sede no se aplica a un plan de esta sede", async () => {
    const { clientId } = await seedClient(db);
    const res = await create(base(clientId, { template_id: W.TPL_B2 }));
    expect(res).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(await plansOf(clientId)).toHaveLength(0);
  });

  it("C2 sede de otro tenant o distinta de la sede del alumno: rechazada", async () => {
    const { clientId } = await seedClient(db);
    for (const branch of [W.BT2, W.B2]) {
      const res = await create(base(clientId, { branch_id: branch }));
      expect(res).toEqual(expect.objectContaining({ error: expect.any(String) }));
    }
    expect(await plansOf(clientId)).toHaveLength(0);
  });

  it("C3 entrenador inactivo, de otra sede o de otro tenant: rechazado", async () => {
    const { clientId } = await seedClient(db);
    for (const trainer of [W.TR_OFF, W.TR_B2, W.TR_T2]) {
      const res = await create(base(clientId, { trainer_id: trainer }));
      expect(res, `trainer ${trainer}`).toEqual(expect.objectContaining({ error: expect.any(String) }));
    }
    expect(await plansOf(clientId)).toHaveLength(0);
  });

  it("C4 creaciones concurrentes solapadas: queda un único plan activo", async () => {
    const { clientId } = await seedClient(db);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => create(base(clientId, { start_date: "2026-04-06", end_date: `2026-04-${20 + i}` })))
    );
    const ok = results.filter((r) => r === undefined).length; // redirect = éxito
    const plans = await plansOf(clientId);
    expect(plans).toHaveLength(1);
    expect(ok).toBe(1);
  });

  it("C5 si falla la copia de días no queda un plan huérfano", async () => {
    const { clientId } = await seedClient(db);
    await expect(create(base(clientId, { template_id: W.TPL_BOOM }))).resolves.toBeDefined();
    expect(await plansOf(clientId)).toHaveLength(0);
  });

  it("C6 el entrenador no puede reasignar el plan a otro entrenador; el admin sí, con entrenador válido", async () => {
    const { clientId } = await seedClient(db);
    await create(base(clientId));
    const plan = (await plansOf(clientId))[0];
    const upd = (user: keyof typeof FAKE_USERS, trainerId: string) => {
      resetPlanActionState(FAKE_USERS[user]);
      state.db = db;
      return run(
        updateClientPlanAction(undefined, fd({ id: plan.id, trainer_id: trainerId, start_date: "2026-03-02", end_date: "2026-03-29", status: "active" }))
      );
    };
    expect(await upd("tr1", W.TR2)).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect((await db.clientWeeklyPlan.findUniqueOrThrow({ where: { id: plan.id } })).trainer_id).toBe(W.TR1);
    // admin: entrenador de otro tenant → rechazado
    expect(await upd("sa1", W.TR_T2)).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect((await db.clientWeeklyPlan.findUniqueOrThrow({ where: { id: plan.id } })).trainer_id).toBe(W.TR1);
    // admin: entrenador válido de la sede → permitido
    expect(await upd("sa1", W.TR2)).toBeUndefined();
    expect((await db.clientWeeklyPlan.findUniqueOrThrow({ where: { id: plan.id } })).trainer_id).toBe(W.TR2);
  });

  it("C7 fechas con formato inválido devuelven error de validación (sin excepción)", async () => {
    const { clientId } = await seedClient(db);
    for (const start of ["2026-3-2", "02/03/2026", "2026-02-30", "garbage"]) {
      const res = await create(base(clientId, { start_date: start }));
      expect(res, start).toEqual(expect.objectContaining({ errors: expect.anything() }));
    }
    expect(await plansOf(clientId)).toHaveLength(0);
  });

  it("C8 segmentada: no solapa con creación concurrente y sustituye 0 planes ajenos", async () => {
    const { clientId } = await createMember(db, { id: crypto.randomUUID(), branch: W.B1 });
    const results = await Promise.all([
      create(base(clientId, { start_date: "2026-05-04", end_date: "2026-05-31" })),
      run(
        assignTemplateSegmentedAction(
          undefined,
          fd({ template_id: W.TPL_T1, branch_id: W.B1, trainer_id: W.TR1, start_date: "2026-05-04", end_date: "2026-05-31" })
        )
      ),
    ]);
    expect(results).toBeDefined();
    const active = await db.clientWeeklyPlan.count({
      where: { client_id: clientId, status: "active", start_date: { lte: new Date("2026-05-31") }, end_date: { gte: new Date("2026-05-04") } },
    });
    expect(active).toBeLessThanOrEqual(1);
  });

  it("C9 segmentada con entrenador inactivo/otra sede: rechazada", async () => {
    await createMember(db, { id: crypto.randomUUID(), branch: W.B1 });
    for (const trainer of [W.TR_OFF, W.TR_B2]) {
      const res = await run(
        assignTemplateSegmentedAction(
          undefined,
          fd({ template_id: W.TPL_T1, branch_id: W.B1, trainer_id: trainer, start_date: "2026-06-01", end_date: "2026-06-28" })
        )
      );
      expect(res, trainer).toEqual(expect.objectContaining({ error: expect.stringContaining("ntrenador") }));
    }
  });

  it("C10 el entrenador solo crea planes para sí mismo y en su sede", async () => {
    resetPlanActionState(FAKE_USERS.tr1);
    state.db = db;
    const { clientId } = await seedClient(db);
    const other = await create(base(clientId, { trainer_id: W.TR2, start_date: "2026-08-03", end_date: "2026-08-30" }));
    expect(other).toEqual(expect.objectContaining({ error: expect.any(String) }));
    const mine = await create(base(clientId, { trainer_id: W.TR1, start_date: "2026-08-03", end_date: "2026-08-30" }));
    expect(mine).toBeUndefined();
    expect((await plansOf(clientId))[0].trainer_id).toBe(W.TR1);
  });

  it("C11 reactivar un plan inactivo que solapa con otro vigente se rechaza", async () => {
    const { clientId } = await seedClient(db);
    await create(base(clientId, { start_date: "2026-10-05", end_date: "2026-10-25" }));
    const first = (await plansOf(clientId))[0];
    await run(toggleClientPlanStatusAction(fd({ id: first.id }))); // inactivo
    await create(base(clientId, { start_date: "2026-10-12", end_date: "2026-11-01" })); // nuevo vigente
    await run(toggleClientPlanStatusAction(fd({ id: first.id }))); // intento de reactivar
    const status = (await db.clientWeeklyPlan.findUniqueOrThrow({ where: { id: first.id } })).status;
    expect(status).toBe("inactive");
    expect(await db.clientWeeklyPlan.count({ where: { client_id: clientId, status: "active" } })).toBe(1);
  });

  it("control positivo: crea plan con plantilla válida, copia los días y registra tenant/sede", async () => {
    const { clientId } = await seedClient(db);
    const res = await create(base(clientId, { template_id: W.TPL_T1, start_date: "2026-07-06", end_date: "2026-07-26" }));
    expect(res).toBeUndefined();
    const plans = await plansOf(clientId);
    expect(plans).toHaveLength(1);
    expect(plans[0].tenant_id).toBe(T1);
    expect(plans[0].branch_id).toBe(W.B1);
    expect(plans[0].days.map((d) => d.weekday).sort()).toEqual([1, 3]);
  });

  it("control: seedPlan sigue funcionando junto a otros fixtures", async () => {
    const p = await seedPlan(db, { start: "2026-09-01", end: "2026-09-30" });
    expect(Object.keys(p.days)).toHaveLength(3);
  });
});
