// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/mh20-activation-blockers.ts
//
// MH20 (Fase 5.1E) — bloqueos P0 que IMPIDEN activar MH_2_0 en PRODUCTION.
// Fuente: docs/fiscal/mh-normativa-2.0/auditoria/04-bloqueos-activacion.md
// (clase BAP) y 05-1-activation-runbook.md.
//
// Mientras exista al menos una entrada con resolved = false, la acción
// administrativa rechaza MH_2_0 en PRODUCTION. Marcar una entrada como
// resuelta exige evidencia oficial y un cambio de código revisado (no hay
// interruptor por variable de entorno a propósito).
// ─────────────────────────────────────────────────────────────────

export interface Mh20ActivationBlocker {
  id:       string;
  title:    string;
  resolved: boolean;
}

export const MH20_PRODUCTION_ACTIVATION_BLOCKERS: readonly Mh20ActivationBlocker[] = Object.freeze([
  { id: "MH20-092/093",      title: "Entrada en vigor y plazo de adaptación sin fecha oficial", resolved: false },
  { id: "MH20-094",          title: "Coexistencia de versiones y DTE firmados antes del corte", resolved: false },
  // Fase 6.1: INC-006 (fecha del evento) resuelto documentalmente y retirado.
  { id: "INC-004",           title: "Plazos de transmisión del Evento de Invalidación 2.0", resolved: false },
  { id: "INC-005",           title: "Versión del Evento de Contingencia (3 vs 4)", resolved: false },
  { id: "MH20-090",          title: "Recertificación de emisores ya autorizados", resolved: false },
  { id: "COR-03/MH20-004",   title: "Modalidad de numeración del número de control", resolved: false },
  { id: "MARIADB-CONTRACT",  title: "Compatibilidad del receptor externo con el payload 2.0", resolved: false },
]);

export function openMh20ProductionBlockers(
  blockers: readonly Mh20ActivationBlocker[] = MH20_PRODUCTION_ACTIVATION_BLOCKERS,
): Mh20ActivationBlocker[] {
  return blockers.filter((b) => !b.resolved);
}
