// ─────────────────────────────────────────────────────────────────
// lib/platform — platform-hosts.ts
//
// FASE VI-C — ETAPA E. Reconocimiento central de hostnames de
// PLATAFORMA (el login "global" actual: web-app-gym-*.vercel.app,
// getzolvi.com, etc.) vs. hostnames de RUNTIME CLIENT (dominio propio
// de un cliente, ej. trustme.getzolvi.com).
//
// Diseño:
// - NO hardcodea ningún dominio real (ni TrustMe ni ningún cliente).
// - Configuración explícita vía env var PLATFORM_HOSTS (lista separada
//   por comas de hostnames puros, normalizados con
//   normalizeRequestHostname()). Server-only — nunca NEXT_PUBLIC_.
// - En desarrollo/test (NODE_ENV !== "production"), "localhost" y
//   "127.0.0.1" son PLATFORM por defecto, para no exigir configuración
//   local. En producción, si PLATFORM_HOSTS no los incluye
//   explícitamente, NO se consideran plataforma.
// - Ningún hostname "*.vercel.app" es automáticamente PLATFORM — cada
//   deployment (incluyendo previews) debe listarse explícitamente si
//   se quiere que sirva login de plataforma. Esto es deliberado: un
//   preview deployment no debe adquirir automáticamente privilegios de
//   plataforma solo por su sufijo de dominio.
// ─────────────────────────────────────────────────────────────────

import { normalizeRequestHostname } from "@/lib/http/hostname";

/** Hosts de plataforma asumidos SOLO fuera de producción (dev/test). */
const DEV_DEFAULT_PLATFORM_HOSTS: readonly string[] = ["localhost", "127.0.0.1"];

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Lee y normaliza PLATFORM_HOSTS (lista separada por comas). Entradas
 * vacías o inválidas (rechazadas por normalizeRequestHostname) se
 * descartan silenciosamente — no rompen el arranque de la app.
 */
export function getConfiguredPlatformHosts(): string[] {
  const raw = process.env.PLATFORM_HOSTS;
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => normalizeRequestHostname(entry))
    .filter((entry): entry is string => entry !== null);
}

/**
 * true si `hostname` (ya normalizado, o se normaliza aquí) debe
 * tratarse como PLATAFORMA (login global/Control Plane) en lugar de
 * RUNTIME_CLIENT (login contra la base de un cliente).
 *
 * hostname === null (no se pudo resolver/normalizar) → false, nunca
 * se asume plataforma por ausencia de dato.
 */
export function isPlatformHostname(hostname: string | null): boolean {
  if (!hostname) return false;

  const normalized = normalizeRequestHostname(hostname);
  if (!normalized) return false;

  if (getConfiguredPlatformHosts().includes(normalized)) return true;

  if (!isProduction() && (DEV_DEFAULT_PLATFORM_HOSTS as string[]).includes(normalized)) {
    return true;
  }

  return false;
}
