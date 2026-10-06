// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — messages.ts
//
// Mensajes de usuario de la Autorización Operativa. Client-safe.
// Únicos textos que pueden llegar a la UI — nunca detalles internos.
// ─────────────────────────────────────────────────────────────────

export const OPERATIONAL_AUTH_MESSAGES = {
  PIN_NOT_CONFIGURED:
    "La clave de supervisor no está configurada. Un administrador debe configurarla en Configuración → Seguridad.",
  PIN_INVALID: "Clave incorrecta.",
  PIN_REQUIRED: "Ingresa la clave de supervisor.",
  PIN_LOCKED:
    "Demasiados intentos fallidos. Espera unos minutos antes de volver a intentar.",
  GRANT_EXPIRED: "La autorización expiró. Vuelve a autorizar la operación.",
  GRANT_MISSING: "No tienes autorización para modificar este registro.",
  UNAVAILABLE: "No se pudo verificar la autorización operativa.",
} as const;

export type OperationalAuthMessageKey = keyof typeof OPERATIONAL_AUTH_MESSAGES;

/** Estado estándar de las server actions que solicitan la Clave de Supervisor. */
export type SupervisorAuthActionState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

const AUTH_LOSS_MESSAGES: readonly string[] = [
  OPERATIONAL_AUTH_MESSAGES.GRANT_EXPIRED,
  OPERATIONAL_AUTH_MESSAGES.GRANT_MISSING,
  OPERATIONAL_AUTH_MESSAGES.PIN_NOT_CONFIGURED,
];

/**
 * true si un error devuelto por un write protegido indica que la
 * autorización ya no es válida. Solo para UX (volver a pedir la clave);
 * la decisión real siempre la toma el servidor.
 */
export function isOperationalAuthError(message: string | null | undefined): boolean {
  return !!message && AUTH_LOSS_MESSAGES.includes(message);
}
