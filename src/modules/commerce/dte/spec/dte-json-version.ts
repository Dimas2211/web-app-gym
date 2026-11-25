// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/dte-json-version.ts
//
// MH20 (IMP20-002) — lectura genérica de identificacion.version de un
// json_document / event_json persistido (objeto Prisma Json o string).
//
// Generaliza readDteJsonIdentificacionVersion (antes privado de FEX 11).
// Todos los DTE y eventos MH (FE, CCF, NC, FEX, FSE, Invalidación,
// Contingencia, Retorno, OE) llevan la versión en identificacion.version.
// ─────────────────────────────────────────────────────────────────

/** Parsea un Json persistido; null si no es un objeto legible. */
export function parsePersistedDteJson(jsonDocument: unknown): Record<string, unknown> | null {
  let doc: unknown = jsonDocument;
  if (typeof doc === "string") {
    try {
      doc = JSON.parse(doc);
    } catch {
      return null;
    }
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  return doc as Record<string, unknown>;
}

/**
 * Devuelve identificacion.version (entero) o null si no es legible.
 * No infiere ni rellena: un documento sin versión no tiene versión.
 */
export function readDteJsonVersion(jsonDocument: unknown): number | null {
  const doc = parsePersistedDteJson(jsonDocument);
  if (!doc) return null;
  const identificacion = doc.identificacion;
  if (!identificacion || typeof identificacion !== "object") return null;
  const version = (identificacion as { version?: unknown }).version;
  return typeof version === "number" && Number.isInteger(version) ? version : null;
}
