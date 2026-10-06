"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — update-cash-register.action.ts
//
// Edita code y name de una caja de la location efectiva.
// No consume capacidad ni toca sesiones/movimientos.
//
// Permiso: requireAdmin + commerce.cash (write).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { updateCashRegisterInputSchema, type UpdateCashRegisterInput } from "../schemas/cash.schemas";
import { updateCashRegister, type CashRegisterAdminResult } from "../services/cash-register-admin.service";
import { runCashRegisterAdmin } from "./run-cash-register-admin";

export async function updateCashRegisterAction(
  input: UpdateCashRegisterInput,
): Promise<CashRegisterAdminResult> {
  return runCashRegisterAdmin<CashRegisterAdminResult>(async ({ scope, db }) => {
    const parsed = updateCashRegisterInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos para la caja." };
    }

    const result = await updateCashRegister(scope, parsed.data, db);
    if (result.ok) revalidatePath("/dashboard/cash");
    return result;
  });
}
