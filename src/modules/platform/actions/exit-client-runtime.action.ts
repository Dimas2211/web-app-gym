"use server";

// ─────────────────────────────────────────────────────────────────
// platform — exit-client-runtime.action.ts
//
// PASO 6A — Cierra la sesión runtime "Operar como cliente" y vuelve
// al modo normal (dashboard con los datos propios del super_admin).
// No requiere profileId: siempre borra la cookie activa, si existe.
// ─────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { clearRuntimeSession } from "../runtime/runtime-session";

export async function exitClientRuntimeAction(): Promise<void> {
  await requireSuperAdmin();
  await clearRuntimeSession();
  redirect("/dashboard/platform/database-profiles");
}
