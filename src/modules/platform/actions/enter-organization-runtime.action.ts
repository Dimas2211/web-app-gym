"use server";

// ─────────────────────────────────────────────────────────────────
// platform — enter-organization-runtime.action.ts
//
// SHARED-OPS-PARITY-1. "Operar como cliente" ORGANIZATION-SCOPED.
// Mismo comportamiento que enterClientRuntimeAction (PASO 6A) pero la
// identidad de entrada es la ORGANIZACIÓN, no un perfil — funciona igual
// para Dedicated y Shared. Nunca se entra "como Shared Runtime Target":
// el target (1 base física → N organizaciones) no identifica un tenant.
//
// Reglas de seguridad:
// - Solo super_admin.
// - organizationId es solo un identificador: runtime (target/perfil),
//   tenantId y nombres se resuelven SERVER-SIDE desde el Control Plane.
// - La sesión creada siempre es readOnly: true (sin ampliar permisos).
// - Nunca persiste ni loguea credenciales.
// ─────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import {
  resolveOrganizationRuntime,
  isOrganizationRuntimeResolutionError,
  type ResolvedOrganizationRuntime,
} from "../runtime/resolve-organization-runtime";
import { setRuntimeSession } from "../runtime/runtime-session";

const PROFILES_PATH = "/dashboard/platform/database-profiles";

function fail(message: string): never {
  redirect(`${PROFILES_PATH}?runtimeError=${encodeURIComponent(message)}`);
}

/**
 * Server Action para `<form action={enterOrganizationRuntimeAction}>` con
 * un `<input type="hidden" name="organizationId">`. Siempre redirige: a
 * /dashboard/products en éxito, o a Perfiles de BD con `?runtimeError=`.
 */
export async function enterOrganizationRuntimeAction(formData: FormData): Promise<void> {
  const user = await requireSuperAdmin();

  const organizationId = formData.get("organizationId");
  if (typeof organizationId !== "string" || !organizationId.trim()) {
    fail("ID de organización requerido.");
  }

  let resolved: ResolvedOrganizationRuntime;
  try {
    resolved = await resolveOrganizationRuntime({ organizationId: organizationId.trim() });
  } catch (err) {
    fail(
      isOrganizationRuntimeResolutionError(err)
        ? err.message
        : "No se pudo resolver el runtime de la organización.",
    );
  }

  const { header, profile } = resolved;

  await setRuntimeSession({
    organizationId:   header.organizationId,
    profileId:        profile.id,
    tenantId:         header.tenantId,
    organizationName: header.organizationName,
    profileLabel:     header.runtimeLabel,
    readOnly:         true,
    startedByUserId:  user.id,
    startedAt:        new Date().toISOString(),
    runtimeKind:      header.runtimeKind,
  });

  redirect("/dashboard/products");
}
