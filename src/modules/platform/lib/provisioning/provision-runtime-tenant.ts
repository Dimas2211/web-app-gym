// ─────────────────────────────────────────────────────────────────
// platform/lib/provisioning — provision-runtime-tenant.ts
//
// SHARED-PILOT-3B. Servicio reusable y transaccional para dar de alta
// un RuntimeTenant nuevo — la raíz neutral de identidad — junto con su
// primera Location y su primer usuario administrador.
//
// Soporta dos modos:
//   MODE 1 — COMMERCE ONLY: crea RuntimeTenant + Location + Admin.
//            NO crea fila Gym. gym_id queda null en Location y Admin.
//   MODE 2 — GYM: crea RuntimeTenant + Gym + Location + Admin, todos
//            vinculados por tenant_id/gym_id correctamente.
//
// Este servicio es de bootstrap — corre ANTES de que exista cualquier
// entitlement/capacity record para el tenant, por lo que escribe
// directo contra `db` (transacción Prisma) en vez de pasar por
// createCoreUser()/createLocation() (que exigen un
// CommercialEnforcementContext ya resuelto para un tenant EXISTENTE).
//
// No hace nada con UI, rutas ni Control Plane — es una unidad pura,
// inyectable con cualquier PrismaClient (global o runtime), pensada
// para ser invocada desde Control Plane en una fase futura.
// ─────────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

export type ProvisionRuntimeTenantInput =
  | {
      mode: "COMMERCE_ONLY";
      tenantName: string;
      tenantSlug: string;
      locationName: string;
      admin: ProvisionAdminInput;
    }
  | {
      mode: "GYM";
      tenantName: string;
      tenantSlug: string;
      gymName: string;
      gymSlug: string;
      locationName: string;
      admin: ProvisionAdminInput;
    };

export interface ProvisionAdminInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface ProvisionRuntimeTenantResult {
  tenantId: string;
  gymId: string | null;
  locationId: string;
  adminUserId: string;
}

/**
 * Da de alta un RuntimeTenant nuevo, transaccional. Nunca crea un Gym
 * en MODE COMMERCE_ONLY. En MODE GYM, crea la extensión Gym y vincula
 * Location/Admin a ella además de al tenant.
 */
export async function provisionRuntimeTenant(
  db: PrismaClient,
  input: ProvisionRuntimeTenantInput,
): Promise<ProvisionRuntimeTenantResult> {
  return db.$transaction(async (tx) => {
    const tenant = await tx.runtimeTenant.create({
      data: {
        name: input.tenantName,
        slug: input.tenantSlug,
        status: "active",
      },
      select: { id: true },
    });

    let gymId: string | null = null;
    if (input.mode === "GYM") {
      const gym = await tx.gym.create({
        data: {
          tenant_id: tenant.id,
          name: input.gymName,
          slug: input.gymSlug,
          status: "active",
        },
        select: { id: true },
      });
      gymId = gym.id;
    }

    const location = await tx.branch.create({
      data: {
        tenant_id: tenant.id,
        gym_id: gymId,
        name: input.locationName,
        status: "active",
      },
      select: { id: true },
    });

    const password_hash = await bcrypt.hash(input.admin.password, 10);
    const admin = await tx.user.create({
      data: {
        tenant_id: tenant.id,
        gym_id: gymId,
        branch_id: location.id,
        location_id: location.id,
        email: input.admin.email,
        password_hash,
        first_name: input.admin.first_name,
        last_name: input.admin.last_name,
        role: "super_admin",
        status: "active",
      },
      select: { id: true },
    });

    return {
      tenantId: tenant.id,
      gymId,
      locationId: location.id,
      adminUserId: admin.id,
    };
  });
}
