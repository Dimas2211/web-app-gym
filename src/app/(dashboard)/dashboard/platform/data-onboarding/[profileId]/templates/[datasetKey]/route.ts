// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/data-onboarding/[profileId]/templates/[datasetKey]
//
// E1A: Endpoint de descarga de plantillas Excel.
// Solo super_admin. Valida profileId y datasetKey.
// Genera el workbook en memoria y lo retorna como .xlsx.
//
// Reglas de seguridad E1A:
// - No carga encrypted_password ni DATABASE_URL.
// - No construye connection string.
// - No consulta la base destino (cliente).
// - No usa Prisma dinámico.
// - No procesa archivos subidos.
// - No escribe datos.
// - No ejecuta seeds ni migraciones.
// ─────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

import { requireSuperAdmin }                from "@/lib/permissions/guards";
import { prisma }                           from "@/lib/db/prisma";
import { generateDataOnboardingTemplate, TEMPLATE_AVAILABLE_KEYS }
  from "@/modules/platform/lib/data-onboarding/excel-template-generator";
import { DATA_ONBOARDING_DATASETS_BY_KEY }
  from "@/modules/platform/lib/data-onboarding/data-onboarding-definitions";
import type { DataOnboardingDatasetKey }    from "@/modules/platform/types/platform.types";

// ── Route handler ─────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ profileId: string; datasetKey: string }> },
) {
  // 1. Autenticación — solo super_admin
  await requireSuperAdmin();

  const { profileId, datasetKey } = await params;

  // 2. Validar que el datasetKey sea una clave con plantilla E1A disponible
  if (!TEMPLATE_AVAILABLE_KEYS.has(datasetKey as DataOnboardingDatasetKey)) {
    return NextResponse.json(
      { error: "Dataset no válido o plantilla no disponible en E1A." },
      { status: 400 },
    );
  }

  // 3. Confirmar que el dataset soporta IMPORT o BOTH
  const def = DATA_ONBOARDING_DATASETS_BY_KEY[datasetKey as DataOnboardingDatasetKey];
  if (!def || (def.direction !== "IMPORT" && def.direction !== "BOTH")) {
    return NextResponse.json(
      { error: "Este dataset no soporta importación." },
      { status: 400 },
    );
  }

  // 4. Validar que el perfil existe — sin cargar credenciales
  const profile = await prisma.platformDatabaseProfile.findUnique({
    where:  { id: profileId },
    select: { id: true, label: true },
  });

  if (!profile) {
    return NextResponse.json({ error: "Perfil de base de datos no encontrado." }, { status: 404 });
  }

  // 5. Generar workbook en memoria — sin consultar base cliente
  let buffer: Buffer;
  try {
    buffer = generateDataOnboardingTemplate(
      datasetKey as DataOnboardingDatasetKey,
      profile.label,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error generando plantilla";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // 6. Sanitizar nombre del perfil para el filename
  const sanitizedLabel = profile.label
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);

  const filename = `template-${datasetKey}-${sanitizedLabel}.xlsx`;

  // 7. Retornar archivo — sin escribir datos en ninguna base
  // Buffer → Uint8Array para compatibilidad con BodyInit de la Web API
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
