// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — run-data-onboarding-import.ts
//
// SHARED-OPS-PARITY-1. Pipeline ÚNICO de importación del Data Onboarding
// Center, organization-scoped. Reemplaza el cuerpo duplicado de las 7
// import actions (categories, lines, sublines, customers, suppliers,
// products, inventory_initial), que ahora solo aportan su config.
//
// Flujo:
//  1. requireSuperAdmin().
//  2. Validar parámetros (mode, datasetKey, CREATE_ONLY, archivo).
//  3. Resolver destino SERVER-SIDE:
//       organizationId (+ profileId opcional, solo Dedicated histórico)
//       → PlatformOrganization → tenant_id → Runtime Router.
//     Nunca se acepta tenantId/host/user/password/URL del navegador.
//  4. Commercial Enforcement de la organización DESTINO.
//  5. Re-parsear el archivo server-side.
//  6. Análisis DB-aware server-side (solo lecturas, WHERE tenant_id).
//  7. Bloquear si hay filas ERROR o no-CREATE.
//  8. Política de ejecución (no-PROD: Safety Gate D0 sin cambios;
//     PROD: dry-run permitido, execute con guardas + confirmación que
//     incluye organization.code).
//  9. Runner (DRY_RUN o EXECUTE, transacción) con el tenantId de la org.
// 10. PlatformDeploymentLog (solo EXECUTE exitoso).
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[run-data-onboarding-import] Módulo server-only. No usar en contexto de navegador.",
  );
}

import type { PrismaClient } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import { controlPlanePrisma } from "../../runtime/control-plane-prisma";
import {
  resolveOrganizationRuntime,
  isOrganizationRuntimeResolutionError,
  type OrganizationRuntimeHeader,
} from "../../runtime/resolve-organization-runtime";
import { getRuntimeDatabaseUrlFromProfile } from "../../runtime/runtime-database-router";
import { withTemporaryPrismaClient } from "../client-prisma";
import { sanitizeDatabaseError } from "../database-profile-url";
import { parseDataOnboardingWorkbook } from "./excel-preview-parser";
import { analyzeDataOnboardingPreviewAgainstDatabase } from "./db-aware-preview-analyzer";
import {
  evaluateDataOnboardingExecutionPolicy,
  DATA_ONBOARDING_DATASET_MODULE,
  type DataOnboardingImportDatasetKey,
} from "./data-onboarding-execution-policy";
import {
  resolveCommercialEnforcementContext,
  hasOrganizationModule,
  CommercialEnforcementError,
  type CommercialEnforcementContext,
} from "../../runtime/commercial-enforcement";
import type {
  DataOnboardingPreviewResult,
  DataOnboardingDbAwarePreviewResult,
} from "../../types/platform.types";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const SENSITIVE_PATTERNS: [RegExp, string][] = [
  [/postgresql:\/\/[^\s]*/gi,           "***"],
  [/password[=:\s]+[^\s,}]*/gi,         "***"],
  [/DATABASE_URL[=:\s]+[^\s]*/gi,       "***"],
  [/encrypted_password[=:\s]+[^\s]*/gi, "***"],
];

export function sanitizeDataOnboardingError(msg: string): string {
  return SENSITIVE_PATTERNS.reduce(
    (s, [pattern, replacement]) => s.replace(pattern, replacement),
    msg,
  );
}

export interface DataOnboardingRunnerArgs {
  client:        PrismaClient;
  parsedPreview: DataOnboardingPreviewResult;
  dbAwareResult: DataOnboardingDbAwarePreviewResult;
  /** Siempre PlatformOrganization.tenant_id — nunca un valor del navegador. */
  tenantId:      string;
  isDryRun:      boolean;
  commercialCtx: CommercialEnforcementContext;
}

export interface DataOnboardingImportConfig<TDry, TImp> {
  datasetKey:             DataOnboardingImportDatasetKey;
  /** Etiqueta de fase histórica para mensajes/log (ej: "E1C-D"). */
  phase:                  string;
  /** Nombre del dataset en español para mensajes/log (ej: "productos"). */
  datasetLabel:           string;
  baseConfirmationText:   string;
  analysisErrorMessage:   (errorRows: number) => string;
  nonCreateMessage:       (nonCreateRows: number) => string;
  unexpectedErrorMessage: string;
  run:                    (args: DataOnboardingRunnerArgs) => Promise<TDry | TImp>;
  buildLogMetadata:       (result: TImp) => Record<string, unknown>;
  created:                (result: TImp) => number;
}

export type DataOnboardingImportState<TDry, TImp> =
  | {
      success:        true;
      mode:           "DRY_RUN" | "EXECUTE";
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      dryRunResult?:  TDry;
      importResult?:  TImp;
      error?:         never;
    }
  | {
      success:         false;
      error:           string;
      blocked?:        boolean;
      safetyBlockers?: string[];
    };

function formString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function runDataOnboardingImport<TDry, TImp>(
  formData: FormData,
  config: DataOnboardingImportConfig<TDry, TImp>,
): Promise<DataOnboardingImportState<TDry, TImp>> {
  try {
    // ── 1. Autenticación ──────────────────────────────────────────
    await requireSuperAdmin();

    // ── 2. Parámetros ─────────────────────────────────────────────
    // Solo identificadores de destino: organizationId (identidad
    // operativa) y, en links históricos Dedicated, profileId. Cualquier
    // tenantId/host/credencial enviada por el navegador se ignora.
    const organizationId   = formString(formData, "organizationId");
    const profileId        = formString(formData, "profileId");
    const mode             = formData.get("mode");
    const datasetKey       = formData.get("datasetKey");
    const importPolicy     = formData.get("importPolicy");
    const confirmationText = formData.get("confirmationText");
    const file             = formData.get("file");

    if (!organizationId && !profileId) {
      return { success: false, error: "organizationId requerido." };
    }
    if (mode !== "DRY_RUN" && mode !== "EXECUTE") {
      return { success: false, error: "mode debe ser DRY_RUN o EXECUTE." };
    }
    if (datasetKey !== config.datasetKey) {
      return {
        success: false,
        error: `${config.phase} solo permite importar dataset '${config.datasetKey}' desde esta action. Recibido: '${datasetKey}'.`,
      };
    }
    if (importPolicy !== "CREATE_ONLY") {
      return {
        success: false,
        error: `${config.phase} solo permite política CREATE_ONLY. Recibida: '${importPolicy}'.`,
      };
    }
    if (!(file instanceof File)) {
      return { success: false, error: "No se recibió ningún archivo." };
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return { success: false, error: "Solo se permiten archivos .xlsx" };
    }
    if (file.size === 0) {
      return { success: false, error: "El archivo está vacío." };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `El archivo excede el tamaño máximo de 5 MB (${(file.size / 1024 / 1024).toFixed(2)} MB recibidos).`,
      };
    }

    // ── 3. Cifrado + destino runtime server-side ──────────────────
    try {
      assertEncryptionAvailable();
    } catch (err) {
      return {
        success: false,
        error:   err instanceof Error ? err.message : "Clave de cifrado no disponible.",
      };
    }

    let header: OrganizationRuntimeHeader;
    let databaseUrl: string;
    try {
      const resolved = await resolveOrganizationRuntime({ organizationId, profileId });
      header      = resolved.header;
      databaseUrl = getRuntimeDatabaseUrlFromProfile(resolved.profile);
    } catch (err) {
      if (isOrganizationRuntimeResolutionError(err)) {
        return { success: false, error: sanitizeDataOnboardingError(err.message) };
      }
      throw err;
    }
    const tenantId = header.tenantId;

    // ── 4. Commercial Enforcement de la organización DESTINO ──────
    // Nunca la sesión del super_admin que ejecuta el import.
    let commercialCtx: CommercialEnforcementContext;
    try {
      commercialCtx = await resolveCommercialEnforcementContext(tenantId);
    } catch (err) {
      if (err instanceof CommercialEnforcementError) {
        return { success: false, error: err.userMessage };
      }
      throw err;
    }
    const moduleEnabled = hasOrganizationModule(
      commercialCtx,
      DATA_ONBOARDING_DATASET_MODULE[config.datasetKey],
    );
    // Contrato histórico E1C-D: productos exige commerce.products en
    // cualquier ambiente. El resto de datasets lo exige la política de
    // PRODUCTION (evaluateDataOnboardingExecutionPolicy).
    if (config.datasetKey === "products" && !moduleEnabled) {
      return {
        success: false,
        error:   "Este módulo no está habilitado para tu organización. Contacta a soporte para activarlo.",
      };
    }

    // ── 5. Re-parsear server-side ─────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsedPreview = parseDataOnboardingWorkbook({
      datasetKey: config.datasetKey,
      fileBuffer: buffer,
    });
    if (parsedPreview.status === "INVALID") {
      return {
        success: false,
        error:   "El archivo Excel tiene errores estructurales. Verifique el formato antes de importar.",
      };
    }

    // ── 6. Análisis DB-aware server-side (solo lecturas) ──────────
    let dbAwareResult: DataOnboardingDbAwarePreviewResult;
    try {
      dbAwareResult = await withTemporaryPrismaClient(databaseUrl, (client) =>
        analyzeDataOnboardingPreviewAgainstDatabase({
          datasetKey:   config.datasetKey,
          parsedPreview,
          importPolicy: "CREATE_ONLY",
          prismaClient: client,
          tenantId,
        }),
      );
    } catch (dbErr) {
      return {
        success: false,
        error:   `Error al analizar la base destino: ${sanitizeDatabaseError(dbErr)}`,
      };
    }

    // ── 7. Análisis limpio obligatorio ────────────────────────────
    const errorRows = dbAwareResult.rows.filter((r) => r.resolution === "ERROR").length;
    if (errorRows > 0) {
      return { success: false, error: config.analysisErrorMessage(errorRows) };
    }
    const nonCreateRows = dbAwareResult.rows.filter((r) => r.resolution !== "CREATE").length;
    if (nonCreateRows > 0) {
      return { success: false, error: config.nonCreateMessage(nonCreateRows) };
    }

    // ── 8. Política de ejecución ──────────────────────────────────
    const safety = evaluateDataOnboardingExecutionPolicy({
      mode,
      environment:                       header.environment,
      importPolicy,
      baseConfirmationText:              config.baseConfirmationText,
      confirmationText:                  typeof confirmationText === "string" ? confirmationText : null,
      organizationCode:                  header.organizationCode,
      moduleEnabled,
      hasRecentSuccessfulConnectionTest: header.lastTestStatus === "SUCCESS",
      connectionVerifiedInOperation:     true, // el análisis del paso 6 se completó contra la base destino
      analysisErrorRows:                 errorRows,
      analysisNonCreateRows:             nonCreateRows,
    });
    if (!safety.allowed) {
      return {
        success:        false,
        blocked:        safety.blocked,
        safetyBlockers: safety.blockers,
        error:          safety.blockers[0] ?? "Acción bloqueada por el safety gate.",
      };
    }

    // ── 9. Runner (tenantId server-side) ──────────────────────────
    const isDryRun = mode === "DRY_RUN";
    const runnerResult = await withTemporaryPrismaClient(databaseUrl, (client) =>
      config.run({ client, parsedPreview, dbAwareResult, tenantId, isDryRun, commercialCtx }),
    );

    if (isDryRun) {
      return {
        success:        true,
        mode:           "DRY_RUN",
        profileLabel:   header.runtimeLabel,
        safetyMessages: safety.messages,
        safetyWarnings: safety.warnings,
        dryRunResult:   runnerResult as TDry,
      };
    }

    // ── 10. Log en Control Plane (solo EXECUTE exitoso) ───────────
    const imp = runnerResult as TImp;
    try {
      await controlPlanePrisma.platformDeploymentLog.create({
        data: {
          organization_id: header.organizationId,
          action:          "RUN_IMPORT",
          status:          "SUCCESS",
          notes:           `Import ${config.datasetLabel} ${config.phase} — ${header.runtimeKind} ${header.runtimeLabel} (${header.environment}) — created: ${config.created(imp)}`,
          metadata: {
            ...config.buildLogMetadata(imp),
            profileId:        header.runtimeTargetId,
            profileLabel:     header.runtimeLabel,
            runtimeKind:      header.runtimeKind,
            runtimeTargetId:  header.runtimeTargetId,
            environment:      header.environment,
            organizationCode: header.organizationCode,
            mode:             "EXECUTE",
            tenantId,
            datasetKey:       config.datasetKey,
            importPolicy:     "CREATE_ONLY",
          },
        },
      });
    } catch {
      // log failure no bloquea la respuesta
    }

    return {
      success:        true,
      mode:           "EXECUTE",
      profileLabel:   header.runtimeLabel,
      safetyMessages: safety.messages,
      safetyWarnings: safety.warnings,
      importResult:   imp,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : config.unexpectedErrorMessage;
    return { success: false, error: sanitizeDataOnboardingError(raw) };
  }
}
