"use server";

// ─────────────────────────────────────────────────────────────────
// platform — create-deployment-job.action.ts
//
// Crea un PlatformDeploymentJob con sus pasos iniciales.
// Solo super_admin. No ejecuta infraestructura real.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }       from "next/cache";
import { requireSuperAdmin }    from "@/lib/permissions/guards";
import { prisma }               from "@/lib/db/prisma";
import { getLatestDeploymentExportForOrgQuery } from "../queries/get-latest-deployment-export-for-org";

// Pasos del deployment en orden
const DEPLOYMENT_STEPS = [
  { key: "VALIDATE_BUNDLE",           name: "Validar Bundle",                  order: 1 },
  { key: "GENERATE_ENV_CONFIG",       name: "Generar Configuración ENV",        order: 2 },
  { key: "PREPARE_DATABASE_CONFIG",   name: "Preparar Configuración de Base",   order: 3 },
  { key: "PREPARE_BRANDING_ASSETS",   name: "Preparar Assets de Branding",      order: 4 },
  { key: "PREPARE_MODULE_CONFIG",     name: "Preparar Configuración de Módulos", order: 5 },
  { key: "PREPARE_SEED_CONFIG",       name: "Preparar Configuración de Seeds",  order: 6 },
  { key: "REGISTER_DEPLOYMENT_LOG",   name: "Registrar Log de Deployment",      order: 7 },
  { key: "MARK_READY_FOR_MANUAL",     name: "Marcar Lista para Deploy Manual",  order: 8 },
] as const;

export type CreateDeploymentJobState =
  | { error?: string; jobId?: string }
  | undefined;

export async function createDeploymentJobAction(
  organizationId: string,
  notes?: string,
): Promise<CreateDeploymentJobState> {
  const sessionUser = await requireSuperAdmin();

  // 1. Validar que la organización existe y tiene provisioning_status válido
  const org = await prisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: {
      id:                  true,
      name:                true,
      provisioning_status: true,
      status:              true,
      license_status:      true,
    },
  });

  if (!org) {
    return { error: "Organización no encontrada." };
  }

  if (org.license_status === "CANCELLED") {
    return { error: "La organización tiene licencia cancelada. No se puede crear un deployment job." };
  }

  const validStatuses = ["READY", "PROVISIONED", "DEPLOYED"];
  if (!validStatuses.includes(org.provisioning_status)) {
    return { error: `La organización no está lista para deployment. Estado actual: ${org.provisioning_status}` };
  }

  // 2. Validar que existe al menos un export exitoso
  const latestExport = await getLatestDeploymentExportForOrgQuery(organizationId);
  if (!latestExport) {
    return { error: "La organización no tiene Deployment Bundle exportado. Exporte el bundle primero." };
  }

  // 3. Validar que tiene módulos activos
  const activeModules = await prisma.platformOrganizationModule.count({
    where: { organization_id: organizationId, is_active: true },
  });
  if (activeModules === 0) {
    return { error: "La organización no tiene módulos activos." };
  }

  // 4. Crear job + steps en transacción
  let jobId: string;

  await prisma.$transaction(async (tx) => {
    const job = await tx.platformDeploymentJob.create({
      data: {
        organization_id:    organizationId,
        bundle_export_id:   latestExport.id,
        job_status:         "PENDING",
        target_environment: "LOCAL",
        deployment_mode:    "SIMULATION",
        created_by:         sessionUser.id,
        notes:              notes ?? null,
      },
    });

    jobId = job.id;

    // Crear steps iniciales en PENDING
    await tx.platformDeploymentStep.createMany({
      data: DEPLOYMENT_STEPS.map((s) => ({
        job_id:     job.id,
        step_key:   s.key,
        step_name:  s.name,
        step_order: s.order,
        status:     "PENDING",
      })),
    });

    // Registrar log
    await tx.platformDeploymentLog.create({
      data: {
        organization_id: organizationId,
        action:          "CREATE_DEPLOYMENT_JOB",
        status:          "SUCCESS",
        notes:           `Deployment Job creado para "${org.name}" (modo: SIMULATION)`,
        triggered_by:    sessionUser.id,
        started_at:      new Date(),
        ended_at:        new Date(),
      },
    });
  });

  revalidatePath("/dashboard/platform/deployments");
  revalidatePath(`/dashboard/platform/deployment-preparation/${organizationId}`);

  return { jobId: jobId! };
}
