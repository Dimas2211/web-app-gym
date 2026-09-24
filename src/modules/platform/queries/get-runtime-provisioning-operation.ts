// ─────────────────────────────────────────────────────────────────
// platform — get-runtime-provisioning-operation.ts
//
// SHARED-PILOT-4B. Estado de la operación de alta runtime de una
// organización, para el panel Runtime (Provisionando / Falló —
// Reintentar). NUNCA selecciona idempotency_key: la key es solo
// server-side y el browser no puede ni verla ni elegirla.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface RuntimeProvisioningOperationSummary {
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  lastError: string | null;
  attemptCount: number;
}

export async function getRuntimeProvisioningOperationQuery(
  organizationId: string,
): Promise<RuntimeProvisioningOperationSummary | null> {
  const operation = await prisma.platformRuntimeProvisioningOperation.findUnique({
    where:  { organization_id: organizationId },
    select: { status: true, last_error: true, attempt_count: true },
  });
  if (!operation) return null;
  return {
    status:       operation.status,
    lastError:    operation.last_error,
    attemptCount: operation.attempt_count,
  };
}
