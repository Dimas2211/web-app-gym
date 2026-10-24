// ─────────────────────────────────────────────────────────────────
// platform — gym-import-runner-shared.ts
//
// GYM-ONBOARDING. Piezas comunes de los runners gym_clients y
// gym_trainers: entrada, reglas de "sin import parcial" y armado del
// resultado por fila. SERVER-ONLY (lo importan solo los runners).
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type {
  DataOnboardingPreviewResult,
  DataOnboardingPreviewRow,
  DataOnboardingDbAwarePreviewResult,
  DataOnboardingDbAwareRow,
  GymImportDryRunResult,
  GymImportRowResult,
} from "../../../types/platform.types";
import { strVal } from "../gym-onboarding-fields";
import { DATA_ONBOARDING_TX_OPTIONS } from "./batch-write";

export interface GymImportRunnerInput {
  parsedPreview: DataOnboardingPreviewResult;
  dbAwareResult: DataOnboardingDbAwarePreviewResult;
  prismaClient:  PrismaClient;
  /** Siempre PlatformOrganization.tenant_id — nunca un valor del navegador. */
  tenantId:      string;
  isDryRun:      boolean;
}

/**
 * Timeout de la transacción: lecturas de re-verificación + INSERT multi-fila
 * por lotes. ONBOARDING-5K: mismo valor que el resto de imports (< maxDuration
 * 60 s de la ruta), para que un timeout revierta antes de que muera la función.
 */
export const GYM_IMPORT_TX_OPTIONS = DATA_ONBOARDING_TX_OPTIONS;

export interface GymBlockedRow {
  rowNumber:  number;
  name:       string;
  code:       string;
  branchName: string;
  reason:     string;
}

export interface GymRowRef {
  rowNumber:  number;
  name:       string;
  code:       string;
  branchName: string;
}

export function fullName(data: Record<string, unknown>): string {
  return `${strVal(data.first_name)} ${strVal(data.last_name)}`.trim();
}

export function findDependencyId(dbRow: DataOnboardingDbAwareRow, type: string): string | null {
  return dbRow.dependencyChecks.find((d) => d.dependencyType === type && d.found)?.foundId ?? null;
}

export function parsedRowsByNumber(preview: DataOnboardingPreviewResult): Map<number, DataOnboardingPreviewRow> {
  return new Map(preview.rows.map((r) => [r.rowNumber, r]));
}

/**
 * Bloqueos globales previos a preparar filas: análisis incompleto respecto
 * del archivo (ONBOARDING-5K: el parser ya no trunca — un archivo sobre el
 * máximo se rechaza antes; esto es defensa en profundidad) o filas
 * no-CREATE en el análisis (el pipeline ya lo bloquea).
 */
export function globalBlockReason(input: GymImportRunnerInput): string | null {
  const parsedRows = input.parsedPreview.rows.length;
  if (
    input.parsedPreview.sample ||
    parsedRows !== input.parsedPreview.summary.totalRows ||
    input.dbAwareResult.rows.length !== parsedRows
  ) {
    return "El análisis no cubre todas las filas del archivo. No se permite importación parcial.";
  }
  const nonCreate = input.dbAwareResult.rows.filter((r) => r.resolution !== "CREATE").length;
  if (nonCreate > 0) {
    return `${nonCreate} fila(s) no son creables según el análisis DB-aware. Corrija el archivo: no se permite importación parcial.`;
  }
  return null;
}

/**
 * Sin import parcial: dry-run devuelve el detalle, EXECUTE lanza (el
 * pipeline traduce el error) — nunca se escribe una fila si otra falla.
 */
export function blockedOutcome(params: {
  isDryRun:  boolean;
  totalRows: number;
  okRows:    GymRowRef[];
  blocked:   GymBlockedRow[];
  label:     string;
}): GymImportDryRunResult {
  const { isDryRun, totalRows, okRows, blocked, label } = params;
  if (!isDryRun) {
    const first = blocked.slice(0, 3).map((b) => `fila ${b.rowNumber}: ${b.reason}`).join(" · ");
    throw new Error(
      `Importación de ${label} bloqueada: ${blocked.length} fila(s) con error (${first}). ` +
      "No se escribió ningún registro. Corrija el archivo e intente de nuevo.",
    );
  }
  const blockedNumbers = new Set(blocked.map((b) => b.rowNumber));
  const rows: GymImportRowResult[] = [
    ...okRows
      .filter((r) => !blockedNumbers.has(r.rowNumber))
      .map((r) => ({ ...r, resolution: "SKIPPED" as const, reason: "Bloqueado por otras filas con error." })),
    ...blocked.map((b) => ({ ...b, resolution: "ERROR" as const })),
  ].sort((a, b) => a.rowNumber - b.rowNumber);
  return { wouldCreate: 0, blocked: blocked.length, totalRows, rows };
}
