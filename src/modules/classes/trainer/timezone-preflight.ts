// ─────────────────────────────────────────────────────────────────
// GYM-4 — preflight de zona horaria del gimnasio (auditoría H02).
//
// El contrato temporal R32 no cambia: el canal TRAINER necesita el instante
// real de inicio. Una sesión OPEN heredada sin starts_at solo lo obtiene con
// GymSettings.timezone; sin zona válida el motor responde SCHEDULE_INCOMPLETE.
//
// Zolvi sirve a gimnasios de varios países: aquí NO se asume ninguna zona
// por defecto ni se escribe la configuración de la organización. Solo se
// diagnostica (lectura) para avisar al administrador y para el preflight
// previo a habilitar la operación del entrenador:
//   - NO_SETTINGS  el gimnasio no tiene fila gym_settings;
//   - MISSING      la fila existe sin timezone;
//   - INVALID      el valor guardado no es una zona IANA reconocida.
// STAFF heredado (OPEN sin política) sigue operando sin ventana.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isValidIanaTimeZone } from "../booking/booking-policy";

export type GymTimezoneIssue = "NO_SETTINGS" | "MISSING" | "INVALID";

export type GymTimezoneStatus = { ok: true; timezone: string } | { ok: false; issue: GymTimezoneIssue };

/** Diagnóstico puro del valor crudo de gym_settings (null = sin fila). */
export function evaluateGymTimezone(row: { timezone: string | null } | null): GymTimezoneStatus {
  if (!row) return { ok: false, issue: "NO_SETTINGS" };
  const raw = row.timezone?.trim() ?? "";
  if (raw === "") return { ok: false, issue: "MISSING" };
  if (!isValidIanaTimeZone(raw)) return { ok: false, issue: "INVALID" };
  return { ok: true, timezone: raw };
}

/** Estado de la zona horaria del gimnasio del tenant (base runtime efectiva). Solo lectura. */
export async function loadGymTimezoneStatus(client: PrismaClient | undefined, tenantId: string): Promise<GymTimezoneStatus> {
  const row = await (client ?? prisma).gymSettings.findFirst({
    where: { gym: { tenant_id: tenantId } },
    select: { timezone: true },
  });
  return evaluateGymTimezone(row);
}

export interface GymTimezonePreflightRow {
  gymId: string;
  tenantId: string;
  gymName: string;
  issue: GymTimezoneIssue;
}

/**
 * Preflight de una base (Shared o Dedicated): gimnasios cuya zona horaria no
 * permite al entrenador operar OPEN heredado. Solo lectura; no corrige nada.
 */
export async function findGymsWithoutValidTimezone(db: PrismaClient): Promise<GymTimezonePreflightRow[]> {
  const gyms = await db.gym.findMany({
    select: { id: true, tenant_id: true, name: true, settings: { select: { timezone: true } } },
    orderBy: [{ tenant_id: "asc" }, { id: "asc" }],
  });
  const out: GymTimezonePreflightRow[] = [];
  for (const g of gyms) {
    const status = evaluateGymTimezone(g.settings ?? null);
    if (!status.ok && g.tenant_id) out.push({ gymId: g.id, tenantId: g.tenant_id, gymName: g.name, issue: status.issue });
  }
  return out;
}

const ISSUE_TEXT: Record<GymTimezoneIssue, string> = {
  NO_SETTINGS: "El gimnasio no tiene configuración de reservas",
  MISSING: "El gimnasio no tiene zona horaria configurada",
  INVALID: "La zona horaria configurada del gimnasio no es válida",
};

/** Aviso administrativo: qué falta y a quién le toca configurarlo. */
export function gymTimezoneAdminNotice(issue: GymTimezoneIssue, role: string): string {
  const action =
    role === "super_admin"
      ? "Configúrala en Ajustes › Reservas antes de habilitar la operación del entrenador."
      : "Pide a un super administrador que la configure en Ajustes › Reservas.";
  return `${ISSUE_TEXT[issue]}: el entrenador no puede registrar asistencia ni actividades en clases abiertas (OPEN) heredadas sin horario absoluto. ${action}`;
}

/** Aviso para el entrenador (no puede corregirlo él). */
export const GYM_TIMEZONE_TRAINER_NOTICE =
  "El gimnasio no tiene una zona horaria válida configurada: algunas clases no podrán registrarse hasta que el administrador la configure.";
