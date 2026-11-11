"use server";

import { requireAdmin } from "@/lib/permissions/guards";
import { requireOperationalContext, OperationalContextError } from "@/modules/platform/runtime/require-operational-context";

export async function getCustomerCountriesAction(): Promise<
  { ok: true; items: { code: string; name: string }[] } | { ok: false; error: string }
> {
  const user = await requireAdmin();
  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "core.customers", write: false });
  } catch (error) {
    if (error instanceof OperationalContextError) return { ok: false, error: error.userMessage };
    throw error;
  }
  try {
    const items = await handle.context.client.country.findMany({
      where: { status: "active" },
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    });
    return { ok: true, items };
  } finally {
    await handle.dispose();
  }
}
