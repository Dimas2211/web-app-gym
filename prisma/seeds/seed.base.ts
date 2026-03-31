/**
 * seed.base.ts
 *
 * Estructura mínima para un gimnasio real nuevo.
 * Crea: gym, sucursal principal y un super_admin.
 *
 * Configuración vía variables de entorno (todas opcionales con valores por defecto):
 *   BASE_GYM_NAME       — nombre del gimnasio          (default: "Mi Gimnasio")
 *   BASE_GYM_SLUG       — slug URL del gimnasio         (default: "mi-gimnasio")
 *   BASE_BRANCH_NAME    — nombre de la sucursal base    (default: "Sucursal Principal")
 *   BASE_BRANCH_ADDRESS — dirección de la sucursal      (default: vacío)
 *   BASE_ADMIN_EMAIL    — email del super admin         (default: "admin@migym.com")
 *   BASE_ADMIN_PASSWORD — contraseña inicial            (default: "Cambiar1234!")
 *   BASE_ADMIN_FIRST    — nombre del admin              (default: "Admin")
 *   BASE_ADMIN_LAST     — apellido del admin            (default: "Principal")
 *
 * ⚠️  En producción: configurar BASE_ADMIN_PASSWORD con una contraseña segura
 *     y cambiarla desde la UI después del primer login.
 *
 * Idempotente: puede ejecutarse múltiples veces sin duplicar datos.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// ============================================================
// TIPOS
// ============================================================

export interface BaseContext {
  gym: { id: string; name: string; slug: string };
  branch: { id: string; name: string };
  adminUser: { id: string; email: string };
}

// ============================================================
// FUNCIÓN EXPORTADA
// ============================================================

export async function seedBase(prisma: PrismaClient): Promise<BaseContext> {
  const gymName = process.env.BASE_GYM_NAME ?? "Mi Gimnasio";
  const gymSlug = process.env.BASE_GYM_SLUG ?? "mi-gimnasio";
  const branchName = process.env.BASE_BRANCH_NAME ?? "Sucursal Principal";
  const branchAddress = process.env.BASE_BRANCH_ADDRESS ?? "";
  const adminEmail = process.env.BASE_ADMIN_EMAIL ?? "admin@migym.com";
  const adminPassword = process.env.BASE_ADMIN_PASSWORD ?? "Cambiar1234!";
  const adminFirst = process.env.BASE_ADMIN_FIRST ?? "Admin";
  const adminLast = process.env.BASE_ADMIN_LAST ?? "Principal";

  console.log("\n🏗️  Estructura base del sistema...");

  // ----------------------------------------------------------
  // 1. GYM
  // ----------------------------------------------------------
  const gym = await prisma.gym.upsert({
    where: { slug: gymSlug },
    update: {},
    create: {
      name: gymName,
      slug: gymSlug,
      status: "active",
    },
  });
  console.log(`  ✅ Gym: ${gym.name} (slug: ${gym.slug})`);

  // ----------------------------------------------------------
  // 2. SUCURSAL PRINCIPAL
  // ----------------------------------------------------------
  let branch = await prisma.branch.findFirst({
    where: { gym_id: gym.id, name: branchName },
  });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        gym_id: gym.id,
        name: branchName,
        address: branchAddress || null,
        status: "active",
      },
    });
  }
  console.log(`  ✅ Sucursal: ${branch.name}`);

  // ----------------------------------------------------------
  // 3. SUPER ADMIN
  // ----------------------------------------------------------
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      gym_id: gym.id,
      email: adminEmail,
      password_hash: passwordHash,
      first_name: adminFirst,
      last_name: adminLast,
      role: "super_admin",
      status: "active",
    },
  });
  console.log(`  ✅ Super admin: ${adminUser.email}`);

  const isDefaultPassword = !process.env.BASE_ADMIN_PASSWORD;
  if (isDefaultPassword) {
    console.log(
      `  ⚠️  Contraseña por defecto: "${adminPassword}" — cámbiala desde la UI antes de usar en producción`,
    );
  }

  return {
    gym: { id: gym.id, name: gym.name, slug: gym.slug },
    branch: { id: branch.id, name: branch.name },
    adminUser: { id: adminUser.id, email: adminUser.email },
  };
}
