// ─────────────────────────────────────────────────────────────────
// commerce/dte — get-active-dte-issuer-config.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { DteIssuerConfigDetail, DteEnvironment } from "../types/dte.types";

export async function getActiveDteIssuerConfig(
  tenant_id:   string,
  location_id: string,
  environment: DteEnvironment,
): Promise<DteIssuerConfigDetail | null> {
  const row = await prisma.dteIssuerConfig.findFirst({
    where: {
      tenant_id,
      location_id,
      environment,
      is_active: true,
    },
    select: {
      id:                      true,
      tenant_id:               true,
      location_id:             true,
      environment:             true,
      nit:                     true,
      nrc:                     true,
      name:                    true,
      legal_name:              true,
      activity_code:           true,
      activity_name:           true,
      establishment_code:      true,
      establishment_type_code: true,
      point_of_sale_code:      true,
      dept_code:               true,
      municipality_code:       true,
      address_complement:      true,
      phone:                   true,
      email:                   true,
      is_active:               true,
      created_at:              true,
      updated_at:              true,
      created_by:              true,
      updated_by:              true,
    },
  });

  if (!row) return null;

  return {
    ...row,
    environment: row.environment as DteEnvironment,
  };
}
