"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — upsert-dte-issuer-config-for-client.action.ts
//
// Wrapper de UI para /dashboard/settings/dte — crea o edita la
// DteIssuerConfig de un ambiente (TEST/PRODUCTION) para el tenant +
// location de la SESIÓN actual. Reutiliza createDteIssuerConfig /
// updateDteIssuerConfig ya existentes (dte-issuer-config.service.ts)
// — no se reimplementa esa lógica, solo se deriva el contexto desde
// la sesión en vez de recibirlo del cliente.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  createDteIssuerConfigSchema,
  updateDteIssuerConfigSchema,
} from "../schemas/dte-issuer-config.schemas";
import { createDteIssuerConfig, updateDteIssuerConfig } from "../services/dte-issuer-config.service";

export type UpsertDteIssuerConfigForClientState =
  | { errors?: Record<string, string[]>; error?: string; success?: false }
  | { success: true }
  | undefined;

// ── Crear (siempre para un ambiente nuevo — TEST o PRODUCTION) ────

export async function createDteIssuerConfigForClientAction(
  _prev: UpsertDteIssuerConfigForClientState,
  formData: FormData,
): Promise<UpsertDteIssuerConfigForClientState> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "Selecciona una location activa para configurar el emisor DTE." };

  const raw = {
    environment:              formData.get("environment"),
    nit:                      formData.get("nit"),
    nrc:                      formData.get("nrc") || null,
    name:                     formData.get("name"),
    legal_name:               formData.get("legal_name") || null,
    activity_code:            formData.get("activity_code") || null,
    activity_name:            formData.get("activity_name") || null,
    establishment_code:       formData.get("establishment_code") || null,
    establishment_type_code:  formData.get("establishment_type_code") || null,
    point_of_sale_code:       formData.get("point_of_sale_code") || null,
    cod_estable_mh:           formData.get("cod_estable_mh") || null,
    cod_punto_venta_mh:       formData.get("cod_punto_venta_mh") || null,
    dept_code:                formData.get("dept_code") || null,
    municipality_code:        formData.get("municipality_code") || null,
    address_complement:       formData.get("address_complement") || null,
    phone:                    formData.get("phone") || null,
    email:                    formData.get("email") || null,
  };

  const parsed = createDteIssuerConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const result = await createDteIssuerConfig(tenant_id, location_id, sessionUser.id, parsed.data);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/dashboard/settings/dte");
  return { success: true };
}

// ── Actualizar (datos fiscales — nunca is_active desde aquí; eso
//    pasa exclusivamente por switch-dte-environment.action.ts) ────

export async function updateDteIssuerConfigForClientAction(
  _prev: UpsertDteIssuerConfigForClientState,
  formData: FormData,
): Promise<UpsertDteIssuerConfigForClientState> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "Selecciona una location activa." };

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { error: "Falta el identificador de la configuración a editar." };
  }

  const raw = {
    nit:                      formData.get("nit") || undefined,
    nrc:                      formData.get("nrc") || null,
    name:                     formData.get("name") || undefined,
    legal_name:               formData.get("legal_name") || null,
    activity_code:            formData.get("activity_code") || null,
    activity_name:            formData.get("activity_name") || null,
    establishment_code:       formData.get("establishment_code") || null,
    establishment_type_code:  formData.get("establishment_type_code") || null,
    point_of_sale_code:       formData.get("point_of_sale_code") || null,
    cod_estable_mh:           formData.get("cod_estable_mh") || null,
    cod_punto_venta_mh:       formData.get("cod_punto_venta_mh") || null,
    dept_code:                formData.get("dept_code") || null,
    municipality_code:        formData.get("municipality_code") || null,
    address_complement:       formData.get("address_complement") || null,
    phone:                    formData.get("phone") || null,
    email:                    formData.get("email") || null,
    // is_active NUNCA se acepta desde este formulario — el switch de
    // ambiente activo tiene su propio flujo transaccional con
    // preflight y confirmación (switch-dte-environment.action.ts).
  };

  const parsed = updateDteIssuerConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const result = await updateDteIssuerConfig(id, tenant_id, location_id, sessionUser.id, parsed.data);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/dashboard/settings/dte");
  return { success: true };
}
