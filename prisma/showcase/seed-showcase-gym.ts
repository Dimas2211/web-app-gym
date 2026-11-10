/**
 * prisma/showcase/seed-showcase-gym.ts
 *
 * Gimnasio de vitrina para las capturas GYM de la landing:
 * "Fuerza Total Gym" — 2 sedes, ~80 miembros, membresías con estados
 * variados y agenda semanal con reservas y asistencia.
 *
 * Se ejecuta DESPUÉS del seed demo estándar (SEED_MODE=demo) sobre una base
 * `zolvi_showcase*`: renombra el gimnasio demo a una marca verosímil, ajusta
 * precios a mercado salvadoreño y agrega volumen. Solo base local de vitrina.
 *
 * Uso: npm run showcase:setup gym
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma, type MembershipStatus, type PaymentStatus } from "@prisma/client";
import {
  assertShowcaseDatabase,
  createRandom,
  todayInElSalvador,
  addDays,
  atLocalTime,
  currentLocalHour,
  DEMO_PASSWORD,
} from "./showcase-shared";

assertShowcaseDatabase("seed-showcase-gym");

const prisma = new PrismaClient();
const R = createRandom(20261111);
const D = (n: number) => new Prisma.Decimal(n);

const GYM_NAME = "Fuerza Total Gym";
const GYM_SLUG = "fuerza-total-gym";

const PLAN_PRICES: Record<string, { price: number; description: string }> = {
  "Plan Básico": { price: 25, description: "Acceso a sala de pesas en horario regular" },
  "Plan Mensual": { price: 35, description: "Acceso completo a sala y clases grupales" },
  "Plan Trimestral": { price: 95, description: "Acceso completo por 3 meses" },
  "Plan Semestral": { price: 180, description: "Acceso completo por 6 meses" },
  "Plan Anual": { price: 330, description: "Acceso completo por 12 meses" },
  "Plan Solo Clases": { price: 28, description: "Clases grupales sin sala de pesas" },
  "Plan Virtual": { price: 15, description: "Rutinas y seguimiento en línea" },
};

const FIRST_M = ["José", "Carlos", "Luis", "Mario", "Jorge", "Ricardo", "Daniel", "Fernando", "Eduardo", "Óscar", "Rafael", "Kevin", "Alejandro", "Diego", "Javier", "Manuel", "Rodrigo", "Gerardo"];
const FIRST_F = ["María", "Ana", "Gabriela", "Karla", "Andrea", "Daniela", "Carolina", "Fátima", "Alejandra", "Paola", "Mónica", "Sofía", "Valeria", "Claudia", "Beatriz", "Lucía", "Jennifer", "Katherine"];
const LAST = ["Hernández", "Martínez", "López", "Rivas", "Flores", "Portillo", "Mejía", "Guevara", "Alvarado", "Romero", "Castillo", "Aguilar", "Menjívar", "Orellana", "Quintanilla", "Ventura", "Henríquez", "Cruz", "Rodríguez", "Ramírez", "Escobar", "Molina", "Campos", "Granados", "Arévalo", "Lemus", "Chávez", "Pineda"];

async function main() {
  console.log("\n🏋️  Showcase GYM — Fuerza Total Gym\n");

  const gym = await prisma.gym.findFirst({ orderBy: { created_at: "asc" } });
  if (!gym) throw new Error("No hay gym demo. Ejecute primero SEED_MODE=demo (npm run showcase:setup gym).");
  if (gym.slug === GYM_SLUG) {
    console.error("✗ El gimnasio de vitrina ya existe. Recree la base con: npm run showcase:setup gym");
    process.exit(1);
  }
  const T = gym.tenant_id ?? gym.id;

  // El seed demo deja filas heredadas sin tenant_id/location_id (solo
  // gym_id/branch_id). Los triggers GYM-BOOKINGS exigen tenant coherente,
  // así que en la base de vitrina se completan desde gym_id/branch_id.
  const cols = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name IN ('gym_id', 'tenant_id', 'branch_id', 'location_id')`;
  const has = (t: string, c: string) => cols.some((r) => r.table_name === t && r.column_name === c);
  for (const t of [...new Set(cols.map((c) => c.table_name))]) {
    if (has(t, "gym_id") && has(t, "tenant_id")) {
      await prisma.$executeRawUnsafe(`UPDATE "${t}" SET tenant_id = $1 WHERE gym_id = $2 AND tenant_id IS NULL`, T, gym.id);
    }
    if (has(t, "branch_id") && has(t, "location_id")) {
      await prisma.$executeRawUnsafe(`UPDATE "${t}" SET location_id = branch_id WHERE location_id IS NULL AND branch_id IS NOT NULL`);
    }
  }

  // ── Marca, sedes, organización ───────────────────────────────────
  await prisma.runtimeTenant.update({ where: { id: T }, data: { name: GYM_NAME, slug: GYM_SLUG } });
  await prisma.gym.update({
    where: { id: gym.id },
    data: { name: GYM_NAME, slug: GYM_SLUG, address: "Calle La Mascota #540, San Salvador", phone: "2264-7710", email: "hola@fuerzatotal.demo" },
  });
  await prisma.gymSettings.upsert({
    where: { gym_id: gym.id },
    update: { timezone: "America/El_Salvador" },
    create: { gym_id: gym.id, tenant_id: T, timezone: "America/El_Salvador" },
  });
  const org = await prisma.platformOrganization.findUnique({ where: { code: "gym-sv-main" } });
  if (org) {
    await prisma.platformOrganization.update({
      where: { id: org.id },
      data: { name: GYM_NAME, legal_name: "Fuerza Total, S.A. de C.V.", tenant_id: T, provisioning_status: "PROVISIONED" },
    });
  }

  const central = await prisma.branch.findFirstOrThrow({ where: { tenant_id: T }, orderBy: { created_at: "asc" } });
  await prisma.branch.update({
    where: { id: central.id },
    data: { name: "Sede San Benito", address: "Calle La Mascota #540, San Salvador", phone: "2264-7710" },
  });
  const santaElena = await prisma.branch.create({
    data: { gym_id: gym.id, tenant_id: T, name: "Sede Santa Elena", address: "Bulevar Santa Elena, Antiguo Cuscatlán", phone: "2289-3104" },
  });
  const branches = [
    { id: central.id, key: "SB", weight: 1 },
    { id: santaElena.id, key: "SE", weight: 0.75 },
  ];

  // ── Personal: nombres verosímiles + staff de la segunda sede ─────
  const renames: Record<string, { email: string; first: string; last: string }> = {
    "super@powergym.demo": { email: "direccion@fuerzatotal.demo", first: "Mónica", last: "Alvarenga" },
    "admin@sucursal1.demo": { email: "admin.sanbenito@fuerzatotal.demo", first: "María", last: "González" },
    "recepcion@sucursal1.demo": { email: "recepcion.sanbenito@fuerzatotal.demo", first: "Luis", last: "Pérez" },
    "trainer@sucursal1.demo": { email: "entrenador@fuerzatotal.demo", first: "Ana", last: "Martínez" },
    "cliente@powergym.demo": { email: "roberto.sanchez@fuerzatotal.demo", first: "Roberto", last: "Sánchez" },
    "cliente_natacion@powergym.demo": { email: "sofia.ruiz@fuerzatotal.demo", first: "Sofía", last: "Ruiz" },
  };
  for (const [oldEmail, n] of Object.entries(renames)) {
    await prisma.user.updateMany({ where: { tenant_id: T, email: oldEmail }, data: { email: n.email, first_name: n.first, last_name: n.last } });
  }
  await prisma.client.updateMany({ where: { tenant_id: T, email: "cliente@powergym.demo" }, data: { email: "roberto.sanchez@fuerzatotal.demo" } });
  await prisma.client.updateMany({ where: { tenant_id: T, email: "cliente_natacion@powergym.demo" }, data: { email: "sofia.ruiz@fuerzatotal.demo" } });
  await prisma.client.updateMany({ where: { tenant_id: T, email: { endsWith: "@demo.gym" } }, data: { email: null } });

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of [
    { email: "admin.santaelena@fuerzatotal.demo", first: "Ernesto", last: "Calderón", role: "branch_admin" as const },
    { email: "recepcion.santaelena@fuerzatotal.demo", first: "Fátima", last: "Rosales", role: "reception" as const },
  ]) {
    await prisma.user.create({
      data: { gym_id: gym.id, tenant_id: T, branch_id: santaElena.id, location_id: santaElena.id, email: u.email, password_hash: hash, first_name: u.first, last_name: u.last, role: u.role },
    });
  }
  const staff = await prisma.user.findFirstOrThrow({ where: { tenant_id: T, role: "reception", branch_id: central.id } });

  const trainerRenames: Record<string, { last: string; specialty: string }> = {
    Fitness: { last: "Menéndez", specialty: "Spinning y HIIT" },
    Trainer: { last: "Cáceres", specialty: "Yoga y movilidad" },
    BoxFit: { last: "Ayala", specialty: "Boxeo fitness" },
  };
  for (const [oldLast, n] of Object.entries(trainerRenames)) {
    await prisma.trainer.updateMany({ where: { tenant_id: T, last_name: oldLast }, data: { last_name: n.last, specialty: n.specialty, email: null } });
  }
  for (const t of [
    { first: "Paola", last: "Escobar", specialty: "Entrenamiento funcional" },
    { first: "Kevin", last: "Molina", specialty: "Musculación y fuerza" },
  ]) {
    await prisma.trainer.create({ data: { gym_id: gym.id, tenant_id: T, branch_id: santaElena.id, location_id: santaElena.id, first_name: t.first, last_name: t.last, specialty: t.specialty } });
  }
  const trainers = await prisma.trainer.findMany({ where: { tenant_id: T }, select: { id: true, branch_id: true, specialty: true } });
  const trainersOf = (branchId: string) => trainers.filter((t) => t.branch_id === branchId);

  // ── Planes: precios de mercado local ─────────────────────────────
  for (const [name, p] of Object.entries(PLAN_PRICES)) {
    await prisma.membershipPlan.updateMany({ where: { gym_id: gym.id, name }, data: { price: D(p.price), description: p.description } });
  }
  const plans = await prisma.membershipPlan.findMany({ where: { gym_id: gym.id, status: "active" } });
  const planWeights = plans.map((p) => ({
    value: p,
    weight: ({ "Plan Mensual": 10, "Plan Básico": 6, "Plan Trimestral": 5, "Plan Semestral": 2, "Plan Anual": 1.5, "Plan Solo Clases": 3, "Plan Virtual": 1 } as Record<string, number>)[p.name] ?? 1,
  }));

  // ── Tipos de clase ───────────────────────────────────────────────
  for (const ct of [
    { name: "Entrenamiento funcional", d: 45, c: 16 },
    { name: "Boxeo fitness", d: 50, c: 14 },
    { name: "Zumba", d: 50, c: 25 },
  ]) {
    await prisma.classType.create({ data: { gym_id: gym.id, tenant_id: T, name: ct.name, default_duration_minutes: ct.d, capacity_default: ct.c } });
  }
  const types = Object.fromEntries((await prisma.classType.findMany({ where: { gym_id: gym.id } })).map((t) => [t.name, t]));

  // ── Miembros + membresías ────────────────────────────────────────
  const today = todayInElSalvador();
  const existingClients = await prisma.client.findMany({ where: { tenant_id: T }, select: { id: true, branch_id: true } });
  await prisma.clientMembership.deleteMany({ where: { gym_id: gym.id } }); // reemplaza las 2 del seed demo

  type Member = { id: string; branch_id: string; membershipId?: string; active: boolean };
  const members: Member[] = existingClients.map((c) => ({ id: c.id, branch_id: c.branch_id, active: true }));
  const clientRows: Prisma.ClientCreateManyInput[] = [];
  let code = 1100;
  for (let i = 0; i < 72; i++) {
    const female = R.chance(0.48);
    const br = R.weighted(branches.map((b) => ({ value: b, weight: b.weight })));
    const id = randomUUID();
    const first = R.pick(female ? FIRST_F : FIRST_M);
    const last = `${R.pick(LAST)} ${R.pick(LAST)}`;
    const createdAt = atLocalTime(addDays(today, -R.int(5, 300)), R.int(7, 19));
    clientRows.push({
      id, gym_id: gym.id, tenant_id: T, branch_id: br.id, location_id: br.id,
      first_name: first, last_name: last, gender: female ? "female" : "male",
      birth_date: new Date(Date.UTC(R.int(1972, 2006), R.int(0, 11), R.int(1, 28))),
      phone: `7${R.int(0, 9)}${R.int(10, 99)}-${R.int(1000, 9999)}`,
      operational_code: `C${code++}`, created_at: createdAt, updated_at: createdAt,
    });
    members.push({ id, branch_id: br.id, active: true });
  }
  await prisma.client.createMany({ data: clientRows });

  const memberships: Prisma.ClientMembershipCreateManyInput[] = [];
  for (const [idx, m] of members.entries()) {
    // Los dos clientes con portal (primeros del seed demo) siempre activos y al día.
    const forceActive = idx < 2;
    const plan = forceActive ? plans.find((p) => p.name === "Plan Trimestral")! : R.weighted(planWeights);
    const roll = R.rand();
    // ~72 % activas, ~10 % vencen en ≤7 días, ~18 % vencidas.
    let start: Date;
    if (forceActive) start = addDays(today, -35);
    else if (roll < 0.72) start = addDays(today, -R.int(0, Math.max(1, plan.duration_days - 8)));
    else if (roll < 0.82) start = addDays(today, -(plan.duration_days - R.int(1, 7)));
    else start = addDays(today, -(plan.duration_days + R.int(3, 45)));
    const end = addDays(start, plan.duration_days);
    const expired = end.getTime() < today.getTime();
    const status: MembershipStatus = expired ? "expired" : "active";
    const pay: PaymentStatus = forceActive ? "paid" : expired ? (R.chance(0.3) ? "overdue" : "paid") : R.weighted([{ value: "paid" as const, weight: 88 }, { value: "pending" as const, weight: 8 }, { value: "partial" as const, weight: 4 }]);
    const discount = R.chance(0.15) ? Math.round(Number(plan.price) * 0.1) : 0;
    const id = randomUUID();
    m.membershipId = id;
    m.active = !expired && plan.name !== "Plan Virtual";
    memberships.push({
      id, gym_id: gym.id, tenant_id: T, branch_id: m.branch_id, location_id: m.branch_id, client_id: m.id,
      membership_plan_id: plan.id, start_date: start, end_date: end,
      price_at_sale: plan.price, discount_amount: D(discount), final_amount: D(Number(plan.price) - discount),
      payment_status: pay, status, sold_by_user_id: staff.id,
      created_at: atLocalTime(start, R.int(7, 19)), updated_at: atLocalTime(start, R.int(7, 19)),
    });
  }
  await prisma.clientMembership.createMany({ data: memberships });

  // ── Agenda: 3 semanas atrás + semana actual + próxima ────────────
  // Reemplaza las 8 clases del seed demo (y sus dependientes).
  const ofGym = { scheduled_class: { gym_id: gym.id } };
  await prisma.classBookingEvent.deleteMany({ where: { booking: ofGym } });
  await prisma.classAttendance.deleteMany({ where: ofGym });
  await prisma.classBooking.deleteMany({ where: ofGym });
  await prisma.scheduledClassActivity.deleteMany({ where: ofGym });
  await prisma.scheduledClass.deleteMany({ where: { gym_id: gym.id } });

  const SLOTS: { time: string; dur: number; type: string; title: string; days: number[]; room: string }[] = [
    { time: "06:00", dur: 45, type: "Spinning", title: "Spinning amanecer", days: [1, 3, 5], room: "Sala de ciclismo" },
    { time: "07:00", dur: 60, type: "Yoga", title: "Yoga matutino", days: [2, 4, 6], room: "Estudio 2" },
    { time: "12:15", dur: 45, type: "Entrenamiento funcional", title: "Funcional exprés", days: [1, 2, 3, 4, 5], room: "Área funcional" },
    { time: "17:30", dur: 45, type: "Spinning", title: "Spinning power", days: [1, 2, 3, 4, 5], room: "Sala de ciclismo" },
    { time: "18:30", dur: 50, type: "Boxeo fitness", title: "Boxeo fitness", days: [1, 3, 5], room: "Estudio 1" },
    { time: "18:30", dur: 50, type: "Zumba", title: "Zumba", days: [2, 4], room: "Estudio 1" },
    { time: "19:30", dur: 60, type: "Yoga", title: "Yoga nocturno", days: [1, 3], room: "Estudio 2" },
    { time: "08:00", dur: 60, type: "Musculación guiada", title: "Musculación guiada", days: [6], room: "Sala de pesas" },
  ];
  const trainerFor = (branchId: string, type: string) => {
    const pool = trainersOf(branchId);
    const kw: Record<string, string> = { Spinning: "Spinning", Yoga: "Yoga", "Entrenamiento funcional": "funcional", "Boxeo fitness": "Boxeo", Zumba: "HIIT", "Musculación guiada": "Musculación" };
    return (pool.find((t) => t.specialty?.toLowerCase().includes(kw[type].toLowerCase())) ?? pool[0] ?? trainers[0]).id;
  };
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const nowMin = currentLocalHour() * 60;

  const dow = today.getUTCDay() === 0 ? 7 : today.getUTCDay();
  const monday = addDays(today, -(dow - 1));
  const classes: Prisma.ScheduledClassCreateManyInput[] = [];
  const bookings: Prisma.ClassBookingCreateManyInput[] = [];
  const attendance: Prisma.ClassAttendanceCreateManyInput[] = [];

  for (let d = addDays(monday, -21); d.getTime() <= addDays(monday, 13).getTime(); d = addDays(d, 1)) {
    const wd = d.getUTCDay();
    if (wd === 0) continue;
    for (const br of branches) {
      for (const s of SLOTS) {
        if (!s.days.includes(wd)) continue;
        if (br.key === "SE" && (s.time === "06:00" || s.title === "Yoga nocturno")) continue; // sede más pequeña
        const type = types[s.type];
        const capacity = type.capacity_default ?? 15;
        const startMin = toMin(s.time);
        const past = d.getTime() < today.getTime() || (d.getTime() === today.getTime() && startMin + s.dur < nowMin);
        const id = randomUUID();
        const popularity = s.time >= "17:00" ? 0.85 : s.time === "12:15" ? 0.6 : 0.5;
        const pool = members.filter((m) => m.active && m.branch_id === br.id);
        const n = Math.min(capacity, pool.length, Math.round(capacity * popularity * (0.7 + R.rand() * 0.4) * br.weight));
        const chosen = new Set<string>();
        while (chosen.size < n) chosen.add(R.pick(pool).id);
        // El cliente del portal (Roberto) reserva Spinning power y Funcional en su sede.
        const roberto = members[0];
        if (br.id === roberto.branch_id && (s.title === "Spinning power" || s.title === "Funcional exprés") && wd % 2 === 1) chosen.add(roberto.id);
        const booked = [...chosen].slice(0, capacity);

        classes.push({
          id, gym_id: gym.id, tenant_id: T, branch_id: br.id, location_id: br.id,
          class_type_id: type.id, trainer_id: trainerFor(br.id, s.type), title: s.title, class_date: d,
          start_time: s.time, end_time: fmt(startMin + s.dur), capacity, room_name: s.room,
          status: past ? "completed" : "scheduled", session_kind: "OPEN",
          starts_at: atLocalTime(d, 0, startMin), ends_at: atLocalTime(d, 0, startMin + s.dur),
          booked_count: 0, // lo mantiene el trigger gym_class_bookings_counters_trg
          completed_at: past ? atLocalTime(d, 0, startMin + s.dur) : null,
          created_by: staff.id,
        });
        for (const cid of booked) {
          const bid = randomUUID();
          const bookedAt = atLocalTime(addDays(d, -R.int(0, 3)), R.int(7, 21));
          bookings.push({
            id: bid, scheduled_class_id: id, client_id: cid, tenant_id: T, booking_status: "confirmed",
            channel: R.chance(0.7) ? "PORTAL" : "STAFF", booked_at: bookedAt, created_at: bookedAt, updated_at: bookedAt,
            client_membership_id: members.find((m) => m.id === cid)?.membershipId,
          });
          if (past) {
            const st = R.weighted([{ value: "attended" as const, weight: 86 }, { value: "late" as const, weight: 5 }, { value: "absent" as const, weight: 9 }]);
            attendance.push({
              id: randomUUID(), scheduled_class_id: id, client_id: cid, tenant_id: T, booking_id: bid,
              attendance_status: st, checked_in_at: st === "absent" ? null : atLocalTime(d, 0, startMin - R.int(0, 10)),
              recorded_by_user_id: staff.id, recorded_at: atLocalTime(d, 0, startMin + s.dur),
            });
          }
        }
      }
    }
  }
  await prisma.scheduledClass.createMany({ data: classes });
  for (let i = 0; i < bookings.length; i += 1000) await prisma.classBooking.createMany({ data: bookings.slice(i, i + 1000) });
  for (let i = 0; i < attendance.length; i += 1000) await prisma.classAttendance.createMany({ data: attendance.slice(i, i + 1000) });

  const active = memberships.filter((m) => m.status === "active").length;
  console.log(`  ✓ miembros ${members.length} (membresías activas ${active})`);
  console.log(`  ✓ clases ${classes.length}, reservas ${bookings.length}, asistencias ${attendance.length}`);
  console.log(`\n  ✅ ${GYM_NAME} listo`);
  console.log(`     Login staff:  direccion@fuerzatotal.demo / ${DEMO_PASSWORD}`);
  console.log(`     Login portal: roberto.sanchez@fuerzatotal.demo / ${DEMO_PASSWORD}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
