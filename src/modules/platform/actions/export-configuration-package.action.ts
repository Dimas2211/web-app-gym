"use server";

// ─────────────────────────────────────────────────────────────────
// platform — export-configuration-package.action.ts
//
// Genera y registra un Configuration Package para una organización.
// Representación simplificada del bundle para integraciones futuras.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }    from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";
import { Prisma }            from "@prisma/client";
import { getDeploymentBundleQuery } from "../queries/get-deployment-bundle";
import type {
  ConfigurationPackage,
  ExportValidationResult,
} from "../types/platform.types";

export type ExportConfigPackageActionState =
  | {
      success:    true;
      pkg:        ConfigurationPackage;
      version:    string;
      log_id:     string;
    }
  | {
      success:    false;
      validation: ExportValidationResult;
      error?:     string;
    }
  | undefined;

export async function exportConfigurationPackageAction(
  organizationId: string,
): Promise<ExportConfigPackageActionState> {
  const sessionUser = await requireSuperAdmin();

  // Calcular versión para este tipo de export
  const count = await prisma.platformDeploymentExportLog.count({
    where: {
      organization_id: organizationId,
      export_type:     "CONFIGURATION_PACKAGE",
      result:          "SUCCESS",
    },
  });
  const version = `v${count + 1}`;

  const { bundle, validation } = await getDeploymentBundleQuery(
    organizationId,
    sessionUser.id,
    version,
  );

  if (!validation.valid || !bundle) {
    await prisma.platformDeploymentExportLog.create({
      data: {
        organization_id: organizationId,
        export_type:     "CONFIGURATION_PACKAGE",
        bundle_version:  version,
        exported_by:     sessionUser.id,
        result:          "FAILED",
        error_message:   validation.errors.join("; "),
      },
    });

    revalidatePath(`/dashboard/platform/deployment-preparation/${organizationId}`);
    revalidatePath("/dashboard/platform/deployment-exports");

    return { success: false, validation };
  }

  // Construir paquete simplificado
  const pkg: ConfigurationPackage = {
    branding:      bundle.branding,
    modules:       bundle.modules.map((m) => ({
      code:     m.code,
      name:     m.name,
      category: m.category,
    })),
    license:       bundle.license,
    configuration: bundle.configuration,
    metadata:      bundle.metadata,
  };

  const log = await prisma.platformDeploymentExportLog.create({
    data: {
      organization_id: organizationId,
      export_type:     "CONFIGURATION_PACKAGE",
      bundle_version:  version,
      exported_by:     sessionUser.id,
      result:          "SUCCESS",
      bundle_snapshot: pkg as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/dashboard/platform/deployment-preparation/${organizationId}`);
  revalidatePath("/dashboard/platform/deployment-exports");
  revalidatePath("/dashboard/platform/deployment-preparation");

  return {
    success: true,
    pkg,
    version,
    log_id: log.id,
  };
}
