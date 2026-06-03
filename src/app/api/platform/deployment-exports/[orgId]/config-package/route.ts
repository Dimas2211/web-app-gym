// ─────────────────────────────────────────────────────────────────
// API — /api/platform/deployment-exports/[orgId]/config-package
//
// Genera y descarga un Configuration Package JSON bajo demanda.
// Requiere sesión super_admin válida.
// ─────────────────────────────────────────────────────────────────

import { NextResponse }      from "next/server";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";
import { getDeploymentBundleQuery } from "@/modules/platform/queries/get-deployment-bundle";
import type { ConfigurationPackage } from "@/modules/platform/types/platform.types";

interface Params {
  params: Promise<{ orgId: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const sessionUser = await requireSuperAdmin();
    const { orgId } = await params;

    const count = await prisma.platformDeploymentExportLog.count({
      where: {
        organization_id: orgId,
        export_type:     "CONFIGURATION_PACKAGE",
        result:          "SUCCESS",
      },
    });
    const version = `v${count + 1}`;

    const { bundle, validation } = await getDeploymentBundleQuery(
      orgId,
      sessionUser.id,
      version,
    );

    if (!validation.valid || !bundle) {
      return NextResponse.json(
        { error: "Paquete no disponible.", errors: validation.errors },
        { status: 422 },
      );
    }

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

    const fileName = `configuration-package-${bundle.organization.code}-${version}.json`;
    const body     = JSON.stringify(pkg, null, 2);

    return new Response(body, {
      headers: {
        "Content-Type":        "application/json",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
}
