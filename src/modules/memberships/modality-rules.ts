// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3A — reglas puras de modalidad para clientes, planes y
// membresías. Sin acceso a datos; las acciones las evalúan bajo lock.
//
// Contrato 2A (docs/modules/gym-bookings-summary.md §2):
//  - Client.modality, MembershipPlan.modality y el snapshot
//    ClientMembership.modality (copiado al vender, nunca retroactivo).
//  - sessions_total: copia de sessions_limit para PERSONALIZED/GROUP;
//    NORMAL = null (OPEN no consume). sessions_used lo mantiene el trigger.
//  - Entrenador PERSONALIZED: ClientMembership.assigned_trainer_id → Trainer.
//    Client.assigned_trainer_id (→ User) es otra relación y no se usa aquí.
// ─────────────────────────────────────────────────────────────────

import type { GymClientModality, GymSessionKind } from "@prisma/client";
import { SESSION_KIND_FOR_MODALITY } from "@/modules/classes/booking/booking-rules";

export const GYM_CLIENT_MODALITIES = ["NORMAL", "PERSONALIZED", "GROUP"] as const;

export const MODALITY_LABELS: Record<GymClientModality, string> = {
  NORMAL: "Normal",
  PERSONALIZED: "Personalizada",
  GROUP: "Grupal",
};

/** Snapshot que se copia del plan a la membresía al venderla. */
export function membershipSnapshotFromPlan(plan: { modality: GymClientModality; sessions_limit: number | null }): {
  modality: GymClientModality;
  sessions_total: number | null;
} {
  return {
    modality: plan.modality,
    sessions_total: plan.modality === "NORMAL" ? null : (plan.sessions_limit ?? null),
  };
}

/** R2/R6: el plan vendido debe tener la modalidad del cliente. */
export function saleModalityFailure(clientModality: GymClientModality, planModality: GymClientModality): string | null {
  if (clientModality === planModality) return null;
  return `El plan es de modalidad ${MODALITY_LABELS[planModality]} y el cliente es ${MODALITY_LABELS[clientModality]}. Cambia la modalidad del cliente o elige un plan compatible.`;
}

export interface ModalityChangeDependencies {
  /** Membresías vigentes (active/suspended, no vencidas) con su snapshot. */
  currentMemberships: { modality: GymClientModality }[];
  /** Reservas confirmadas en sesiones futuras no canceladas. */
  futureBookings: { session_kind: GymSessionKind }[];
}

/**
 * Bloqueos de un cambio de modalidad. Cambiar no debe dejar al cliente con
 * una membresía vigente o reservas futuras de otra modalidad (estado
 * inconsistente); el administrador las resuelve primero.
 */
export function modalityChangeBlockers(to: GymClientModality, deps: ModalityChangeDependencies): string[] {
  const blockers: string[] = [];
  const incompatibleMemberships = deps.currentMemberships.filter((m) => m.modality !== to).length;
  if (incompatibleMemberships > 0) {
    blockers.push(`${incompatibleMemberships} membresía(s) vigente(s) de otra modalidad`);
  }
  const target = SESSION_KIND_FOR_MODALITY[to];
  const incompatibleBookings = deps.futureBookings.filter((b) => b.session_kind !== target).length;
  if (incompatibleBookings > 0) {
    blockers.push(`${incompatibleBookings} reserva(s) futura(s) confirmada(s) en sesiones de otro tipo`);
  }
  return blockers;
}
