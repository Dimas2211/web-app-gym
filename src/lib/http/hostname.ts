// ─────────────────────────────────────────────────────────────────
// lib/http — hostname.ts
//
// FASE VI-C — Hostname Resolution + Runtime Authentication Foundation.
//
// Helpers puros y edge-safe para normalizar y extraer el hostname de
// una request. No importan Prisma, bcrypt ni ningún módulo Node-only:
// pueden usarse desde Edge Runtime (middleware) o desde Node (authorize).
//
// PRINCIPIO DE SEGURIDAD (ver CONTEXTO de FASE VI-C):
// Estas funciones SOLO extraen y normalizan un hostname candidato. NO
// son, por sí mismas, una decisión de autorización. El allowlist real
// que decide qué organización puede autenticar vive en
// PlatformOrganization.domain (Control Plane) — ver
// resolveOrganizationByHostname() en
// src/modules/platform/runtime/resolve-organization-by-hostname.ts.
// Un Host arbitrario enviado por un cliente nunca debe, por sí solo,
// seleccionar una base de datos runtime.
// ─────────────────────────────────────────────────────────────────

/**
 * Hostname válido: uno o más labels alfanuméricos (con guiones internos)
 * separados por puntos. Sin protocolo, sin path, sin espacios.
 * Acepta hosts de un solo label (ej. "localhost").
 */
const HOSTNAME_PATTERN =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * Normaliza un valor crudo de hostname (ej. de un header Host o de un
 * campo `domain` almacenado) a una forma canónica: minúsculas, sin
 * puerto, sin punto final, sin espacios.
 *
 * Retorna `null` si el valor no es un hostname puro válido — en
 * particular si incluye protocolo (`://`), path (`/`), espacios
 * internos, o caracteres fuera del alfabeto de hostname.
 *
 * NO acepta URLs completas. NO acepta paths. Defensivo por diseño:
 * ante cualquier ambigüedad, retorna `null` en vez de adivinar.
 */
export function normalizeRequestHostname(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // Rechaza protocolo, path y espacios internos — solo se acepta un
  // hostname puro (con puerto opcional), nunca una URL o un path.
  if (trimmed.includes("://")) return null;
  if (trimmed.includes("/")) return null;
  if (trimmed.includes(" ")) return null;
  if (trimmed.includes("\\")) return null;

  let host = trimmed.toLowerCase();

  // Quita punto(s) finales (FQDN con trailing dot).
  host = host.replace(/\.+$/, "");
  if (host.length === 0) return null;

  // Puerto: "host:puerto" con puerto numérico. Cualquier otro uso de
  // ":" (IPv6, formato corrupto) se rechaza defensivamente — este
  // helper no da soporte a IPv6 en VI-C.
  const colonIndex = host.indexOf(":");
  if (colonIndex !== -1) {
    const hostPart = host.slice(0, colonIndex);
    const portPart = host.slice(colonIndex + 1);
    if (!/^\d+$/.test(portPart) || hostPart.length === 0) return null;
    host = hostPart;
  }

  if (!HOSTNAME_PATTERN.test(host)) return null;

  return host;
}

/**
 * Extrae el hostname "confiable" de una Request server-side.
 *
 * Orden de confianza (comportamiento estándar de Vercel):
 * 1. `x-forwarded-host` — el edge proxy de Vercel lo reescribe con el
 *    hostname externo real de la request; puede venir como lista
 *    separada por comas si hay múltiples proxies encadenados, en cuyo
 *    caso se usa la primera entrada.
 * 2. `host` — fallback si no hay `x-forwarded-host` (ej. dev local con
 *    `next dev`, sin proxy delante).
 *
 * IMPORTANTE — esto NO es un allowlist. Un atacante puede enviar
 * cualquier header Host/X-Forwarded-Host. La única frontera de
 * seguridad real es que el hostname resultante debe existir
 * explícitamente como PlatformOrganization.domain (o como platform
 * host configurado) para que `authorize()` lo acepte — ver
 * resolveOrganizationByHostname() e isPlatformHostname().
 */
/**
 * Valida que `value` sea EXACTAMENTE un hostname puro ya normalizado:
 * minúsculas, sin puerto, sin protocolo, sin path, sin punto final.
 * A diferencia de normalizeRequestHostname(), esto NO tolera puerto —
 * pensado para validar datos a GUARDAR (ej. PlatformOrganization.domain),
 * donde un puerto no tiene sentido (ver ETAPA T de FASE VI-C).
 */
export function isPureHostnameFormat(value: string): boolean {
  return HOSTNAME_PATTERN.test(value);
}

export function resolveRequestHostname(request: Request): string | null {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");

  const candidate = forwardedHost ?? hostHeader;
  if (!candidate) return null;

  const first = candidate.split(",")[0] ?? null;
  return normalizeRequestHostname(first);
}
