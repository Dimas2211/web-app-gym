"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — create-cash-register.action.ts
//
// Crea una caja (CashRegister) activa en la location efectiva.
// Input del browser: solo code y name. tenant_id, location_id,
// is_active=true y auditoría se fijan en servidor.
// Capacidad: commerce.cash_registers.max (+1, transaccional).
//
// Permiso: requireAdmin + commerce.cash (write).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { createCashRegisterInputSchema, type CreateCashRegisterInput } from "../schemas/cash.schemas";
import { createCashRegister, type CashRegisterAdminResult } from "../services/cash-register-admin.service";
import { runCashRegisterAdmin } from "./run-cash-register-admin";

export async function createCashRegisterAction(
  input: CreateCashRegisterInput,
): Promise<CashRegisterAdminResult> {
  return runCashRegisterAdmin<CashRegisterAdminResult>(async ({ scope, db, commercialCtx }) => {
    const parsed = createCashRegisterInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos para la caja." };
    }

    const result = await createCashRegister(scope, parsed.data, db, commercialCtx);
    if (result.ok) revalidatePath("/dashboard/cash");
    return result;
  });
}
