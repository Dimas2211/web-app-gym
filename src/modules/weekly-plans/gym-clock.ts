// ─────────────────────────────────────────────────────────────────
// GYM-5A — reloj local del gimnasio.
//
// "Hoy" para el seguimiento es la fecha calendario en GymSettings.timezone
// (IANA). Sin zona válida NO se asume ninguna por defecto ni se usa la fecha
// UTC del servidor como día local: las escrituras fechadas fallan cerradas
// (TIMEZONE_NOT_CONFIGURED) y la UI avisa al administrador.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { loadGymTimezoneStatus } from "@/modules/classes/trainer/timezone-preflight";
import { gymToday } from "./training-tracking-rules";

export interface GymClock {
  timezone: string;
  /** "YYYY-MM-DD" local del gimnasio. */
  today: string;
}

export const TIMEZONE_NOT_CONFIGURED_MESSAGE =
  "El gimnasio no tiene una zona horaria válida configurada. Pide al administrador que la configure para registrar entrenamientos por fecha.";

export async function resolveGymClock(db: PrismaClient, tenantId: string, now: Date = new Date()): Promise<GymClock | null> {
  const status = await loadGymTimezoneStatus(db, tenantId);
  if (!status.ok) return null;
  const today = gymToday(status.timezone, now);
  return today ? { timezone: status.timezone, today } : null;
}
