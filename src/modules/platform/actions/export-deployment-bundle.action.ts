"use server";

// ─────────────────────────────────────────────────────────────────
// platform — export-deployment-bundle.action.ts
//
// Genera y registra un Deployment Bundle para una organización.
// Valida pre-condiciones antes de exportar.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }   from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";
import { Prisma }            from "@prisma/client";
import { getDeploymentBundleQuery, getNextBundleVersion } from "../queries/get-deployment-bundle";
import type { DeploymentBundle, ExportValidationResult } from "../types/platform.types";

export type ExportBundleActionState =
  | {
      success:    true;
      bundle:     DeploymentBundle;
      version:    string;
      log_id:     string;
    }
  | {
      success:    false;
      validation: ExportValidationResult;
      error?:     string;
    }
  | undefined;

export async function exportDeploymentBundleAction(
  organizationId: string,
): Promise<ExportBundleActionState> {
  const sessionUser = await requireSuperAdmin();

  const nextVersion = await getNextBundleVersion(organizationId);

  const { bundle, validation } = await getDeploymentBundleQuery(
    organizationId,
    sessionUser.id,
    nextVersion,
  );

  if (!validation.valid || !bundle) {
    // Registrar intento fallido
    await prisma.platformDeploymentExportLog.create({
      data: {
        organization_id: organizationId,
        export_type:     "DEPLOYMENT_BUNDLE",
        bundle_version:  nextVersion,
        exported_by:     sessionUser.id,
        result:          "FAILED",
        error_message:   validation.errors.join("; "),
      },
    });

    revalidatePath(`/dashboard/platform/deployment-preparation/${organizationId}`);
    revalidatePath("/dashboard/platform/deployment-exports");

    return { success: false, validation };
  }

  // Registrar exportación exitosa con snapshot
  const log = await prisma.platformDeploymentExportLog.create({
    data: {
      organization_id: organizationId,
      export_type:     "DEPLOYMENT_BUNDLE",
      bundle_version:  nextVersion,
      exported_by:     sessionUser.id,
      result:          "SUCCESS",
      bundle_snapshot: bundle as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/dashboard/platform/deployment-preparation/${organizationId}`);
  revalidatePath("/dashboard/platform/deployment-exports");
  revalidatePath("/dashboard/platform/deployment-preparation");

  return {
    success: true,
    bundle,
    version: nextVersion,
    log_id:  log.id,
  };
}
