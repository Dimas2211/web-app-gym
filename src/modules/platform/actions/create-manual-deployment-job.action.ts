"use server";

// ─────────────────────────────────────────────────────────────────
// platform — create-manual-deployment-job.action.ts
//
// Crea un PlatformDeploymentJob en modo MANUAL con los 11 pasos
// del runbook de deployment manual.
// Solo super_admin. No ejecuta infraestructura real.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }    from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";
import { getLatestDeploymentExportForOrgQuery } from "../queries/get-latest-deployment-export-for-org";

// 11 pasos del runbook de deployment manual
const MANUAL_DEPLOYMENT_STEPS = [
  { key: "REVIEW_BUNDLE",       name: "Revisar Deployment Bundle",        order: 1  },
  { key: "CREATE_DATABASE",     name: "Crear Base de Datos",               order: 2  },
  { key: "CONFIGURE_ENV_VARS",  name: "Configurar Variables de Entorno",   order: 3  },
  { key: "RUN_MIGRATIONS",      name: "Ejecutar Migraciones",              order: 4  },
  { key: "RUN_SEEDS",           name: "Ejecutar Seeds",                    order: 5  },
  { key: "CONFIGURE_BRANDING",  name: "Configurar Branding",               order: 6  },
  { key: "VALIDATE_MODULES",    name: "Validar Módulos Activos",           order: 7  },
  { key: "RUN_BUILD",           name: "Ejecutar Build",                    order: 8  },
  { key: "DEPLOY_INSTANCE",     name: "Desplegar Instancia",               order: 9  },
  { key: "SMOKE_TEST",          name: "Realizar Smoke Test",               order: 10 },
  { key: "REGISTER_RESULT",     name: "Registrar Resultado Final",         order: 11 },
] as const;

export type CreateManualDeploymentJobState =
  | { error?: string; jobId?: string }
  | undefined;

export async function createManualDeploymentJobAction(
  organizationId: string,
  notes?: string,
): Promise<CreateManualDeploymentJobState> {
  const sessionUser = await requireSuperAdmin();

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
    return { error: "La organización tiene licencia cancelada." };
  }

  const validStatuses = ["READY", "PROVISIONED", "DEPLOYED"];
  if (!validStatuses.includes(org.provisioning_status)) {
    return { error: `La organización no está lista. Estado de provisioning: ${org.provisioning_status}` };
  }

  const latestExport = await getLatestDeploymentExportForOrgQuery(organizationId);
  if (!latestExport) {
    return { error: "No existe Deployment Bundle exportado. Exporte el bundle primero." };
  }

  const activeModules = await prisma.platformOrganizationModule.count({
    where: { organization_id: organizationId, is_active: true },
  });
  if (activeModules === 0) {
    return { error: "La organización no tiene módulos activos." };
  }

  let jobId!: string;

  await prisma.$transaction(async (tx) => {
    const job = await tx.platformDeploymentJob.create({
      data: {
        organization_id:    organizationId,
        bundle_export_id:   latestExport.id,
        job_status:         "PENDING",
        target_environment: "PRODUCTION",
        deployment_mode:    "MANUAL",
        created_by:         sessionUser.id,
        notes:              notes ?? null,
      },
    });

    jobId = job.id;

    await tx.platformDeploymentStep.createMany({
      data: MANUAL_DEPLOYMENT_STEPS.map((s) => ({
        job_id:     job.id,
        step_key:   s.key,
        step_name:  s.name,
        step_order: s.order,
        status:     "PENDING",
      })),
    });

    await tx.platformDeploymentLog.create({
      data: {
        organization_id: organizationId,
        action:          "CREATE_MANUAL_DEPLOYMENT_JOB",
        status:          "SUCCESS",
        notes:           `Manual Deployment Job creado para "${org.name}" (11 pasos)`,
        triggered_by:    sessionUser.id,
        started_at:      new Date(),
        ended_at:        new Date(),
      },
    });
  });

  revalidatePath("/dashboard/platform/manual-deployment");
  revalidatePath(`/dashboard/platform/deployment-preparation/${organizationId}`);

  return { jobId };
}
