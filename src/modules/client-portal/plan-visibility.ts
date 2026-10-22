// ─────────────────────────────────────────────────────────────────
// Portal del alumno — política de visibilidad de planes según membresía.
//
// Política VIGENTE (sin cambios): el alumno con membresía activa ve sus
// planes; si la membresía venció, los sigue viendo hasta que transcurren 3
// días hábiles (lun–vie) DESPUÉS del día de vencimiento; luego se ocultan.
// GYM-5A extrae la regla a una función pura sobre fechas calendario y la
// aplica también en la escritura (el alumno no puede registrar un plan que
// la política le oculta). "Hoy" es la fecha local del gimnasio cuando hay
// zona horaria configurada; si no, se conserva el comportamiento anterior
// (fecha del servidor) para no cambiar la política por accidente.
// ─────────────────────────────────────────────────────────────────

export const PLAN_VISIBILITY_GRACE_BUSINESS_DAYS = 3;

function addDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Días hábiles (lun–vie) transcurridos desde `endDate` hasta `today`, sin contar el día de vencimiento. */
export function businessDaysSince(endDate: string, today: string): number {
  let count = 0;
  for (let cursor = addDay(endDate); cursor <= today; cursor = addDay(cursor)) {
    const dow = new Date(`${cursor}T00:00:00.000Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export function plansVisibleForMembership(input: {
  hasActiveMembership: boolean;
  /** Fin de la última membresía pagada ya vencida ("YYYY-MM-DD"), si existe. */
  lastExpiredEnd: string | null;
  today: string;
}): boolean {
  if (input.hasActiveMembership) return true;
  if (!input.lastExpiredEnd) return true;
  return businessDaysSince(input.lastExpiredEnd, input.today) < PLAN_VISIBILITY_GRACE_BUSINESS_DAYS;
}
