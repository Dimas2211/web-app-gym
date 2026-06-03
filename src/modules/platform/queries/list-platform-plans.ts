// ─────────────────────────────────────────────────────────────────
// platform — list-platform-plans.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PlatformPlanItem } from "../types/platform.types";

export async function listPlatformPlansQuery(
  onlyActive = false,
): Promise<PlatformPlanItem[]> {
  const rows = await prisma.platformPlan.findMany({
    where:   onlyActive ? { is_active: true } : {},
    select: {
      id:            true,
      code:          true,
      name:          true,
      description:   true,
      billing_cycle: true,
      price_monthly: true,
      price_annual:  true,
      max_locations: true,
      max_users:     true,
      is_active:     true,
      created_at:    true,
    },
    orderBy: { name: "asc" },
  });

  return rows.map((r) => ({
    id:            r.id,
    code:          r.code,
    name:          r.name,
    description:   r.description,
    billing_cycle: r.billing_cycle as PlatformPlanItem["billing_cycle"],
    price_monthly: r.price_monthly ? Number(r.price_monthly) : null,
    price_annual:  r.price_annual  ? Number(r.price_annual)  : null,
    max_locations: r.max_locations,
    max_users:     r.max_users,
    is_active:     r.is_active,
    created_at:    r.created_at,
  }));
}
