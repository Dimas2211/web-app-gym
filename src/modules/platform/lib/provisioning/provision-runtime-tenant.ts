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
// SHARED-PILOT-4B — idempotencia por operación:
// - `idempotencyKey` la genera Control Plane
//   (PlatformRuntimeProvisioningOperation) y se reutiliza en cada retry.
// - Dentro de UNA transacción runtime: advisory lock por key → buscar
//   RuntimeProvisioningReceipt → si existe, validar y devolver los MISMOS
//   IDs sin escribir nada; si no, crear Tenant (+Gym) + Location + Admin
//   + Receipt. Solo hay dos estados posibles: nada, o los cuatro juntos.
// - Nunca se decide "es el mismo" por slug/email. Un slug ya tomado sin
//   receipt de esta key → RuntimeProvisioningConflictError (fail closed,
//   nunca se adopta un tenant ajeno).
// ─────────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";
import { Prisma, type PrismaClient } from "@prisma/client";

type ProvisionBaseInput = {
  /** Generada server-side por Control Plane. Nunca viene del browser. */
  idempotencyKey: string;
  /**
   * Solo recuperar: si no existe receipt para la key, fallar cerrado en
   * vez de crear. Se usa cuando Control Plane ya tiene tenant_id bindeado
   * para la organización (nunca debe nacer un segundo tenant).
   */
  replayOnly?: boolean;
  tenantName: string;
  tenantSlug: string;
  locationName: string;
  admin: ProvisionAdminInput;
};

export type ProvisionRuntimeTenantInput =
  | (ProvisionBaseInput & { mode: "COMMERCE_ONLY" })
  | (ProvisionBaseInput & { mode: "GYM"; gymName: string; gymSlug: string });

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
  /** true si la operación ya estaba aplicada (receipt existente) y no se escribió nada. */
  replayed: boolean;
}

export type RuntimeProvisioningConflictReason =
  | "TENANT_SLUG_TAKEN"
  | "GYM_SLUG_TAKEN"
  | "UNIQUE_CONFLICT"
  | "RECEIPT_MODE_MISMATCH"
  | "RECEIPT_RESOURCES_MISSING"
  | "RECEIPT_NOT_FOUND";

/**
 * Conflicto de negocio en la base runtime. Siempre implica rollback
 * completo de la transacción runtime (nada parcial queda escrito).
 */
export class RuntimeProvisioningConflictError extends Error {
  constructor(
    public readonly reason: RuntimeProvisioningConflictReason,
    message: string,
  ) {
    super(message);
    this.name = "RuntimeProvisioningConflictError";
  }
}

// Namespace del advisory lock, para no colisionar con otros usos de
// pg_advisory_xact_lock sobre la misma base.
const LOCK_NAMESPACE = "runtime-provisioning:";

type Tx = Prisma.TransactionClient;

async function replayFromReceipt(
  tx: Tx,
  receipt: {
    mode: string;
    tenant_id: string;
    gym_id: string | null;
    location_id: string;
    admin_user_id: string;
  },
  mode: ProvisionRuntimeTenantInput["mode"],
): Promise<ProvisionRuntimeTenantResult> {
  if (receipt.mode !== mode) {
    throw new RuntimeProvisioningConflictError(
      "RECEIPT_MODE_MISMATCH",
      `Esta operación ya fue aplicada en modo ${receipt.mode}; no puede reintentarse como ${mode}.`,
    );
  }

  const [tenant, location, admin, gym] = await Promise.all([
    tx.runtimeTenant.findUnique({ where: { id: receipt.tenant_id }, select: { id: true } }),
    tx.branch.findUnique({ where: { id: receipt.location_id }, select: { tenant_id: true } }),
    tx.user.findUnique({ where: { id: receipt.admin_user_id }, select: { tenant_id: true } }),
    receipt.gym_id
      ? tx.gym.findUnique({ where: { id: receipt.gym_id }, select: { tenant_id: true } })
      : Promise.resolve(null),
  ]);

  const consistent =
    !!tenant &&
    location?.tenant_id === receipt.tenant_id &&
    admin?.tenant_id === receipt.tenant_id &&
    (receipt.gym_id === null || gym?.tenant_id === receipt.tenant_id);

  if (!consistent) {
    throw new RuntimeProvisioningConflictError(
      "RECEIPT_RESOURCES_MISSING",
      "El receipt de provisioning existe pero sus recursos (tenant/location/admin) no son consistentes. Requiere revisión manual.",
    );
  }

  return {
    tenantId: receipt.tenant_id,
    gymId: receipt.gym_id,
    locationId: receipt.location_id,
    adminUserId: receipt.admin_user_id,
    replayed: true,
  };
}

/**
 * Da de alta un RuntimeTenant nuevo, transaccional e idempotente por
 * `input.idempotencyKey`. Nunca crea un Gym en MODE COMMERCE_ONLY. En
 * MODE GYM, crea la extensión Gym y vincula Location/Admin a ella además
 * de al tenant.
 */
export async function provisionRuntimeTenant(
  db: PrismaClient,
  input: ProvisionRuntimeTenantInput,
): Promise<ProvisionRuntimeTenantResult> {
  // Hash fuera de la transacción: no retener el advisory lock mientras bcrypt corre.
  const password_hash = await bcrypt.hash(input.admin.password, 10);

  try {
    return await db.$transaction(
      async (tx) => {
        // Serializa requests concurrentes con la MISMA key: el segundo espera
        // al commit del primero y luego ve su receipt.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCK_NAMESPACE + input.idempotencyKey}))`;

        const receipt = await tx.runtimeProvisioningReceipt.findUnique({
          where: { idempotency_key: input.idempotencyKey },
          select: { mode: true, tenant_id: true, gym_id: true, location_id: true, admin_user_id: true },
        });
        if (receipt) return replayFromReceipt(tx, receipt, input.mode);
        if (input.replayOnly) {
          throw new RuntimeProvisioningConflictError(
            "RECEIPT_NOT_FOUND",
            "La organización ya tiene un tenant vinculado y no existe un receipt de esta operación en la base runtime. No se crea un segundo tenant; requiere revisión manual.",
          );
        }

        // Sin receipt para esta key: cualquier slug ya existente pertenece a
        // OTRA operación/tenant. Nunca se adopta.
        const slugOwner = await tx.runtimeTenant.findUnique({
          where: { slug: input.tenantSlug },
          select: { id: true },
        });
        if (slugOwner) {
          throw new RuntimeProvisioningConflictError(
            "TENANT_SLUG_TAKEN",
            `El slug de tenant "${input.tenantSlug}" ya pertenece a otro tenant en esta base runtime.`,
          );
        }
        if (input.mode === "GYM") {
          const gymSlugOwner = await tx.gym.findUnique({
            where: { slug: input.gymSlug },
            select: { id: true },
          });
          if (gymSlugOwner) {
            throw new RuntimeProvisioningConflictError(
              "GYM_SLUG_TAKEN",
              `El slug de gym "${input.gymSlug}" ya pertenece a otro gym en esta base runtime.`,
            );
          }
        }

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

        await tx.runtimeProvisioningReceipt.create({
          data: {
            idempotency_key: input.idempotencyKey,
            mode: input.mode,
            tenant_id: tenant.id,
            gym_id: gymId,
            location_id: location.id,
            admin_user_id: admin.id,
          },
          select: { id: true },
        });

        return {
          tenantId: tenant.id,
          gymId,
          locationId: location.id,
          adminUserId: admin.id,
          replayed: false,
        };
      },
      // El advisory lock puede esperar a otra transacción del mismo key.
      { maxWait: 10_000, timeout: 20_000 },
    );
  } catch (err) {
    // Carrera contra una operación AJENA (otra key) que tomó el mismo
    // slug/email entre el chequeo y el insert: la transacción ya hizo
    // rollback; se reporta como conflicto, nunca como éxito.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new RuntimeProvisioningConflictError(
        "UNIQUE_CONFLICT",
        "Otro tenant de esta base runtime ya usa alguno de los identificadores únicos solicitados (slug/email).",
      );
    }
    throw err;
  }
}
