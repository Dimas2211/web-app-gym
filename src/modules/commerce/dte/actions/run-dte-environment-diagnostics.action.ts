"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — run-dte-environment-diagnostics.action.ts
//
// "Probar conexión y firma" — /dashboard/settings/dte.
//
// El navegador solo envía el ambiente (TEST | PRODUCTION). Tenant,
// location, emisor y base runtime se resuelven en servidor con el MISMO
// guard que administra credenciales (requireAdmin + requireOperationalContext
// con write: true → Support Session read-only sigue bloqueada). Nunca se
// acepta un issuerConfigId ni una URL desde el cliente.
//
// No cambia estado: no hace revalidatePath, no activa ambientes, no
// marca READY_*/ACCEPTED. El resultado no contiene secretos.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";
import { requireAdmin } from "@/lib/permissions/guards";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import {
  runDteEnvironmentDiagnostics,
  type DteEnvironmentDiagnosticsResult,
} from "../services/dte-environment-diagnostics.service";

export type RunDteEnvironmentDiagnosticsActionResult =
  | { ok: true; result: DteEnvironmentDiagnosticsResult }
  | { ok: false; error: string };

const inputSchema = z.object({ environment: z.enum(["TEST", "PRODUCTION"]) });

export async function runDteEnvironmentDiagnosticsAction(
  input: { environment: string },
): Promise<RunDteEnvironmentDiagnosticsActionResult> {
  const sessionUser = await requireAdmin();

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Ambiente inválido." };
  }

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!context.locationId) {
      return { ok: false, error: "Selecciona una location activa." };
    }

    const outcome = await runDteEnvironmentDiagnostics({
      tenantId:    context.tenantId,
      locationId:  context.locationId,
      environment: parsed.data.environment,
      client:      context.client,
    });

    if (!outcome.ok) {
      return { ok: false, error: "Ya hay una prueba en curso para este ambiente. Espere a que termine." };
    }
    return { ok: true, result: outcome.result };
  } finally {
    await dispose();
  }
}
