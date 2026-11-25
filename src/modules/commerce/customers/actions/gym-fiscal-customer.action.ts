"use server";

import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { requireLiveOperationalContext } from "@/modules/platform/runtime/require-live-operational-context";
import { OperationalContextError } from "@/modules/platform/runtime/require-operational-context";
import {
  resolveEffectiveVerticalCode,
  hasEffectiveVertical,
} from "@/modules/platform/runtime/effective-vertical";
import { CustomerGymError } from "../services/customer-gym.service";
import { prepareGymFiscalCustomer, saveGymFiscalCustomer, validateGymFiscalInput } from "../services/gym-fiscal-customer.service";
import type { CreateCustomerInput } from "../schemas/customer.schemas";
import type { CreateCustomerActionResult } from "./create-customer.action";

async function openGymContext() {
  const user = await requireAdmin();
  const handle = await requireLiveOperationalContext(user, {
    module: "core.customers",
    write: true,
  });
  try {
    const commercial = handle.context.commercialContext;
    if (
      !commercial ||
      !hasEffectiveVertical(commercial, await resolveEffectiveVerticalCode(commercial), "GYM")
    ) {
      throw new CustomerGymError("Esta función solo está disponible para la vertical Gym.");
    }
    if (
      !handle.context.gymId ||
      !["super_admin", "branch_admin"].includes(handle.context.effectiveUser.role)
    ) {
      throw new CustomerGymError("Sin permisos para gestionar clientes de gimnasio.");
    }
    return handle;
  } catch (err) {
    await handle.dispose();
    throw err;
  }
}

function message(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof CustomerGymError) return error.message;
  if (error instanceof OperationalContextError) return error.userMessage;
  // Unique collision (e.g. simultaneous ordinary Gym registration): retry without partial writes.
  if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    return "Otro registro se guardó al mismo tiempo. Actualiza e intenta nuevamente.";
  }
  console.error("[customer-gym] Operation failed", error);
  return "No se pudo completar la operación. Intenta nuevamente.";
}


export async function prepareGymFiscalCustomerAction(clientId: string, search = "") {
  if (!z.string().uuid().safeParse(clientId).success || typeof search !== "string" || search.length > 150) {
    return { ok: false as const, error: "Datos no válidos." };
  }
  let handle;
  try {
    handle = await openGymContext();
    return { ok: true as const, data: await prepareGymFiscalCustomer(handle.context, clientId, search) };
  } catch (error) { return { ok: false as const, error: message(error) }; }
  finally { await handle?.dispose(); }
}

export async function createFiscalCustomerForGymAction(clientId: string, input: CreateCustomerInput): Promise<CreateCustomerActionResult> {
  if (!z.string().uuid().safeParse(clientId).success) return { ok: false, error: "Cliente Gym no válido." };
  const parsed = validateGymFiscalInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error, errors: parsed.errors };
  let handle;
  try {
    handle = await openGymContext();
    const result = await saveGymFiscalCustomer(handle.context, clientId, { input: parsed.data });
    revalidatePath("/dashboard/customers");
    revalidatePath("/dashboard/clients");
    revalidatePath(`/dashboard/clients/${clientId}`);
    return { ok: true, ...result };
  } catch (error) { return { ok: false, error: message(error) }; }
  finally { await handle?.dispose(); }
}

export async function linkFiscalCustomerForGymAction(clientId: string, customerId: string) {
  if (!z.string().uuid().safeParse(clientId).success || !z.string().uuid().safeParse(customerId).success) {
    return { ok: false as const, error: "Datos no válidos." };
  }
  let handle;
  try {
    handle = await openGymContext();
    const result = await saveGymFiscalCustomer(handle.context, clientId, { customerId });
    revalidatePath("/dashboard/customers");
    revalidatePath("/dashboard/clients");
    revalidatePath(`/dashboard/clients/${clientId}`);
    return { ok: true as const, ...result };
  } catch (error) { return { ok: false as const, error: message(error) }; }
  finally { await handle?.dispose(); }
}
