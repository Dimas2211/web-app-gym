// ─────────────────────────────────────────────────────────────────
// commerce/dte — list-dte-issuer-configs.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { DteIssuerConfigDetail, DteEnvironment } from "../types/dte.types";
import type { DteIssuerConfigFilters } from "../schemas/dte-issuer-config.schemas";

export async function listDteIssuerConfigs(
  filters: DteIssuerConfigFilters,
): Promise<DteIssuerConfigDetail[]> {
  const { tenant_id, location_id, environment, is_active } = filters;

  const rows = await prisma.dteIssuerConfig.findMany({
    where: {
      tenant_id,
      location_id,
      ...(environment !== undefined && { environment }),
      ...(is_active   !== undefined && { is_active }),
    },
    orderBy: [{ environment: "asc" }, { created_at: "asc" }],
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
      cod_estable_mh:          true,
      cod_punto_venta_mh:      true,
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

  return rows.map((r) => ({
    ...r,
    environment: r.environment as DteEnvironment,
  }));
}
