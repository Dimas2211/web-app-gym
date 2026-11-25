import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import { membershipToday } from "./membership-validity";

/** Inject the effective runtime DB; legacy PLATFORM_NATIVE callers use the normal singleton. */
export async function getMembershipToday(db: PrismaClient = prisma, tenantId: string, now = new Date()): Promise<string> {
  if (!tenantId) throw new Error("Tenant requerido para resolver la fecha del gimnasio.");
  const settings = await db.gymSettings.findFirst({
    where: { gym: { tenant_id: tenantId } },
    select: { timezone: true },
  });
  return membershipToday(settings?.timezone, now);
}
