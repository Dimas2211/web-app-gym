// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-schema-version.ts
//
// FEX-PROD-0B — versión de schema FEX 11 del producto.
//
// La versión la fija el código, nunca el frontend ni una variable de
// entorno: todo DTE tipo 11 nuevo se construye y valida contra
// schemas/mh/fex-11-v3.schema.json (copia literal de fe-fex-v3.json,
// portal factura.gob.sv, publicación 2026-08-11, md5 e40610cf…).
//
// Los DteOutgoingDocument tipo 11 históricos con JSON v1 (TEST) quedan
// como evidencia y no se regeneran ni revalidan automáticamente. Firma y
// transmisión exigen version === 3 para no emitir un v1 nuevo por error:
// un v1 aún no firmado debe regenerarse (pipeline de generación).
// ─────────────────────────────────────────────────────────────────

export const FEX11_SCHEMA_VERSION = 3 as const;

/**
 * Lee identificacion.version de un json_document persistido (objeto
 * Prisma Json o string). Devuelve null si no es legible.
 */
export function readDteJsonIdentificacionVersion(jsonDocument: unknown): number | null {
  let doc: unknown = jsonDocument;
  if (typeof doc === "string") {
    try {
      doc = JSON.parse(doc);
    } catch {
      return null;
    }
  }
  if (!doc || typeof doc !== "object") return null;
  const identificacion = (doc as { identificacion?: unknown }).identificacion;
  if (!identificacion || typeof identificacion !== "object") return null;
  const version = (identificacion as { version?: unknown }).version;
  return typeof version === "number" ? version : null;
}

/**
 * Guardia para firma/transmisión FEX 11: solo JSON v3.
 * Devuelve el mensaje de error, o null si el documento es v3.
 */
export function fex11LegacyVersionError(jsonDocument: unknown): string | null {
  const version = readDteJsonIdentificacionVersion(jsonDocument);
  if (version === FEX11_SCHEMA_VERSION) return null;
  return (
    `El JSON de esta Factura de Exportación usa la versión de schema ${version ?? "desconocida"}; ` +
    `la versión vigente es ${FEX11_SCHEMA_VERSION}. Regenere el JSON del documento antes de firmarlo ` +
    `o transmitirlo (un documento ya firmado con la versión anterior no se transmite).`
  );
}
