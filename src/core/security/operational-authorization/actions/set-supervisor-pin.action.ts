"use server";

// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — set-supervisor-pin.action.ts
//
// Establece, cambia o restablece la Clave de Supervisor del tenant
// efectivo (Configuración → Seguridad). Escribe SOLO el hash bcrypt en
// la Runtime DB efectiva (context.client). Nunca devuelve ni registra
// la clave ni el hash. Restablecer = introducir una nueva (no existe
// recuperación del valor anterior).
//
// Permiso: requireGlobalAdmin + rol LIVE isGlobal. Support Session
// (read-only) bloqueada por requireOperationalContext({ write: true }).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { requireGlobalAdmin } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { setSupervisorPin, validateNewSupervisorPin } from "../supervisor-pin";

export type SetSupervisorPinState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | undefined;

export async function setSupervisorPinAction(
  _prev: SetSupervisorPinState,
  formData: FormData,
): Promise<SetSupervisorPinState> {
  const sessionUser = await requireGlobalAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!getCapabilities(context.effectiveUser.role as UserRole).isGlobal) {
      return { ok: false, error: "Solo el administrador principal puede configurar la clave de supervisor." };
    }

    const pin = formData.get("new_pin");
    const confirmation = formData.get("confirm_pin");
    const newPin = typeof pin === "string" ? pin : "";
    const confirmPin = typeof confirmation === "string" ? confirmation : "";

    const invalid = validateNewSupervisorPin(newPin, confirmPin);
    if (invalid) return { ok: false, error: invalid };

    await setSupervisorPin(context.client, context.tenantId, context.effectiveUser.id, newPin);

    revalidatePath("/dashboard/settings/security");
    revalidatePath("/dashboard/settings");
    return {
      ok: true,
      message: "Clave de supervisor guardada. Las autorizaciones emitidas con la clave anterior quedaron revocadas.",
    };
  } finally {
    await dispose();
  }
}
