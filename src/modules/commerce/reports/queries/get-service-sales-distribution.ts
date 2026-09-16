// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-service-sales-distribution.ts
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { ServiceDistributionItem } from "../types/commerce-report.types";
import { getTopSoldServices } from "./get-top-sold-services";

export async function getServiceSalesDistribution(
  filters: CommerceReportFilters,
  limit = 10,
  client: PrismaClient = prisma,
): Promise<ServiceDistributionItem[]> {
  const services = await getTopSoldServices(filters, limit, "total", client);

  const grandTotal = services.reduce((sum, s) => sum + s.total, 0);

  return services.map((s) => ({
    name:       s.name,
    total:      s.total,
    percentage: grandTotal > 0 ? Math.round((s.total / grandTotal) * 1000) / 10 : 0,
  }));
}
