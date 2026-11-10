// ─────────────────────────────────────────────────────────────────
// Inicio — zona horaria de presentación (solo lectura).
//
// "Hoy" en el inicio (fecha de bienvenida y Resumen de hoy) es el día
// calendario de la organización, no el del servidor (Vercel = UTC).
// Fuente: PlatformOrganization.timezone (configurable por organización en
// el Control Plane). Si falta o es inválida: America/El_Salvador, zona en la
// que opera el producto hoy. No cambia cómo se almacenan las fechas.
// ─────────────────────────────────────────────────────────────────

import { isValidTimeZone } from "@/modules/platform/runtime/organization-access-policy";
import { controlPlanePrisma } from "@/modules/platform/runtime/control-plane-prisma";

export const DEFAULT_DISPLAY_TIME_ZONE = "America/El_Salvador";

/** Zona IANA válida o el default del producto. */
export function pickDisplayTimeZone(raw: string | null | undefined): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  return isValidTimeZone(value) ? value : DEFAULT_DISPLAY_TIME_ZONE;
}

/** Fecha larga de bienvenida ("lunes, 9 de noviembre de 2026") en `timeZone`. */
export function formatWelcomeDate(now: Date, timeZone: string): string {
  return now.toLocaleDateString("es-SV", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  });
}

/**
 * Zona horaria de la organización efectiva. Nunca lanza: ante cualquier
 * error de lectura usa el default (la fecha es presentación, no autorización).
 */
export async function resolveOrganizationDisplayTimeZone(
  organizationId: string | null,
): Promise<string> {
  if (!organizationId) return DEFAULT_DISPLAY_TIME_ZONE;
  try {
    const org = await controlPlanePrisma.platformOrganization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    return pickDisplayTimeZone(org?.timezone);
  } catch {
    return DEFAULT_DISPLAY_TIME_ZONE;
  }
}
