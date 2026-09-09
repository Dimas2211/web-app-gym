// ─────────────────────────────────────────────────────────────────
// commerce/dte — get-dte-monitoring-panel-data.ts
//
// FASE IV-C — agregador read-only para /dashboard/dte/monitoring.
// Reutiliza exclusivamente las funciones de metering ya certificadas
// en FASE IV-A/IV-B (dte-fiscal-metering.service.ts) — no reimplementa
// ningún cálculo de consumo/pending/ledger aquí.
//
// Runtime-aware: `runtimeDb` y `commercialCtx` deben ser resueltos por
// el caller (page.tsx) con el mismo patrón ya usado en
// /dashboard/dte/outgoing y /dashboard/settings/dte
// (resolveEffectiveTenantContext + requireOrganizationModule) — esta
// función nunca abre su propia conexión ni resuelve tenant efectivo.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { CommercialEnforcementContext } from "@/modules/platform/runtime/commercial-enforcement";
import {
  getDteMonthlyMeteringStatus,
  listDteMonthlyMeteringEntries,
  listPendingDteMeteringReservations,
  type DteMonthlyMeteringStatus,
  type DteMonthlyMeteringEntry,
} from "../services/dte-fiscal-metering.service";

/** Formato estricto YYYY-MM — nunca acepta strings arbitrarios/SQL-ish. */
const PERIOD_KEY_PATTERN = /^\d{4}-\d{2}$/;

export function isValidPeriodKey(value: string | null | undefined): value is string {
  return typeof value === "string" && PERIOD_KEY_PATTERN.test(value);
}

export interface DteMonitoringPanelData {
  status:            DteMonthlyMeteringStatus;
  pending:           DteMonthlyMeteringEntry[];
  /** periodo efectivamente mostrado en el historial (input validado, o el periodo vigente por defecto). */
  periodKey:         string | null;
  periodEntries:     DteMonthlyMeteringEntry[];
}

export async function getDteMonitoringPanelData(params: {
  tenantId:      string;
  commercialCtx: CommercialEnforcementContext;
  runtimeDb:     PrismaClient;
  /** Periodo solicitado por el usuario (YYYY-MM) — si es inválido o se omite, cae al periodo vigente de `status`. */
  requestedPeriodKey?: string | null;
  now?: Date;
}): Promise<DteMonitoringPanelData> {
  const { tenantId, commercialCtx, runtimeDb, requestedPeriodKey, now } = params;

  const [status, pending] = await Promise.all([
    getDteMonthlyMeteringStatus(commercialCtx, runtimeDb, now),
    listPendingDteMeteringReservations(runtimeDb, { tenantId }),
  ]);

  const periodKey = isValidPeriodKey(requestedPeriodKey) ? requestedPeriodKey : status.periodKey;

  const periodEntries = periodKey
    ? await listDteMonthlyMeteringEntries(tenantId, periodKey, runtimeDb)
    : [];

  return { status, pending, periodKey, periodEntries };
}
