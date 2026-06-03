// ─────────────────────────────────────────────────────────────────
// API — /api/platform/deployment-exports/[orgId]/bundle
//
// Genera y descarga un Deployment Bundle JSON bajo demanda.
// Requiere sesión super_admin válida.
// ─────────────────────────────────────────────────────────────────

import { NextResponse }      from "next/server";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { getDeploymentBundleQuery, getNextBundleVersion } from "@/modules/platform/queries/get-deployment-bundle";

interface Params {
  params: Promise<{ orgId: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const sessionUser = await requireSuperAdmin();
    const { orgId } = await params;

    const nextVersion = await getNextBundleVersion(orgId);
    const { bundle, validation } = await getDeploymentBundleQuery(
      orgId,
      sessionUser.id,
      nextVersion,
    );

    if (!validation.valid || !bundle) {
      return NextResponse.json(
        { error: "Bundle no disponible.", errors: validation.errors },
        { status: 422 },
      );
    }

    const fileName = `deployment-bundle-${bundle.organization.code}-${nextVersion}.json`;
    const body     = JSON.stringify(bundle, null, 2);

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
