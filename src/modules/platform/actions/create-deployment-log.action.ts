"use server";

// ─────────────────────────────────────────────────────────────────
// platform — create-deployment-log.action.ts
//
// Registra manualmente un evento de deployment/provisioning.
// Útil para registrar cambios manuales externos (migraciones,
// actualizaciones de infraestructura, etc.) que no tienen acción
// automática en el sistema.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const createDeploymentLogSchema = z.object({
  organization_id: z.string().uuid(),
  action:          z.string().min(1).max(100).trim(),
  status:          z.enum(["SUCCESS", "FAILED", "ROLLBACK"]),
  notes:           z.string().max(1000).trim().nullable().optional(),
});

export type PlatformActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function createDeploymentLogAction(
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const sessionUser = await requireSuperAdmin();

  const raw = {
    organization_id: formData.get("organization_id") as string,
    action:          formData.get("action")          as string,
    status:          formData.get("status")          as string,
    notes:           formData.get("notes")           || null,
  };

  const parsed = createDeploymentLogSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const org = await prisma.platformOrganization.findUnique({
    where:  { id: parsed.data.organization_id },
    select: { id: true },
  });
  if (!org) return { error: "Organización no encontrada." };

  await prisma.platformDeploymentLog.create({
    data: {
      organization_id: parsed.data.organization_id,
      action:          parsed.data.action,
      status:          parsed.data.status,
      notes:           parsed.data.notes ?? null,
      triggered_by:    sessionUser.id,
      started_at:      new Date(),
      ended_at:        new Date(),
    },
  });
}
