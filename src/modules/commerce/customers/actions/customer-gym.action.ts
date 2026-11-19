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
import {
  CustomerGymError,
  prepareCustomerGym,
  saveCustomerGym,
} from "../services/customer-gym.service";

const inputSchema = z.object({
  customer_id: z.string().uuid(),
  existing_client_id: z.string().uuid().optional(),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  branch_id: z.string().uuid().optional(),
  document_id: z.string().max(50).optional(),
  email: z.string().max(254).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(255).optional(),
});

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

export async function prepareCustomerGymAction(customerId: string, search = "") {
  if (
    !z.string().uuid().safeParse(customerId).success ||
    typeof search !== "string" ||
    search.length > 150
  ) {
    return { ok: false as const, error: "Datos no válidos." };
  }
  let handle;
  try {
    handle = await openGymContext();
    return {
      ok: true as const,
      data: await prepareCustomerGym(handle.context, customerId, search),
    };
  } catch (err) {
    return { ok: false as const, error: message(err) };
  } finally {
    await handle?.dispose();
  }
}

export async function saveCustomerGymAction(input: z.infer<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Datos no válidos." };
  let handle;
  try {
    handle = await openGymContext();
    const clientId = await saveCustomerGym(handle.context, parsed.data);
    revalidatePath("/dashboard/clients");
    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/clients/${clientId}`);
    return { ok: true as const, clientId };
  } catch (err) {
    return { ok: false as const, error: message(err) };
  } finally {
    await handle?.dispose();
  }
}
