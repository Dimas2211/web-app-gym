// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — data-onboarding-limits.ts
//
// ONBOARDING-5K. Límites ÚNICOS del Data Onboarding Center. Puro y
// seguro para cliente (sin Prisma, sin Node APIs): lo consumen el
// parser, el pipeline server-side, los runners y la UI.
//
// Contrato:
// - El parser conserva TODAS las filas no vacías (hasta
//   DATA_ONBOARDING_MAX_IMPORT_ROWS) para el análisis y la escritura.
//   Un archivo que excede el máximo se rechaza entero antes de cualquier
//   escritura — nunca se trunca.
// - DATA_ONBOARDING_VIEW_ROWS_LIMIT solo acota lo que viaja al navegador
//   para mostrarse. Jamás determina cuántas filas se analizan o importan.
// - DATA_ONBOARDING_MAX_FILE_BYTES debe coincidir con
//   experimental.serverActions.bodySizeLimit (next.config.ts) y quedar
//   por debajo del límite de cuerpo de Vercel Functions (4.5 MB).
// ─────────────────────────────────────────────────────────────────

/** Máximo de registros NO vacíos por archivo Excel (todos los datasets). */
export const DATA_ONBOARDING_MAX_IMPORT_ROWS = 5000;

/** Tamaño máximo del archivo .xlsx (4 MB — ver next.config.ts y límite de Vercel 4.5 MB). */
export const DATA_ONBOARDING_MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Filas máximas que se envían al navegador por panel (muestra; prioriza filas con problemas). */
export const DATA_ONBOARDING_VIEW_ROWS_LIMIT = 200;

/** Tamaño de lote interno para inserciones (createMany) dentro de la misma transacción. */
export const DATA_ONBOARDING_WRITE_BATCH_SIZE = 500;

export function formatDataOnboardingCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function dataOnboardingFileTooLargeMessage(sizeBytes: number): string {
  return (
    `El archivo excede el tamaño máximo de ${DATA_ONBOARDING_MAX_FILE_BYTES / 1024 / 1024} MB ` +
    `(${(sizeBytes / 1024 / 1024).toFixed(2)} MB recibidos). Divídalo en varios archivos.`
  );
}

export function dataOnboardingRowLimitMessage(nonEmptyRows: number): string {
  return (
    `El archivo contiene ${formatDataOnboardingCount(nonEmptyRows)} registros no vacíos y el máximo por importación es ` +
    `${formatDataOnboardingCount(DATA_ONBOARDING_MAX_IMPORT_ROWS)}. Divida el archivo: no se analiza ni se importa ` +
    "ninguna fila (no hay importación parcial)."
  );
}
