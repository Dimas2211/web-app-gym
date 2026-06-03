"use server";

// ─────────────────────────────────────────────────────────────────
// platform — simulate-deployment-job.action.ts
//
// Ejecuta la simulación de un PlatformDeploymentJob.
// Recorre los pasos en orden, valida datos y registra resultados.
// Solo super_admin. No llama APIs externas ni infraestructura real.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }    from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";

export type SimulateDeploymentJobState =
  | { error?: string; success?: boolean }
  | undefined;

// Lógica de validación por step — simula sin infraestructura real
async function executeStep(
  stepKey: string,
  org: {
    id: string;
    code: string;
    name: string;
    legal_name: string | null;
    nit: string | null;
    country_code: string | null;
    timezone: string | null;
  },
  bundleExportId: string | null,
  activeModulesCount: number,
  brandingExists: boolean,
): Promise<{ success: boolean; message: string }> {
  switch (stepKey) {
    case "VALIDATE_BUNDLE":
      if (!bundleExportId) {
        return { success: false, message: "No existe bundle export asociado al job." };
      }
      return { success: true, message: `Bundle export ${bundleExportId.substring(0, 8)}... validado correctamente.` };

    case "GENERATE_ENV_CONFIG":
      if (!org.country_code || !org.timezone) {
        return { success: false, message: "La organización no tiene country_code o timezone configurados." };
      }
      return { success: true, message: `Config ENV generada: country=${org.country_code}, timezone=${org.timezone}.` };

    case "PREPARE_DATABASE_CONFIG":
      if (!org.code) {
        return { success: false, message: "La organización no tiene código válido para identificador de base de datos." };
      }
      return { success: true, message: `Config DB preparada: identificador=${org.code}_db (simulado).` };

    case "PREPARE_BRANDING_ASSETS":
      if (!brandingExists) {
        return { success: false, message: "No existe registro de branding para la organización." };
      }
      return { success: true, message: "Assets de branding verificados y preparados (simulado)." };

    case "PREPARE_MODULE_CONFIG":
      if (activeModulesCount === 0) {
        return { success: false, message: "La organización no tiene módulos activos." };
      }
      return { success: true, message: `${activeModulesCount} módulo(s) activo(s) preparados para configuración.` };

    case "PREPARE_SEED_CONFIG":
      return { success: true, message: "Configuración de seeds base preparada (simulado). Se generará al desplegar." };

    case "REGISTER_DEPLOYMENT_LOG":
      return { success: true, message: "Log de deployment registrado correctamente." };

    case "MARK_READY_FOR_MANUAL":
      return { success: true, message: `Organización "${org.name}" marcada como lista para deployment manual.` };

    default:
      return { success: true, message: `Step ${stepKey} completado (simulado).` };
  }
}

export async function simulateDeploymentJobAction(
  jobId: string,
): Promise<SimulateDeploymentJobState> {
  const sessionUser = await requireSuperAdmin();

  // 1. Validar que el job existe y está PENDING
  const job = await prisma.platformDeploymentJob.findUnique({
    where:  { id: jobId },
    select: {
      id:              true,
      organization_id: true,
      bundle_export_id: true,
      job_status:      true,
      organization: {
        select: {
          id:          true,
          code:        true,
          name:        true,
          legal_name:  true,
          nit:         true,
          country_code: true,
          timezone:    true,
        },
      },
      steps: {
        select: { id: true, step_key: true, step_order: true },
        orderBy: { step_order: "asc" },
      },
    },
  });

  if (!job) {
    return { error: "Deployment Job no encontrado." };
  }
  if (job.job_status !== "PENDING") {
    return { error: `El job no está en estado PENDING. Estado actual: ${job.job_status}` };
  }
  if (job.steps.length === 0) {
    return { error: "El job no tiene pasos configurados." };
  }

  // 2. Cargar datos auxiliares para validación
  const [activeModulesCount, brandingRecord] = await Promise.all([
    prisma.platformOrganizationModule.count({
      where: { organization_id: job.organization_id, is_active: true },
    }),
    prisma.platformBranding.findUnique({
      where:  { organization_id: job.organization_id },
      select: { id: true },
    }),
  ]);

  const now = new Date();

  // 3. Marcar job como RUNNING
  await prisma.platformDeploymentJob.update({
    where: { id: jobId },
    data:  { job_status: "RUNNING", started_at: now },
  });

  // 4. Ejecutar steps en secuencia
  let overallSuccess = true;
  let failedMessage: string | null = null;

  for (const step of job.steps) {
    const stepStart = new Date();

    // Marcar step como RUNNING
    await prisma.platformDeploymentStep.update({
      where: { id: step.id },
      data:  { status: "RUNNING", started_at: stepStart },
    });

    const result = await executeStep(
      step.step_key,
      job.organization,
      job.bundle_export_id,
      activeModulesCount,
      !!brandingRecord,
    );

    const stepEnd = new Date();

    await prisma.platformDeploymentStep.update({
      where: { id: step.id },
      data:  {
        status:      result.success ? "SUCCESS" : "FAILED",
        finished_at: stepEnd,
        message:     result.message,
      },
    });

    if (!result.success) {
      overallSuccess = false;
      failedMessage  = result.message;

      // Marcar steps restantes como SKIPPED
      const remainingSteps = job.steps.filter((s) => s.step_order > step.step_order);
      if (remainingSteps.length > 0) {
        await prisma.platformDeploymentStep.updateMany({
          where: { id: { in: remainingSteps.map((s) => s.id) } },
          data:  { status: "SKIPPED", message: "Omitido por fallo anterior." },
        });
      }
      break;
    }
  }

  // 5. Actualizar estado final del job
  const finalStatus = overallSuccess ? "SIMULATED" : "FAILED";
  await prisma.platformDeploymentJob.update({
    where: { id: jobId },
    data:  {
      job_status:    finalStatus,
      finished_at:   new Date(),
      error_message: overallSuccess ? null : failedMessage,
    },
  });

  // 6. Registrar log
  await prisma.platformDeploymentLog.create({
    data: {
      organization_id: job.organization_id,
      action:          "SIMULATE_DEPLOYMENT_JOB",
      status:          overallSuccess ? "SUCCESS" : "FAILED",
      notes:           overallSuccess
        ? `Simulación de deployment completada exitosamente. Job: ${jobId}`
        : `Simulación de deployment falló. Job: ${jobId}. Error: ${failedMessage}`,
      triggered_by: sessionUser.id,
      started_at:   now,
      ended_at:     new Date(),
    },
  });

  revalidatePath(`/dashboard/platform/deployments/${jobId}`);
  revalidatePath("/dashboard/platform/deployments");

  if (!overallSuccess) {
    return { error: failedMessage ?? "La simulación falló." };
  }

  return { success: true };
}
