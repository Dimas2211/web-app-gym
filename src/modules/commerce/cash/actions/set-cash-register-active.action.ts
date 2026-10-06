"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — set-cash-register-active.action.ts
//
// Desactiva (sin sesión OPEN; libera capacidad) o reactiva (consume
// capacidad commerce.cash_registers.max) una caja de la location
// efectiva. Sin borrado físico.
//
// Permiso: requireAdmin + commerce.cash (write).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { setCashRegisterActiveInputSchema, type SetCashRegisterActiveInput } from "../schemas/cash.schemas";
import { setCashRegisterActive, type CashRegisterAdminResult } from "../services/cash-register-admin.service";
import { runCashRegisterAdmin } from "./run-cash-register-admin";

export async function setCashRegisterActiveAction(
  input: SetCashRegisterActiveInput,
): Promise<CashRegisterAdminResult> {
  return runCashRegisterAdmin<CashRegisterAdminResult>(async ({ scope, db, commercialCtx }) => {
    const parsed = setCashRegisterActiveInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos para la caja." };
    }

    const result = await setCashRegisterActive(scope, parsed.data, db, commercialCtx);
    if (result.ok) revalidatePath("/dashboard/cash");
    return result;
  });
}
