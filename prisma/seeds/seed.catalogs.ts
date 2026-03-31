/**
 * seed.catalogs.ts
 *
 * Catálogos globales del sistema: metas de entrenamiento y deportes.
 * No dependen de ningún gym ni branch. Son compartidos por todos los entornos.
 *
 * Idempotente: puede ejecutarse múltiples veces sin duplicar datos.
 */

import { PrismaClient } from "@prisma/client";

// ============================================================
// DATOS DE CATÁLOGO
// ============================================================

const GOALS = [
  {
    name: "Pérdida de peso",
    description:
      "Reducción de grasa corporal y control del peso mediante déficit calórico y ejercicio",
  },
  {
    name: "Hipertrofia muscular",
    description:
      "Aumento de masa muscular y volumen a través de entrenamiento progresivo",
  },
  {
    name: "Ganancia de fuerza",
    description:
      "Incremento de fuerza máxima y potencia en los patrones de movimiento principales",
  },
  {
    name: "Resistencia cardiovascular",
    description:
      "Mejora de la capacidad aeróbica, eficiencia cardíaca y resistencia sostenida",
  },
  {
    name: "Rehabilitación física",
    description:
      "Recuperación funcional tras lesiones, cirugías o condiciones médicas específicas",
  },
  {
    name: "Mantenimiento",
    description:
      "Conservar la condición física, composición corporal y hábitos de actividad actuales",
  },
  {
    name: "Rendimiento deportivo",
    description:
      "Optimización del desempeño físico orientado a un deporte o competencia específica",
  },
];

const SPORTS = [
  {
    name: "Fútbol",
    description:
      "Entrenamiento físico y técnico orientado al fútbol: velocidad, resistencia y coordinación",
  },
  {
    name: "Musculación",
    description:
      "Entrenamiento con pesas libres y máquinas de resistencia para desarrollo muscular",
  },
  {
    name: "Cardio",
    description:
      "Cinta de correr, elíptica, remo y ciclismo estático para acondicionamiento aeróbico",
  },
  {
    name: "CrossFit",
    description:
      "Entrenamiento funcional de alta intensidad con movimientos variados y cronometrados",
  },
  {
    name: "Yoga",
    description:
      "Disciplina física y mental que integra posturas, respiración y meditación",
  },
  {
    name: "Pilates",
    description:
      "Método de fortalecimiento del core, flexibilidad y control postural",
  },
  {
    name: "Spinning",
    description:
      "Ciclismo indoor en grupo con ritmo musical e intervalos de intensidad variable",
  },
  {
    name: "Boxeo",
    description:
      "Entrenamiento de técnica, velocidad y acondicionamiento físico con guantes y saco",
  },
  {
    name: "Natación",
    description:
      "Actividad acuática completa, de bajo impacto articular y alto gasto calórico",
  },
  {
    name: "Artes marciales mixtas (MMA)",
    description:
      "Combate integral que combina técnicas de pie y grappling en suelo",
  },
  {
    name: "Entrenamiento funcional",
    description:
      "Movimientos multiarticulares orientados a mejorar la funcionalidad en la vida cotidiana",
  },
  {
    name: "Zumba",
    description:
      "Clase aeróbica de baile con ritmos latinos que combina cardio y coordinación",
  },
  {
    name: "Atletismo",
    description:
      "Velocidad, saltos y lanzamientos en pista y campo para todas las edades",
  },
  {
    name: "Gimnasia artística",
    description:
      "Ejercicios en aparatos olímpicos y suelo con alto componente técnico y acrobático",
  },
  {
    name: "Escalada deportiva",
    description:
      "Trepa en rocódromo enfocada en fuerza de agarre, técnica de pies y resistencia",
  },
];

// ============================================================
// FUNCIÓN EXPORTADA
// ============================================================

export async function seedCatalogs(prisma: PrismaClient): Promise<void> {
  console.log("\n📚 Catálogos globales (metas y deportes)...");

  for (const goal of GOALS) {
    await prisma.goal.upsert({
      where: { name: goal.name },
      update: {},
      create: { ...goal, status: "active" },
    });
    console.log(`  ✅ Meta: ${goal.name}`);
  }

  console.log("");

  for (const sport of SPORTS) {
    await prisma.sport.upsert({
      where: { name: sport.name },
      update: {},
      create: { ...sport, status: "active" },
    });
    console.log(`  ✅ Deporte: ${sport.name}`);
  }
}
