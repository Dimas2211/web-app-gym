// ─────────────────────────────────────────────────────────────────
// platform — get-platform-branding.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PlatformBrandingData } from "../types/platform.types";

export async function getPlatformBrandingQuery(
  organizationId: string,
): Promise<PlatformBrandingData | null> {
  const row = await prisma.platformBranding.findUnique({
    where: { organization_id: organizationId },
    select: {
      id:              true,
      organization_id: true,
      primary_color:   true,
      secondary_color: true,
      logo_url:        true,
      favicon_url:     true,
      custom_domain:   true,
      updated_at:      true,
    },
  });

  return row;
}
