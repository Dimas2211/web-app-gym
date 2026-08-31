"use server";

// ─────────────────────────────────────────────────────────────────
// platform — enter-client-runtime.action.ts
//
// PASO 6A — Abre la sesión runtime "Operar como cliente" y redirige
// al dashboard real (/dashboard/products). A partir de ese momento,
// y hasta que se cierre la sesión (exit-client-runtime.action.ts) o
// expire la cookie, las páginas runtime-aware del dashboard leen la
// base del perfil indicado en vez de la del tenant propio del
// super_admin.
//
// Reglas de seguridad:
// - Solo super_admin (requireSuperAdmin).
// - Exige organization.tenant_id vinculado (igual que Support Session) —
//   si falta, no abre sesión.
// - La sesión creada siempre es readOnly: true.
// - Nunca persiste ni loguea credenciales — solo usa
//   resolveRuntimeDatabaseProfileById para validar que el perfil existe,
//   está activo y tiene tenant vinculado.
// ─────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import {
  resolveRuntimeDatabaseProfileById,
  RuntimeDatabaseRouterError,
} from "../runtime/runtime-database-router";
import { setRuntimeSession } from "../runtime/runtime-session";

const PROFILES_PATH = "/dashboard/platform/database-profiles";

/**
 * Server Action apta para `<form action={enterClientRuntimeAction.bind(null, profileId)}>`.
 * Siempre redirige: a /dashboard/products en éxito, o de vuelta a la
 * lista de perfiles con `?runtimeError=` en fallo (el form action de
 * React Server Components no puede devolver un valor no-void aquí sin
 * useActionState, así que el error viaja por query string en vez de
 * un return tipado).
 */
export async function enterClientRuntimeAction(profileId: string): Promise<void> {
  const user = await requireSuperAdmin();

  if (!profileId || typeof profileId !== "string") {
    redirect(`${PROFILES_PATH}?runtimeError=${encodeURIComponent("ID de perfil requerido.")}`);
  }

  let profile;
  try {
    profile = await resolveRuntimeDatabaseProfileById(profileId);
  } catch (err) {
    const message = err instanceof RuntimeDatabaseRouterError
      ? err.message
      : "No se pudo resolver el perfil de base de datos.";
    redirect(`${PROFILES_PATH}?runtimeError=${encodeURIComponent(message)}`);
  }

  await setRuntimeSession({
    organizationId:   profile.organizationId,
    profileId:        profile.id,
    tenantId:         profile.tenantId,
    organizationName: profile.organizationName,
    profileLabel:     profile.label,
    readOnly:         true,
    startedByUserId:  user.id,
    startedAt:        new Date().toISOString(),
  });

  redirect("/dashboard/products");
}
