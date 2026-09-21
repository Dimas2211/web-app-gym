"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-invalidation-event.action.ts
//
// Server Action: firma un DteInvalidationEvent en estado DRAFT.
//
// Reglas:
//   - Sesión requerida (requireAdmin).
//   - tenant_id y location_id se inyectan desde sesión.
//   - No devuelve JWS ni secretos al frontend.
//
// FASE VI-E6B — reemplaza requireAdmin + getEffectiveLocationId +
// resolveCommercialEnforcementContext manual por
// requireOperationalContext, mismo patrón que create-invalidation-event.action.ts.
// ─────────────────────────────────────────────────────────────────

import { z }                         from "zod";
import { revalidatePath }            from "next/cache";
import { requireAdmin }              from "@/lib/permissions/guards";
import { signInvalidationEvent }     from "../services/sign-invalidation-event.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

// ── Zod schema ────────────────────────────────────────────────────

const signInvalidationEventInputSchema = z.object({
  invalidationEventId: z.string().uuid(
    "El ID del evento de invalidación debe ser un UUID válido.",
  ),
});

export type SignInvalidationEventInput = z.infer<typeof signInvalidationEventInputSchema>;

// ── Tipos de resultado ────────────────────────────────────────────

export type SignInvalidationEventActionResult =
  | { ok: true;  status: "SIGNED"; signedAt: string }
  | { ok: false; message: string; errors?: Record<string, string[]> };

// ── Action ────────────────────────────────────────────────────────

export async function signInvalidationEventAction(
  invalidationEventId: string,
): Promise<SignInvalidationEventActionResult> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, message: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!context.locationId) {
      return { ok: false, message: "La sesión no tiene una location activa." };
    }

    const parsed = signInvalidationEventInputSchema.safeParse({ invalidationEventId });
    if (!parsed.success) {
      return {
        ok:      false,
        message: "ID del evento de invalidación no válido.",
        errors:  parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const result = await signInvalidationEvent(
      {
        invalidationEventId: parsed.data.invalidationEventId,
        userId:              context.effectiveUser.id,
        tenantId:            context.tenantId,
        locationId:          context.locationId,
      },
      context.client,
    );

    if (!result.ok) {
      return { ok: false, message: result.error };
    }

    revalidatePath("/dashboard/dte/outgoing");

    return {
      ok:       true,
      status:   "SIGNED",
      signedAt: result.signedAt,
    };
  } finally {
    await dispose();
  }
}
