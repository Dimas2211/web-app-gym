// ─────────────────────────────────────────────────────────────────
// platform/runtime — runtime-session.ts
//
// Sesión runtime "Operar como cliente" (PASO 6A — Plataforma
// Multiindustria / Runtime Database Router).
//
// A diferencia de Support Session (F1-A) y del visor C6, esta sesión
// no vive en una pantalla contenedora aparte: hace que el DASHBOARD
// REAL (/dashboard/products, /dashboard/customers, /dashboard/suppliers,
// /dashboard/inventory) opere temporalmente contra la base de un
// cliente, para un super_admin de Platform Admin.
//
// Mecanismo:
// - Cookie httpOnly, cifrada con el mismo AES-256-GCM que protege las
//   credenciales de PlatformDatabaseProfile (src/lib/security/encryption.ts).
// - Nunca contiene password ni DATABASE_URL — solo metadata de
//   identificación (organizationId, profileId, tenantId, nombres,
//   quién la abrió y cuándo).
// - readOnly siempre true en este paso — no existe todavía un modo
//   de sesión runtime con escritura habilitada.
// - Server-only: usa `cookies()` de next/headers.
//
// Reglas de seguridad:
// - Solo se crea desde enter-client-runtime.action.ts (requireSuperAdmin).
// - Un payload que no descifra o no pasa la validación de forma se
//   trata como ausente (no se lanza — se degrada a "sin sesión runtime").
// - Las páginas reales y las server actions de escritura de
//   products/customers/suppliers/inventory deben usar este módulo,
//   nunca leer la cookie directamente.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[runtime-session] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { cookies } from "next/headers";
import { encryptJsonPayload, decryptJsonPayload } from "@/lib/security/encryption";

export const RUNTIME_SESSION_COOKIE = "platform_runtime_session";

// 8 horas — sesión operativa de una jornada de soporte, no permanente.
const MAX_AGE_SECONDS = 60 * 60 * 8;

export interface RuntimeSessionPayload {
  organizationId:   string;
  profileId:        string;
  tenantId:         string;
  organizationName: string;
  profileLabel:     string;
  readOnly:         true;
  startedByUserId:  string;
  /** ISO 8601 */
  startedAt:        string;
}

function isValidPayload(value: unknown): value is RuntimeSessionPayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.organizationId   === "string" &&
    typeof p.profileId        === "string" &&
    typeof p.tenantId         === "string" &&
    typeof p.organizationName === "string" &&
    typeof p.profileLabel     === "string" &&
    p.readOnly                === true &&
    typeof p.startedByUserId  === "string" &&
    typeof p.startedAt        === "string"
  );
}

/** Abre (o reemplaza) la sesión runtime "Operar como cliente". */
export async function setRuntimeSession(payload: RuntimeSessionPayload): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(RUNTIME_SESSION_COOKIE, encryptJsonPayload(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure:   process.env.NODE_ENV === "production",
    path:     "/",
    maxAge:   MAX_AGE_SECONDS,
  });
}

/**
 * Lee la sesión runtime activa, si existe y es válida.
 * Nunca lanza: una cookie corrupta, manipulada o cifrada con una key
 * distinta (rotación de PLATFORM_ENCRYPTION_KEY) se trata como "sin sesión".
 */
export async function getRuntimeSession(): Promise<RuntimeSessionPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(RUNTIME_SESSION_COOKIE)?.value;
  if (!raw) return null;

  try {
    const payload = decryptJsonPayload<unknown>(raw);
    return isValidPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

/** Cierra la sesión runtime — vuelve al modo normal (datos propios del super_admin). */
export async function clearRuntimeSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(RUNTIME_SESSION_COOKIE);
}

/** true si hay una sesión runtime activa y de solo lectura (siempre, en este paso). */
export async function isRuntimeReadOnlyActive(): Promise<boolean> {
  const session = await getRuntimeSession();
  return session?.readOnly === true;
}

/** Mensaje estándar para bloqueos de escritura bajo sesión runtime. */
export const RUNTIME_READONLY_MESSAGE =
  "Modo \"Operar como cliente\" activo (solo lectura). Sal de ese modo desde el banner superior para hacer cambios.";
