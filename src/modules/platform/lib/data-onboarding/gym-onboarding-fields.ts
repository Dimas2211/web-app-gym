// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — gym-onboarding-fields.ts
//
// GYM-ONBOARDING. Reglas PURAS de campos de los datasets gym_clients y
// gym_trainers, compartidas por el parser (archivo), el analizador
// DB-aware y los runners — una sola definición para que preview y
// ejecución real interpreten cada celda exactamente igual.
//
// Reglas de seguridad:
// - Sin Prisma, sin queries, sin efectos secundarios.
// ─────────────────────────────────────────────────────────────────

import type { Gender, GymClientModality } from "@prisma/client";

export function strVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export function isBlank(v: unknown): boolean {
  return strVal(v) === "";
}

/** Igual que el resto del Data Onboarding Center: minúsculas, sin tildes, espacios colapsados. */
export function normalizeKey(v: unknown): string {
  return strVal(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Documento de identidad comparable: sin espacios/guiones/puntos, mayúsculas. */
export function normalizeDocument(v: unknown): string {
  return strVal(v).toUpperCase().replace(/[\s.\-]/g, "");
}

/** Teléfono comparable: solo dígitos. */
export function normalizePhone(v: unknown): string {
  return strVal(v).replace(/\D/g, "");
}

/** Código operativo comparable (la unicidad real en BD es por gym_id). */
export function normalizeOperationalCode(v: unknown): string {
  return strVal(v).toUpperCase();
}

export function personKey(firstName: unknown, lastName: unknown): string {
  return `${normalizeKey(firstName)}|${normalizeKey(lastName)}`;
}

// ── Enums ─────────────────────────────────────────────────────────

/** Estados aceptados en el import (deleted/suspended excluidos por seguridad). */
export const GYM_IMPORT_STATUSES = ["active", "inactive"] as const;
export type GymImportStatus = (typeof GYM_IMPORT_STATUSES)[number];

export function parseGymStatus(v: unknown): GymImportStatus | null | "INVALID" {
  if (isBlank(v)) return null;
  const s = normalizeKey(v);
  if (s === "active" || s === "activo" || s === "activa") return "active";
  if (s === "inactive" || s === "inactivo" || s === "inactiva") return "inactive";
  return "INVALID";
}

const GENDER_ALIASES: Record<string, Gender> = {
  male: "male", m: "male", masculino: "male", hombre: "male",
  female: "female", f: "female", femenino: "female", mujer: "female",
  other: "other", otro: "other",
  prefer_not_to_say: "prefer_not_to_say", "prefiere no decir": "prefer_not_to_say",
};

export function parseGender(v: unknown): Gender | null | "INVALID" {
  if (isBlank(v)) return null;
  return GENDER_ALIASES[normalizeKey(v)] ?? "INVALID";
}

export function parseModality(v: unknown): GymClientModality | "INVALID" {
  if (isBlank(v)) return "NORMAL";
  const s = strVal(v).toUpperCase();
  if (s === "NORMAL" || s === "PERSONALIZED" || s === "GROUP") return s;
  return "INVALID";
}

// ── Fechas ────────────────────────────────────────────────────────

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function isoFromParts(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Fecha de nacimiento → "YYYY-MM-DD". Acepta YYYY-MM-DD, DD/MM/YYYY y el
 * serial numérico de Excel (celdas con formato fecha leídas con raw:true).
 * Rechaza fechas imposibles, futuras o anteriores a 1900.
 */
export function parseBirthDate(v: unknown, today: Date = new Date()): string | null | "INVALID" {
  if (isBlank(v)) return null;

  let iso: string | null = null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const dt = new Date(EXCEL_EPOCH_MS + Math.floor(v) * 86_400_000);
    iso = isoFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  } else {
    const s = strVal(v);
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) iso = isoFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) iso = isoFromParts(Number(m[3]), Number(m[2]), Number(m[1]));
  }

  if (!iso) return "INVALID";
  const todayIso = today.toISOString().slice(0, 10);
  if (iso < "1900-01-01" || iso > todayIso) return "INVALID";
  return iso;
}

// ── Números ───────────────────────────────────────────────────────

/** Mismo rango que createTrainerSchema.personalized_capacity (1–50, entero). */
export const PERSONALIZED_CAPACITY_MIN = 1;
export const PERSONALIZED_CAPACITY_MAX = 50;

export function parsePersonalizedCapacity(v: unknown): number | null | "INVALID" {
  if (isBlank(v)) return null;
  const n = Number(strVal(v));
  if (!Number.isInteger(n) || n < PERSONALIZED_CAPACITY_MIN || n > PERSONALIZED_CAPACITY_MAX) return "INVALID";
  return n;
}

export function isValidEmail(v: unknown): boolean {
  if (isBlank(v)) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal(v));
}

// ── Longitudes (mismas que clients/schemas.ts y trainers/schemas.ts) ─

export const GYM_CLIENT_MAX_LENGTH: Record<string, number> = {
  first_name:              100,
  last_name:               100,
  operational_code:        30,
  document_id:             50,
  phone:                   30,
  address:                 255,
  emergency_contact_name:  100,
  emergency_contact_phone: 30,
  notes:                   1000,
};

export const GYM_TRAINER_MAX_LENGTH: Record<string, number> = {
  first_name: 100,
  last_name:  100,
  email:      200,
  phone:      30,
  specialty:  200,
  notes:      1000,
};

// ── Asignación de códigos operativos en lote ──────────────────────

/**
 * Asigna `count` códigos `${prefix}${n}` nuevos, a partir del mayor número
 * ya usado con ese prefijo (o `start`), saltando cualquier código ocupado.
 * Misma fórmula que suggestNextClientCode, pero para N filas a la vez: el
 * generador individual repetiría el mismo código dentro de una transacción.
 * `usedCodes` debe venir normalizado con normalizeOperationalCode.
 */
export function allocateOperationalCodes(params: {
  prefix:    string;
  digits:    number;
  start:     number;
  usedCodes: Set<string>;
  count:     number;
}): string[] {
  const { prefix, digits, start, usedCodes, count } = params;
  const upperPrefix = prefix.toUpperCase();

  let maxNum = start - 1;
  for (const code of usedCodes) {
    if (!code.startsWith(upperPrefix)) continue;
    const rest = code.slice(upperPrefix.length);
    if (!/^\d+$/.test(rest)) continue;
    const n = parseInt(rest, 10);
    if (n > maxNum) maxNum = n;
  }

  const out: string[] = [];
  let next = maxNum + 1;
  while (out.length < count) {
    const candidate = `${prefix}${String(next).padStart(digits, "0")}`;
    if (!usedCodes.has(normalizeOperationalCode(candidate))) out.push(candidate);
    next += 1;
  }
  return out;
}
