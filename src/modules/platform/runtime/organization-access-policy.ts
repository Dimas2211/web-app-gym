// ─────────────────────────────────────────────────────────────────
// platform/runtime — organization-access-policy.ts
//
// RUNTIME LICENSE ENFORCEMENT. Política CENTRAL, pura y testeable de
// acceso de una PlatformOrganization. Única fuente de decisión sobre
// license_status / trial_ends_at / license_expires_at — el login
// runtime (authorize-credentials.ts), la revalidación live por request
// (require-runtime-organization-context.ts), el gate de layouts
// (runtime-organization-access-gate.ts) y la UI del Control Plane
// (platform-license-panel.tsx) consumen ESTA función; ninguno
// reimplementa reglas propias.
//
// Dos capas, evaluadas en orden:
//   1. TECHNICAL  — PlatformOrganization.status (comportamiento previo
//      de canOrganizationAuthenticate, sin cambios: SUSPENDED/CANCELLED
//      bloquean; PENDING/ACTIVE elegibles).
//   2. COMMERCIAL — license_status + fechas de licencia.
//
// FECHAS — semántica DATE comercial (no timestamp):
// trial_ends_at / license_expires_at siguen siendo DateTime en schema
// (sin migración), pero se interpretan como fecha calendario YYYY-MM-DD.
// <input type="date"> → z.coerce.date("YYYY-MM-DD") las persiste como
// medianoche UTC, por lo que la fecha almacenada se extrae con los
// componentes UTC (nunca con la zona del navegador/servidor). Una fecha
// es válida durante TODO ese día en PlatformOrganization.timezone:
//   trial_ends_at = 2026-10-15, timezone = America/El_Salvador
//   → permitido todo el 2026-10-15 local, bloqueado desde el 2026-10-16.
//
// Este módulo NO tiene efectos secundarios (no escribe license_status,
// no loguea) y NO importa nada server-only: también lo usa la UI.
// ─────────────────────────────────────────────────────────────────

export type OrganizationTechnicalStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
export type OrganizationLicenseStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "EXPIRED" | "CANCELLED";
export type OrganizationBillingCycle = "MONTHLY" | "ANNUAL" | "LIFETIME" | "NONE";

/** Campos mínimos de PlatformOrganization que la política necesita. Nunca IDs/secretos. */
export interface OrganizationAccessInput {
  status: OrganizationTechnicalStatus | string;
  license_status: OrganizationLicenseStatus | string;
  billing_cycle: OrganizationBillingCycle | string;
  trial_ends_at: Date | string | null;
  license_expires_at: Date | string | null;
  timezone: string | null;
}

export type OrganizationAccessReason =
  | "OK"
  | "ORGANIZATION_SUSPENDED"
  | "ORGANIZATION_CANCELLED"
  | "ORGANIZATION_STATUS_INVALID"
  | "LICENSE_SUSPENDED"
  | "LICENSE_EXPIRED"
  | "LICENSE_CANCELLED"
  | "LICENSE_STATUS_INVALID"
  | "BILLING_CYCLE_INVALID"
  | "TRIAL_EXPIRED"
  | "ACTIVE_LICENSE_EXPIRED";

export type OrganizationAccessLayer = "TECHNICAL" | "COMMERCIAL";

export type OrganizationAccessConfigWarning = "TRIAL_WITHOUT_END_DATE" | "TIMEZONE_FALLBACK_UTC";

export interface OrganizationAccessDecision {
  allowed: boolean;
  reason: OrganizationAccessReason;
  /** Capa que bloqueó — null si allowed. */
  blockedBy: OrganizationAccessLayer | null;
  /** Fecha calendario actual (YYYY-MM-DD) en la zona efectiva usada para comparar. */
  today: string;
  /** Zona efectivamente usada (la de la organización o "UTC" como fallback). */
  timeZone: string;
  /** Advertencias de configuración (no bloquean por sí solas). */
  warnings: OrganizationAccessConfigWarning[];
}

// ── Helpers date-only ──────────────────────────────────────────────

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Extrae la fecha calendario YYYY-MM-DD almacenada en un DateTime de
 * licencia SIN desplazamiento de zona (componentes UTC — así se
 * persisten desde <input type="date">). Acepta también un string
 * YYYY-MM-DD ya normalizado o un ISO completo. null si vacío/inválido.
 */
export function toStoredCalendarDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    if (DATE_ONLY_RE.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

/** ¿Es `timeZone` un identificador IANA aceptado por el runtime Intl? */
export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fecha calendario actual (YYYY-MM-DD) de `now` en `timeZone`. Usa
 * formatToParts (nunca un locale string ambiguo). Si la zona falta o es
 * inválida, usa UTC de forma determinista y lo indica en `fallback`.
 */
export function getCalendarDateInTimeZone(
  now: Date,
  timeZone: string | null | undefined,
): { date: string; timeZone: string; fallback: boolean } {
  const valid = isValidTimeZone(timeZone);
  const effectiveZone = valid ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: effectiveZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    calendar: "gregory",
    numberingSystem: "latn",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const year = get("year").padStart(4, "0");
  return {
    date: `${year}-${get("month")}-${get("day")}`,
    timeZone: effectiveZone,
    fallback: !valid,
  };
}

/** Compara dos fechas YYYY-MM-DD. Negativo si a<b, 0 si iguales, positivo si a>b. */
export function compareCalendarDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Formato visual date-only (DD/MM/YYYY) de una fecha de licencia, sin desplazamiento de zona. */
export function formatStoredCalendarDate(value: Date | string | null | undefined): string {
  const date = toStoredCalendarDate(value);
  if (!date) return "—";
  const [, y, m, d] = DATE_ONLY_RE.exec(date)!;
  return `${d}/${m}/${y}`;
}

// ── Política ───────────────────────────────────────────────────────

/**
 * Capa TÉCNICA — misma semántica válida de canOrganizationAuthenticate():
 * SUSPENDED/CANCELLED bloquean; PENDING/ACTIVE siguen elegibles (PENDING
 * se permite deliberadamente para setup/validación — no se cambia aquí).
 * Cualquier otro valor (futuro/desconocido) es FAIL CLOSED.
 */
export function evaluateTechnicalOrganizationEligibility(org: {
  status: string;
}): OrganizationAccessReason {
  switch (org.status) {
    case "ACTIVE":
    case "PENDING":
      return "OK";
    case "SUSPENDED":
      return "ORGANIZATION_SUSPENDED";
    case "CANCELLED":
      return "ORGANIZATION_CANCELLED";
    default:
      return "ORGANIZATION_STATUS_INVALID";
  }
}

const KNOWN_BILLING_CYCLES: readonly string[] = ["MONTHLY", "ANNUAL", "LIFETIME", "NONE"];

/**
 * Decide si la organización puede operar como RUNTIME_CLIENT en `now`.
 * `now` es inyectable para tests; en producción usar `new Date()`.
 */
export function evaluateOrganizationAccess(
  org: OrganizationAccessInput,
  now: Date = new Date(),
): OrganizationAccessDecision {
  const { date: today, timeZone, fallback } = getCalendarDateInTimeZone(now, org.timezone);
  const warnings: OrganizationAccessConfigWarning[] = fallback ? ["TIMEZONE_FALLBACK_UTC"] : [];

  const decide = (reason: OrganizationAccessReason, blockedBy: OrganizationAccessLayer | null) => ({
    allowed: reason === "OK",
    reason,
    blockedBy: reason === "OK" ? null : blockedBy,
    today,
    timeZone,
    warnings,
  });

  // 1. Capa técnica.
  const technical = evaluateTechnicalOrganizationEligibility(org);
  if (technical !== "OK") return decide(technical, "TECHNICAL");

  // 2. Capa comercial.
  switch (org.license_status) {
    case "SUSPENDED":
      return decide("LICENSE_SUSPENDED", "COMMERCIAL");
    case "EXPIRED":
      return decide("LICENSE_EXPIRED", "COMMERCIAL");
    case "CANCELLED":
      return decide("LICENSE_CANCELLED", "COMMERCIAL");

    case "TRIAL": {
      // trial_ends_at es la fecha autoritativa del trial — nunca
      // license_expires_at. null = compatibilidad legacy (permitido,
      // con advertencia de configuración incompleta para el Control Plane).
      const trialEnd = toStoredCalendarDate(org.trial_ends_at);
      if (!trialEnd) {
        warnings.push("TRIAL_WITHOUT_END_DATE");
        return decide("OK", null);
      }
      return decide(compareCalendarDates(today, trialEnd) > 0 ? "TRIAL_EXPIRED" : "OK", "COMMERCIAL");
    }

    case "ACTIVE": {
      // billing_cycle desconocido → fail closed (semántica válida intacta).
      if (!KNOWN_BILLING_CYCLES.includes(org.billing_cycle)) {
        return decide("BILLING_CYCLE_INVALID", "COMMERCIAL");
      }
      if (org.billing_cycle === "LIFETIME") return decide("OK", null);
      const expiry = toStoredCalendarDate(org.license_expires_at);
      if (!expiry) return decide("OK", null); // compatibilidad actual
      return decide(compareCalendarDates(today, expiry) > 0 ? "ACTIVE_LICENSE_EXPIRED" : "OK", "COMMERCIAL");
    }

    default:
      // Valor desconocido/ausente — fail closed.
      return decide("LICENSE_STATUS_INVALID", "COMMERCIAL");
  }
}

/**
 * Advertencia sanitizada (sin IDs, nombres ni valores crudos) para que
 * los callers server-side la registren con console.warn. null si no hay
 * nada que advertir. La política en sí nunca loguea.
 */
export function getOrganizationAccessWarningMessage(decision: OrganizationAccessDecision): string | null {
  if (!decision.warnings.includes("TIMEZONE_FALLBACK_UTC")) return null;
  return "[organization-access-policy] timezone de organización ausente o inválido — se usa UTC para evaluar la licencia.";
}

// ── Presentación (compartida UI / página de acceso restringido) ────

/** Mensaje para el usuario final de una organización bloqueada — sin detalles internos. */
export function getAccessRestrictedMessage(reason: OrganizationAccessReason): string {
  switch (reason) {
    case "TRIAL_EXPIRED":
      return "Tu período de prueba ha finalizado. Contacta a Zolvi para continuar.";
    case "LICENSE_SUSPENDED":
    case "ORGANIZATION_SUSPENDED":
      return "El acceso de esta organización está suspendido. Contacta a Zolvi.";
    case "LICENSE_EXPIRED":
    case "ACTIVE_LICENSE_EXPIRED":
      return "La licencia de esta organización ha vencido. Contacta a Zolvi.";
    case "LICENSE_CANCELLED":
    case "ORGANIZATION_CANCELLED":
      return "La licencia de esta organización está cancelada.";
    default:
      return "El acceso de esta organización no está disponible. Contacta a Zolvi.";
  }
}

export type EffectiveLicenseTone = "ok" | "warning" | "blocked";

/** Estado EFECTIVO derivado (no el almacenado) para el Control Plane. */
export function describeEffectiveLicenseState(
  org: OrganizationAccessInput,
  decision: OrganizationAccessDecision,
): { label: string; tone: EffectiveLicenseTone } {
  if (!decision.allowed) {
    switch (decision.reason) {
      case "TRIAL_EXPIRED":
        return { label: "Trial vencido por fecha", tone: "blocked" };
      case "ACTIVE_LICENSE_EXPIRED":
        return { label: "Licencia vencida por fecha", tone: "blocked" };
      case "LICENSE_SUSPENDED":
        return { label: "Licencia suspendida", tone: "blocked" };
      case "LICENSE_EXPIRED":
        return { label: "Licencia vencida", tone: "blocked" };
      case "LICENSE_CANCELLED":
        return { label: "Licencia cancelada", tone: "blocked" };
      case "ORGANIZATION_SUSPENDED":
        return { label: "Organización suspendida", tone: "blocked" };
      case "ORGANIZATION_CANCELLED":
        return { label: "Organización cancelada", tone: "blocked" };
      case "ORGANIZATION_STATUS_INVALID":
        return { label: "Estado de organización inválido", tone: "blocked" };
      case "BILLING_CYCLE_INVALID":
        return { label: "Ciclo de facturación inválido", tone: "blocked" };
      default:
        return { label: "Estado de licencia inválido", tone: "blocked" };
    }
  }
  if (org.license_status === "TRIAL") {
    return decision.warnings.includes("TRIAL_WITHOUT_END_DATE")
      ? { label: "Trial sin fecha de fin (configuración incompleta)", tone: "warning" }
      : { label: "Trial vigente", tone: "ok" };
  }
  if (org.billing_cycle === "LIFETIME") return { label: "Licencia vitalicia vigente", tone: "ok" };
  return toStoredCalendarDate(org.license_expires_at)
    ? { label: "Licencia vigente", tone: "ok" }
    : { label: "Licencia vigente (sin fecha de vencimiento)", tone: "ok" };
}
