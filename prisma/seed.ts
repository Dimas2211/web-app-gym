/**
 * Seed inicial del Sistema GYM
 *
 * Crea: gym demo, branch demo, usuarios por rol, metas, deportes y planes de membresía.
 * Es idempotente: puede ejecutarse múltiples veces sin duplicar datos.
 *
 * Comando: npx prisma db seed
 */

import "dotenv/config";
import { PrismaClient, type UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ============================================================
// DATOS DE SEED
// ============================================================

const DEMO_PASSWORD = "Demo1234!";

const GOALS = [
  {
    name: "Pérdida de peso",
    description: "Reducción de grasa corporal y control del peso mediante déficit calórico y ejercicio",
  },
  {
    name: "Hipertrofia muscular",
    description: "Aumento de masa muscular y volumen a través de entrenamiento progresivo",
  },
  {
    name: "Ganancia de fuerza",
    description: "Incremento de fuerza máxima y potencia en los patrones de movimiento principales",
  },
  {
    name: "Resistencia cardiovascular",
    description: "Mejora de la capacidad aeróbica, eficiencia cardíaca y resistencia sostenida",
  },
  {
    name: "Rehabilitación física",
    description: "Recuperación funcional tras lesiones, cirugías o condiciones médicas específicas",
  },
  {
    name: "Mantenimiento",
    description: "Conservar la condición física, composición corporal y hábitos de actividad actuales",
  },
  {
    name: "Rendimiento deportivo",
    description: "Optimización del desempeño físico orientado a un deporte o competencia específica",
  },
];

const SPORTS = [
  {
    name: "Fútbol",
    description: "Entrenamiento físico y técnico orientado al fútbol: velocidad, resistencia y coordinación",
  },
  {
    name: "Musculación",
    description: "Entrenamiento con pesas libres y máquinas de resistencia para desarrollo muscular",
  },
  {
    name: "Cardio",
    description: "Cinta de correr, elíptica, remo y ciclismo estático para acondicionamiento aeróbico",
  },
  {
    name: "CrossFit",
    description: "Entrenamiento funcional de alta intensidad con movimientos variados y cronometrados",
  },
  {
    name: "Yoga",
    description: "Disciplina física y mental que integra posturas, respiración y meditación",
  },
  {
    name: "Pilates",
    description: "Método de fortalecimiento del core, flexibilidad y control postural",
  },
  {
    name: "Spinning",
    description: "Ciclismo indoor en grupo con ritmo musical e intervalos de intensidad variable",
  },
  {
    name: "Boxeo",
    description: "Entrenamiento de técnica, velocidad y acondicionamiento físico con guantes y saco",
  },
  {
    name: "Natación",
    description: "Actividad acuática completa, de bajo impacto articular y alto gasto calórico",
  },
  {
    name: "Artes marciales mixtas (MMA)",
    description: "Combate integral que combina técnicas de pie y grappling en suelo",
  },
  {
    name: "Entrenamiento funcional",
    description: "Movimientos multiarticulares orientados a mejorar la funcionalidad en la vida cotidiana",
  },
  {
    name: "Zumba",
    description: "Clase aeróbica de baile con ritmos latinos que combina cardio y coordinación",
  },
  {
    name: "Atletismo",
    description: "Velocidad, saltos y lanzamientos en pista y campo para todas las edades",
  },
  {
    name: "Gimnasia artística",
    description: "Ejercicios en aparatos olímpicos y suelo con alto componente técnico y acrobático",
  },
  {
    name: "Escalada deportiva",
    description: "Trepa en rocódromo enfocada en fuerza de agarre, técnica de pies y resistencia",
  },
];

const MEMBERSHIP_PLANS = [
  {
    name: "Plan Básico",
    description: "Acceso a zona de musculación y cardio en horario reducido (6am–10am / 8pm–10pm)",
    duration_days: 30,
    price: "199.00",
    access_type: "limited" as const,
    is_recurring: false,
  },
  {
    name: "Plan Mensual",
    description: "Acceso completo a todas las instalaciones en cualquier horario",
    duration_days: 30,
    price: "349.00",
    access_type: "full" as const,
    is_recurring: true,
  },
  {
    name: "Plan Trimestral",
    description: "Acceso completo por 3 meses. Ahorra $148 frente al mensual",
    duration_days: 90,
    price: "899.00",
    access_type: "full" as const,
    is_recurring: true,
  },
  {
    name: "Plan Semestral",
    description: "Acceso completo por 6 meses. Ahorra $495 frente al mensual",
    duration_days: 180,
    price: "1599.00",
    access_type: "full" as const,
    is_recurring: false,
  },
  {
    name: "Plan Anual",
    description: "Acceso completo por 12 meses. Mejor precio por día, ahorra $1389 frente al mensual",
    duration_days: 365,
    price: "2799.00",
    access_type: "full" as const,
    is_recurring: false,
  },
  {
    name: "Plan Solo Clases",
    description: "Acceso exclusivo a clases grupales (yoga, pilates, spinning, zumba, etc.) sin zona libre",
    duration_days: 30,
    price: "249.00",
    access_type: "classes_only" as const,
    is_recurring: true,
  },
  {
    name: "Plan Virtual",
    description: "Clases en línea en vivo y on-demand más seguimiento remoto de entrenamiento personalizado",
    duration_days: 30,
    price: "149.00",
    access_type: "virtual_only" as const,
    is_recurring: true,
  },
];

// ============================================================
// SEED PRINCIPAL
// ============================================================

async function main() {
  console.log("🌱 Iniciando seed del Sistema GYM...\n");

  // ----------------------------------------------------------
  // 1. GYM DEMO
  // ----------------------------------------------------------
  const gym = await prisma.gym.upsert({
    where: { slug: "power-gym-demo" },
    update: {},
    create: {
      name: "Power Gym",
      slug: "power-gym-demo",
      status: "active",
    },
  });
  console.log(`✅ Gym: ${gym.name} (id: ${gym.id})`);

  // ----------------------------------------------------------
  // 2. BRANCH DEMO
  // ----------------------------------------------------------
  let branch = await prisma.branch.findFirst({
    where: { gym_id: gym.id, name: "Sucursal Central" },
  });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        gym_id: gym.id,
        name: "Sucursal Central",
        address: "Av. Principal 123, Centro",
        phone: "+1 555-0100",
        status: "active",
      },
    });
  }
  console.log(`✅ Branch: ${branch.name} (id: ${branch.id})\n`);

  // ----------------------------------------------------------
  // 3. USUARIOS DEMO (uno por rol)
  // ----------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const usersDemo: Array<{
    email: string;
    first_name: string;
    last_name: string;
    role: UserRole;
    branch_id: string | null;
  }> = [
    {
      email: "super@powergym.demo",
      first_name: "Carlos",
      last_name: "Superadmin",
      role: "super_admin",
      branch_id: null, // super_admin no está limitado a una sucursal
    },
    {
      email: "admin@sucursal1.demo",
      first_name: "María",
      last_name: "González",
      role: "branch_admin",
      branch_id: branch.id,
    },
    {
      email: "recepcion@sucursal1.demo",
      first_name: "Luis",
      last_name: "Pérez",
      role: "reception",
      branch_id: branch.id,
    },
    {
      email: "trainer@sucursal1.demo",
      first_name: "Ana",
      last_name: "Martínez",
      role: "trainer",
      branch_id: branch.id,
    },
    {
      email: "cliente@powergym.demo",
      first_name: "Roberto",
      last_name: "Sánchez",
      role: "client",
      branch_id: branch.id,
    },
  ];

  for (const userData of usersDemo) {
    await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        gym_id: gym.id,
        branch_id: userData.branch_id,
        email: userData.email,
        password_hash: passwordHash,
        first_name: userData.first_name,
        last_name: userData.last_name,
        role: userData.role,
        status: "active",
      },
    });
    console.log(`✅ Usuario [${userData.role.padEnd(12)}]: ${userData.email}`);
  }

  // ----------------------------------------------------------
  // 4. GOALS (metas de entrenamiento)
  // ----------------------------------------------------------
  console.log("");
  for (const goal of GOALS) {
    await prisma.goal.upsert({
      where: { name: goal.name },
      update: {},
      create: { ...goal, status: "active" },
    });
    console.log(`✅ Meta: ${goal.name}`);
  }

  // ----------------------------------------------------------
  // 5. SPORTS (deportes)
  // ----------------------------------------------------------
  console.log("");
  for (const sport of SPORTS) {
    await prisma.sport.upsert({
      where: { name: sport.name },
      update: {},
      create: { ...sport, status: "active" },
    });
    console.log(`✅ Deporte: ${sport.name}`);
  }

  // ----------------------------------------------------------
  // 6. MEMBERSHIP PLANS (planes del gym demo)
  // ----------------------------------------------------------
  console.log("");
  for (const plan of MEMBERSHIP_PLANS) {
    const existing = await prisma.membershipPlan.findFirst({
      where: { gym_id: gym.id, name: plan.name },
    });
    if (!existing) {
      await prisma.membershipPlan.create({
        data: { gym_id: gym.id, status: "active", ...plan },
      });
    }
    console.log(`✅ Plan: ${plan.name.padEnd(20)} $${plan.price.padStart(8)} / ${plan.duration_days}d  [${plan.access_type}]`);
  }

  // ----------------------------------------------------------
  // 7. PERFIL DE ENTRENADOR (vinculado al usuario trainer)
  // ----------------------------------------------------------
  const trainerUser = await prisma.user.findUnique({
    where: { email: "trainer@sucursal1.demo" },
  });
  let trainerProfile = null;
  if (trainerUser) {
    trainerProfile = await prisma.trainer.findUnique({
      where: { user_id: trainerUser.id },
    });
    if (!trainerProfile) {
      trainerProfile = await prisma.trainer.create({
        data: {
          gym_id: gym.id,
          branch_id: branch.id,
          user_id: trainerUser.id,
          first_name: trainerUser.first_name,
          last_name: trainerUser.last_name,
          email: trainerUser.email,
          specialty: "Musculación y entrenamiento funcional",
          status: "active",
        },
      });
    }
    console.log(`\n✅ Trainer profile: ${trainerProfile.first_name} ${trainerProfile.last_name}`);
  }

  // ----------------------------------------------------------
  // 8. REGISTRO CLIENT vinculado al usuario client (user_id)
  // ----------------------------------------------------------
  const clientUser = await prisma.user.findUnique({
    where: { email: "cliente@powergym.demo" },
  });
  let clientRecord = null;
  if (clientUser) {
    clientRecord = await prisma.client.findUnique({
      where: { user_id: clientUser.id },
    });
    if (!clientRecord) {
      const musculation = await prisma.sport.findFirst({ where: { name: "Musculación" } });
      const hipertrofia = await prisma.goal.findFirst({ where: { name: "Hipertrofia muscular" } });
      clientRecord = await prisma.client.create({
        data: {
          gym_id: gym.id,
          branch_id: branch.id,
          user_id: clientUser.id,
          first_name: clientUser.first_name,
          last_name: clientUser.last_name,
          email: clientUser.email,
          phone: "+1 555-0199",
          sport_id: musculation?.id ?? null,
          goal_id: hipertrofia?.id ?? null,
          assigned_trainer_id: trainerUser?.id ?? null,
          status: "active",
        },
      });
    }
    console.log(`✅ Client record: ${clientRecord.first_name} ${clientRecord.last_name} (user_id vinculado)`);
  }

  // ----------------------------------------------------------
  // 9. TIPOS DE CLASE demo
  // ----------------------------------------------------------
  const classTypeNames = [
    { name: "Spinning", code: "SPIN", duration: 45, capacity: 20 },
    { name: "Yoga", code: "YOGA", duration: 60, capacity: 15 },
    { name: "Musculación guiada", code: "MUSC", duration: 60, capacity: 10 },
  ];
  const classTypeMap: Record<string, string> = {};
  console.log("");
  for (const ct of classTypeNames) {
    let classType = await prisma.classType.findFirst({
      where: { gym_id: gym.id, name: ct.name },
    });
    if (!classType) {
      classType = await prisma.classType.create({
        data: {
          gym_id: gym.id,
          code: ct.code,
          name: ct.name,
          default_duration_minutes: ct.duration,
          capacity_default: ct.capacity,
          status: "active",
        },
      });
    }
    classTypeMap[ct.name] = classType.id;
    console.log(`✅ ClassType: ${ct.name}`);
  }

  // ----------------------------------------------------------
  // 10. MEMBRESÍA ACTIVA para el cliente demo
  // ----------------------------------------------------------
  if (clientRecord) {
    const today = new Date();
    const membershipStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const membershipEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const monthlyPlan = await prisma.membershipPlan.findFirst({
      where: { gym_id: gym.id, name: "Plan Mensual" },
    });
    if (monthlyPlan) {
      const existingMembership = await prisma.clientMembership.findFirst({
        where: {
          client_id: clientRecord.id,
          status: "active",
          start_date: membershipStart,
        },
      });
      if (!existingMembership) {
        await prisma.clientMembership.create({
          data: {
            gym_id: gym.id,
            branch_id: branch.id,
            client_id: clientRecord.id,
            membership_plan_id: monthlyPlan.id,
            start_date: membershipStart,
            end_date: membershipEnd,
            price_at_sale: monthlyPlan.price,
            discount_amount: "0.00",
            final_amount: monthlyPlan.price,
            payment_status: "paid",
            status: "active",
          },
        });
        console.log(`\n✅ Membresía activa creada: Plan Mensual (${membershipStart.toDateString()} – ${membershipEnd.toDateString()})`);
      } else {
        console.log(`\n✅ Membresía activa ya existe para el cliente demo`);
      }
    }
  }

  // ----------------------------------------------------------
  // 11. PLANTILLA DE PLAN SEMANAL demo
  // ----------------------------------------------------------
  let planTemplate = await prisma.weeklyPlanTemplate.findFirst({
    where: { gym_id: gym.id, name: "Plan Hipertrofia Básico" },
  });
  if (!planTemplate) {
    const musculacion = await prisma.sport.findFirst({ where: { name: "Musculación" } });
    const hipertrofia = await prisma.goal.findFirst({ where: { name: "Hipertrofia muscular" } });
    const adminUser = await prisma.user.findUnique({ where: { email: "admin@sucursal1.demo" } });
    planTemplate = await prisma.weeklyPlanTemplate.create({
      data: {
        gym_id: gym.id,
        branch_id: branch.id,
        name: "Plan Hipertrofia Básico",
        target_level: "beginner",
        target_sport_id: musculacion?.id ?? null,
        target_goal_id: hipertrofia?.id ?? null,
        description: "Plan semanal para principiantes enfocado en hipertrofia muscular",
        status: "active",
        created_by: adminUser?.id ?? null,
        days: {
          create: [
            { weekday: 1, session_name: "Pecho y tríceps", focus_area: "Empuje superior", duration_minutes: 60, exercise_block: "Press banca: 4x10\nAperturas: 3x12\nDips: 3x10\nExtensiones tríceps: 4x12" },
            { weekday: 2, session_name: "Espalda y bíceps", focus_area: "Jalón superior", duration_minutes: 60, exercise_block: "Dominadas: 3x8\nRemo con barra: 4x10\nJalón al pecho: 3x12\nCurl bíceps: 4x12" },
            { weekday: 3, session_name: "Descanso activo", focus_area: "Recuperación", duration_minutes: 30, exercise_block: "Caminata 20 min\nEstiramientos 10 min" },
            { weekday: 4, session_name: "Piernas", focus_area: "Tren inferior", duration_minutes: 70, exercise_block: "Sentadilla: 4x10\nPrensa: 4x12\nZancadas: 3x12\nElevaciones gemelos: 4x15" },
            { weekday: 5, session_name: "Hombros y abdomen", focus_area: "Core y deltoides", duration_minutes: 55, exercise_block: "Press militar: 4x10\nElevaciones laterales: 3x15\nPlancha: 4x45s\nCrunches: 3x20" },
          ],
        },
      },
    });
    console.log(`\n✅ WeeklyPlanTemplate: ${planTemplate.name}`);
  }

  // ----------------------------------------------------------
  // 12. PLAN SEMANAL asignado al cliente demo
  // ----------------------------------------------------------
  if (clientRecord && planTemplate) {
    const today = new Date();
    // Semana actual: lunes a domingo
    const dayOfWeek = today.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysFromMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const existingPlan = await prisma.clientWeeklyPlan.findFirst({
      where: {
        client_id: clientRecord.id,
        status: "active",
        start_date: monday,
      },
    });
    if (!existingPlan && trainerProfile) {
      const newPlan = await prisma.clientWeeklyPlan.create({
        data: {
          gym_id: gym.id,
          branch_id: branch.id,
          client_id: clientRecord.id,
          template_id: planTemplate.id,
          trainer_id: trainerProfile.id,
          start_date: monday,
          end_date: sunday,
          status: "active",
        },
      });
      // Copiar los días de la plantilla al plan del cliente
      const templateDays = await prisma.weeklyPlanTemplateDay.findMany({
        where: { template_id: planTemplate.id },
      });
      for (const tDay of templateDays) {
        await prisma.clientWeeklyPlanDay.create({
          data: {
            client_weekly_plan_id: newPlan.id,
            weekday: tDay.weekday,
            session_name: tDay.session_name,
            focus_area: tDay.focus_area,
            duration_minutes: tDay.duration_minutes,
            exercise_block: tDay.exercise_block,
            trainer_feedback: tDay.trainer_notes,
            execution_status: "pending",
          },
        });
      }
      console.log(`✅ ClientWeeklyPlan creado: ${monday.toDateString()} – ${sunday.toDateString()}`);
    } else {
      console.log(`✅ ClientWeeklyPlan ya existe para esta semana`);
    }
  }

  // ----------------------------------------------------------
  // 13. CLASES PROGRAMADAS demo (próximos días)
  // ----------------------------------------------------------
  if (trainerProfile && classTypeMap["Spinning"]) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const demoClasses = [
      { daysFromNow: 1, name: "Spinning matutino", typeKey: "Spinning", start: "08:00", end: "08:45", capacity: 20 },
      { daysFromNow: 2, name: "Yoga restaurativo", typeKey: "Yoga", start: "10:00", end: "11:00", capacity: 15 },
      { daysFromNow: 3, name: "Spinning nocturno", typeKey: "Spinning", start: "19:00", end: "19:45", capacity: 20 },
      { daysFromNow: 4, name: "Musculación guiada", typeKey: "Musculación guiada", start: "07:00", end: "08:00", capacity: 10 },
      { daysFromNow: 5, name: "Yoga restaurativo", typeKey: "Yoga", start: "10:00", end: "11:00", capacity: 15 },
    ];

    console.log("");
    for (const dc of demoClasses) {
      const classDate = new Date(today);
      classDate.setDate(today.getDate() + dc.daysFromNow);

      const exists = await prisma.scheduledClass.findFirst({
        where: {
          branch_id: branch.id,
          trainer_id: trainerProfile.id,
          class_date: classDate,
          start_time: dc.start,
          title: dc.name,
        },
      });
      if (!exists) {
        await prisma.scheduledClass.create({
          data: {
            gym_id: gym.id,
            branch_id: branch.id,
            class_type_id: classTypeMap[dc.typeKey],
            trainer_id: trainerProfile.id,
            title: dc.name,
            class_date: classDate,
            start_time: dc.start,
            end_time: dc.end,
            capacity: dc.capacity,
            status: "scheduled",
          },
        });
        console.log(`✅ Clase: ${dc.name} (${classDate.toDateString()} ${dc.start})`);
      } else {
        console.log(`✅ Clase ya existe: ${dc.name} (${classDate.toDateString()})`);
      }
    }
  }

  // ----------------------------------------------------------
  // 14. RESERVA demo para el cliente en la primera clase
  // ----------------------------------------------------------
  if (clientRecord) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const firstClass = await prisma.scheduledClass.findFirst({
      where: { branch_id: branch.id, class_date: tomorrow },
      orderBy: { start_time: "asc" },
    });
    if (firstClass) {
      const existingBooking = await prisma.classBooking.findUnique({
        where: {
          scheduled_class_id_client_id: {
            scheduled_class_id: firstClass.id,
            client_id: clientRecord.id,
          },
        },
      });
      if (!existingBooking) {
        await prisma.classBooking.create({
          data: {
            scheduled_class_id: firstClass.id,
            client_id: clientRecord.id,
            booking_status: "confirmed",
          },
        });
        console.log(`\n✅ Reserva demo creada: ${firstClass.title}`);
      } else {
        console.log(`\n✅ Reserva demo ya existe`);
      }
    }
  }

  // ----------------------------------------------------------
  // 15. ENTRENADORES GENÉRICOS (sin cuenta de usuario)
  // ----------------------------------------------------------
  const extraTrainers = [
    { first_name: "Carlos", last_name: "Fitness", specialty: "Cardio y CrossFit" },
    { first_name: "Laura",  last_name: "Trainer", specialty: "Natación y Acuático" },
    { first_name: "Miguel", last_name: "BoxFit",  specialty: "Boxeo y Artes Marciales" },
  ];
  console.log("");
  for (const t of extraTrainers) {
    const existing = await prisma.trainer.findFirst({
      where: { gym_id: gym.id, first_name: t.first_name, last_name: t.last_name },
    });
    if (!existing) {
      await prisma.trainer.create({
        data: {
          gym_id: gym.id,
          branch_id: branch.id,
          first_name: t.first_name,
          last_name: t.last_name,
          specialty: t.specialty,
          status: "active",
        },
      });
    }
    console.log(`✅ Trainer extra: ${t.first_name} ${t.last_name}`);
  }

  // ----------------------------------------------------------
  // 16. USUARIO CLIENTE EXTRA (para prueba de portal con solo programación general)
  // ----------------------------------------------------------
  const natacionUser = await prisma.user.upsert({
    where: { email: "cliente_natacion@powergym.demo" },
    update: {},
    create: {
      gym_id: gym.id,
      branch_id: branch.id,
      email: "cliente_natacion@powergym.demo",
      password_hash: passwordHash,
      first_name: "Sofía",
      last_name: "Ruiz",
      role: "client",
      status: "active",
    },
  });
  console.log(`\n✅ Usuario cliente natación: ${natacionUser.email}`);

  const natacion = await prisma.sport.findFirst({ where: { name: "Natación" } });
  const resistencia = await prisma.goal.findFirst({ where: { name: "Resistencia cardiovascular" } });

  let natacionClient = await prisma.client.findUnique({
    where: { user_id: natacionUser.id },
  });
  if (!natacionClient) {
    natacionClient = await prisma.client.create({
      data: {
        gym_id: gym.id,
        branch_id: branch.id,
        user_id: natacionUser.id,
        first_name: natacionUser.first_name,
        last_name: natacionUser.last_name,
        email: natacionUser.email,
        sport_id: natacion?.id ?? null,
        goal_id: resistencia?.id ?? null,
        status: "active",
      },
    });
    console.log(`✅ Client record natación creado: ${natacionClient.first_name} ${natacionClient.last_name}`);
  }

  // Membresía activa para que pueda reservar clases
  if (natacionClient) {
    const monthlyPlan = await prisma.membershipPlan.findFirst({
      where: { gym_id: gym.id, name: "Plan Mensual" },
    });
    const today2 = new Date();
    const memStart2 = new Date(today2.getFullYear(), today2.getMonth(), 1);
    const memEnd2 = new Date(today2.getFullYear(), today2.getMonth() + 2, 0);
    if (monthlyPlan) {
      const existingMem = await prisma.clientMembership.findFirst({
        where: { client_id: natacionClient.id, status: "active", start_date: memStart2 },
      });
      if (!existingMem) {
        await prisma.clientMembership.create({
          data: {
            gym_id: gym.id,
            branch_id: branch.id,
            client_id: natacionClient.id,
            membership_plan_id: monthlyPlan.id,
            start_date: memStart2,
            end_date: memEnd2,
            price_at_sale: monthlyPlan.price,
            discount_amount: "0.00",
            final_amount: monthlyPlan.price,
            payment_status: "paid",
            status: "active",
          },
        });
        console.log(`✅ Membresía activa para cliente natación`);
      }
    }
  }

  // ----------------------------------------------------------
  // 17. CLIENTES GENÉRICOS (solo para dashboard admin, sin portal)
  // ----------------------------------------------------------
  const futbol = await prisma.sport.findFirst({ where: { name: "Fútbol" } });
  const crossfit = await prisma.sport.findFirst({ where: { name: "CrossFit" } });
  const boxeo = await prisma.sport.findFirst({ where: { name: "Boxeo" } });
  const perdidaPeso = await prisma.goal.findFirst({ where: { name: "Pérdida de peso" } });
  const rendimiento = await prisma.goal.findFirst({ where: { name: "Rendimiento deportivo" } });
  const fuerza = await prisma.goal.findFirst({ where: { name: "Ganancia de fuerza" } });
  const mantenimiento = await prisma.goal.findFirst({ where: { name: "Mantenimiento" } });

  const adminOnlyClients = [
    { email: "futbol1@demo.gym",  first_name: "Andrés",   last_name: "Campos",    sport: futbol,   goal: rendimiento },
    { email: "futbol2@demo.gym",  first_name: "Diego",    last_name: "Herrera",   sport: futbol,   goal: fuerza },
    { email: "natacion1@demo.gym",first_name: "Valeria",  last_name: "Torres",    sport: natacion, goal: resistencia },
    { email: "natacion2@demo.gym",first_name: "Marcos",   last_name: "Delgado",   sport: natacion, goal: perdidaPeso },
    { email: "crossfit1@demo.gym",first_name: "Elena",    last_name: "Vargas",    sport: crossfit, goal: perdidaPeso },
    { email: "crossfit2@demo.gym",first_name: "Rodrigo",  last_name: "Méndez",    sport: crossfit, goal: mantenimiento },
    { email: "boxeo1@demo.gym",   first_name: "Patricia", last_name: "Jiménez",   sport: boxeo,    goal: rendimiento },
    { email: "general1@demo.gym", first_name: "Tomás",    last_name: "Fernández", sport: null,     goal: null },
  ];
  console.log("");
  const adminClientMap: Record<string, string> = {};
  for (const c of adminOnlyClients) {
    const existing = await prisma.client.findFirst({
      where: { gym_id: gym.id, email: c.email },
    });
    if (!existing) {
      const created = await prisma.client.create({
        data: {
          gym_id: gym.id,
          branch_id: branch.id,
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email,
          sport_id: c.sport?.id ?? null,
          goal_id: c.goal?.id ?? null,
          status: "active",
        },
      });
      adminClientMap[c.email] = created.id;
      console.log(`✅ Cliente: ${c.first_name} ${c.last_name} (${c.sport?.name ?? "sin deporte"})`);
    } else {
      adminClientMap[c.email] = existing.id;
      console.log(`✅ Cliente ya existe: ${c.first_name} ${c.last_name}`);
    }
  }

  // ----------------------------------------------------------
  // 18. PLANTILLAS DE PLAN SEMANAL ADICIONALES
  // ----------------------------------------------------------
  const adminUser = await prisma.user.findUnique({ where: { email: "admin@sucursal1.demo" } });

  const newTemplates = [
    {
      name: "Programa General - Introducción al Gym",
      description: "Rutina de introducción para todos los miembros, sin requisitos previos",
      branch_id: null as string | null, // global
      target_sport_id: null as string | null,
      target_goal_id: null as string | null,
      days: [
        { weekday: 1, session_name: "Cuerpo completo A",  focus_area: "Introducción muscular", duration_minutes: 45, exercise_block: "Sentadilla goblet: 3x15\nPress mancuerna: 3x12\nRemo con banda: 3x15\nPlanchas: 3x30s" },
        { weekday: 3, session_name: "Cardio y movilidad", focus_area: "Acondicionamiento aeróbico", duration_minutes: 40, exercise_block: "Caminata rápida: 20 min\nBicicleta estática: 15 min\nEstiramientos: 5 min" },
        { weekday: 5, session_name: "Cuerpo completo B",  focus_area: "Fortalecimiento general", duration_minutes: 45, exercise_block: "Peso muerto rumano: 3x12\nPress de hombros: 3x12\nDominadas asistidas: 3x8\nAbdominales: 3x15" },
      ],
    },
    {
      name: "Plan Natación - Técnica y Resistencia",
      description: "Complemento en tierra para nadadores: fuerza de hombros, core y técnica",
      branch_id: branch.id,
      target_sport_id: natacion?.id ?? null,
      target_goal_id: null as string | null,
      days: [
        { weekday: 1, session_name: "Fuerza de hombros",  focus_area: "Tracción y empuje", duration_minutes: 50, exercise_block: "Pull-ups: 4x8\nRemo unilateral: 3x12\nPress Arnold: 3x12\nRotadores externos: 3x15" },
        { weekday: 3, session_name: "Core y estabilidad", focus_area: "Control lumbar y respiración", duration_minutes: 40, exercise_block: "Plancha: 4x45s\nDead bug: 3x10\nBird dog: 3x10\nPalof press: 3x12" },
        { weekday: 5, session_name: "Piernas y explosividad", focus_area: "Patada y viraje", duration_minutes: 55, exercise_block: "Sentadilla búlgara: 3x10\nSaltos en cajón: 4x6\nElevaciones gemelos: 4x15\nFlexores de cadera: 3x12" },
      ],
    },
    {
      name: "Plan Fútbol - Acondicionamiento Físico",
      description: "Preparación física complementaria para jugadores de fútbol",
      branch_id: branch.id,
      target_sport_id: futbol?.id ?? null,
      target_goal_id: rendimiento?.id ?? null,
      days: [
        { weekday: 1, session_name: "Velocidad y explosividad", focus_area: "Sprint y potencia", duration_minutes: 60, exercise_block: "Sentadilla: 4x8\nSaltos pliométricos: 4x8\nSprint 30m: 6 repeticiones\nHip thrust: 3x12" },
        { weekday: 2, session_name: "Resistencia aeróbica",    focus_area: "VO2 max y recuperación", duration_minutes: 50, exercise_block: "Fartlek 30 min (alternando intensidades)\nEjercicios de coordinación: 15 min\nEstiramientos: 5 min" },
        { weekday: 4, session_name: "Fuerza tren inferior",    focus_area: "Potencia muscular", duration_minutes: 60, exercise_block: "Peso muerto: 4x6\nZancadas: 3x12\nStep-up: 3x10\nBand walks: 3x15" },
        { weekday: 6, session_name: "Agilidad y técnica",      focus_area: "Coordinación y cambio de ritmo", duration_minutes: 45, exercise_block: "Escalera de agilidad: 4 series\nCambios de dirección: 4 series\nEjercicios de equilibrio: 3x10" },
      ],
    },
  ];

  console.log("");
  for (const tpl of newTemplates) {
    const existing = await prisma.weeklyPlanTemplate.findFirst({
      where: { gym_id: gym.id, name: tpl.name },
    });
    if (!existing) {
      const created = await prisma.weeklyPlanTemplate.create({
        data: {
          gym_id: gym.id,
          branch_id: tpl.branch_id,
          name: tpl.name,
          description: tpl.description,
          target_sport_id: tpl.target_sport_id,
          target_goal_id: tpl.target_goal_id,
          status: "active",
          created_by: adminUser?.id ?? null,
          days: { create: tpl.days },
        },
      });
      console.log(`✅ Plantilla: ${created.name}`);
    } else {
      console.log(`✅ Plantilla ya existe: ${tpl.name}`);
    }
  }

  // ----------------------------------------------------------
  // 19. PLAN PERSONALIZADO para cliente de boxeo
  //     (demuestra "solo personalizado" — Boxeo no tiene plantilla general)
  // ----------------------------------------------------------
  const boxeoClientId = adminClientMap["boxeo1@demo.gym"];
  if (boxeoClientId && trainerProfile) {
    const today3 = new Date();
    const dow3 = today3.getDay();
    const fromMon3 = dow3 === 0 ? 6 : dow3 - 1;
    const mon3 = new Date(today3);
    mon3.setDate(today3.getDate() - fromMon3);
    mon3.setHours(0, 0, 0, 0);
    const sun3 = new Date(mon3);
    sun3.setDate(mon3.getDate() + 6);

    const existingBoxPlan = await prisma.clientWeeklyPlan.findFirst({
      where: { client_id: boxeoClientId, status: "active", start_date: mon3 },
    });
    if (!existingBoxPlan) {
      const boxPlan = await prisma.clientWeeklyPlan.create({
        data: {
          gym_id: gym.id,
          branch_id: branch.id,
          client_id: boxeoClientId,
          trainer_id: trainerProfile.id,
          start_date: mon3,
          end_date: sun3,
          status: "active",
          notes: "Plan de boxeo personalizado: acondicionamiento y técnica",
        },
      });
      await prisma.clientWeeklyPlanDay.createMany({
        data: [
          { client_weekly_plan_id: boxPlan.id, weekday: 1, session_name: "Técnica de golpes", focus_area: "Jab-cross-gancho", duration_minutes: 60, exercise_block: "Sombra: 5 rounds\nSaco: 5 rounds\nSpeed bag: 3 rounds" },
          { client_weekly_plan_id: boxPlan.id, weekday: 3, session_name: "Acondicionamiento", focus_area: "Resistencia aeróbica", duration_minutes: 50, exercise_block: "Cuerda: 10 min\nSentadillas: 3x20\nFlexiones: 3x15\nCarreras: 3x400m" },
          { client_weekly_plan_id: boxPlan.id, weekday: 5, session_name: "Sparring y defensa", focus_area: "Técnica defensiva", duration_minutes: 60, exercise_block: "Calentamiento: 10 min\nSparring controlado: 4 rounds\nMitts: 4 rounds\nAbdominales: 50 rep" },
        ],
      });
      console.log(`\n✅ Plan personalizado creado para cliente de boxeo`);
    } else {
      console.log(`\n✅ Plan de boxeo ya existe`);
    }
  }

  // ----------------------------------------------------------
  // 20. CLASES ADICIONALES (variedad para el dashboard)
  // ----------------------------------------------------------
  const lauraTrainer = await prisma.trainer.findFirst({
    where: { gym_id: gym.id, first_name: "Laura", last_name: "Trainer" },
  });
  if (lauraTrainer && trainerProfile && classTypeMap["Yoga"]) {
    const today4 = new Date();
    today4.setHours(0, 0, 0, 0);
    const extraClasses = [
      { daysFromNow: 1, name: "Yoga matutino", typeKey: "Yoga", start: "07:00", end: "08:00", capacity: 15, trainer: lauraTrainer },
      { daysFromNow: 2, name: "Spinning power", typeKey: "Spinning", start: "18:00", end: "18:45", capacity: 20, trainer: trainerProfile },
      { daysFromNow: 3, name: "Yoga nocturno", typeKey: "Yoga", start: "20:00", end: "21:00", capacity: 15, trainer: lauraTrainer },
    ];
    for (const ec of extraClasses) {
      const classDate = new Date(today4);
      classDate.setDate(today4.getDate() + ec.daysFromNow);
      const exists = await prisma.scheduledClass.findFirst({
        where: {
          branch_id: branch.id,
          trainer_id: ec.trainer.id,
          class_date: classDate,
          start_time: ec.start,
          title: ec.name,
        },
      });
      if (!exists) {
        await prisma.scheduledClass.create({
          data: {
            gym_id: gym.id,
            branch_id: branch.id,
            class_type_id: classTypeMap[ec.typeKey],
            trainer_id: ec.trainer.id,
            title: ec.name,
            class_date: classDate,
            start_time: ec.start,
            end_time: ec.end,
            capacity: ec.capacity,
            status: "scheduled",
          },
        });
        console.log(`✅ Clase extra: ${ec.name} (${classDate.toDateString()} ${ec.start})`);
      } else {
        console.log(`✅ Clase extra ya existe: ${ec.name}`);
      }
    }
  }

  console.log("\n🎉 Seed completado correctamente.");
  console.log(`\n📋 Credenciales demo (contraseña: ${DEMO_PASSWORD})`);
  console.log("   super@powergym.demo              → super_admin");
  console.log("   admin@sucursal1.demo             → branch_admin");
  console.log("   recepcion@sucursal1.demo         → reception");
  console.log("   trainer@sucursal1.demo           → trainer");
  console.log("   cliente@powergym.demo            → client  →  /portal  (tiene plan personalizado + general)");
  console.log("   cliente_natacion@powergym.demo   → client  →  /portal  (solo programación general)");
  console.log("\n🔗 Portal del cliente: http://localhost:3000/portal");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
