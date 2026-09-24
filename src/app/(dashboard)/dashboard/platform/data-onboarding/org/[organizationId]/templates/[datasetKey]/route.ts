// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/data-onboarding/org/[organizationId]/templates/[datasetKey]
//
// SHARED-OPS-PARITY-1. Descarga de plantillas Excel organization-scoped
// (Shared o Dedicated). Mismas reglas que la ruta histórica por perfil:
// solo super_admin, sin credenciales, sin consultar la base cliente,
// workbook generado en memoria.
// ─────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

import { requireSuperAdmin }                from "@/lib/permissions/guards";
import { controlPlanePrisma }               from "@/modules/platform/runtime/control-plane-prisma";
import { generateDataOnboardingTemplate, TEMPLATE_AVAILABLE_KEYS }
  from "@/modules/platform/lib/data-onboarding/excel-template-generator";
import { DATA_ONBOARDING_DATASETS_BY_KEY }
  from "@/modules/platform/lib/data-onboarding/data-onboarding-definitions";
import type { DataOnboardingDatasetKey }    from "@/modules/platform/types/platform.types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; datasetKey: string }> },
) {
  await requireSuperAdmin();

  const { organizationId, datasetKey } = await params;

  if (!TEMPLATE_AVAILABLE_KEYS.has(datasetKey as DataOnboardingDatasetKey)) {
    return NextResponse.json(
      { error: "Dataset no válido o plantilla no disponible." },
      { status: 400 },
    );
  }

  const def = DATA_ONBOARDING_DATASETS_BY_KEY[datasetKey as DataOnboardingDatasetKey];
  if (!def || (def.direction !== "IMPORT" && def.direction !== "BOTH")) {
    return NextResponse.json(
      { error: "Este dataset no soporta importación." },
      { status: 400 },
    );
  }

  // Solo metadata pública de la organización — sin credenciales ni runtime.
  const organization = await controlPlanePrisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: { id: true, code: true, name: true },
  });
  if (!organization) {
    return NextResponse.json({ error: "Organización no encontrada." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = generateDataOnboardingTemplate(
      datasetKey as DataOnboardingDatasetKey,
      organization.name,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error generando plantilla";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const sanitizedCode = organization.code
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);

  const filename = `template-${datasetKey}-${sanitizedCode}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
