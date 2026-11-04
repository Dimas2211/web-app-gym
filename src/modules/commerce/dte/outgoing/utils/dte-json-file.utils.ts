// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-json-file.utils.ts
//
// Helpers puros compartidos (servidor + cliente) para la descarga del
// JSON original de un DTE. Sin dependencias de Prisma ni de React.
// ─────────────────────────────────────────────────────────────────

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "");
}

/**
 * Nombre de archivo: DTE_{tipo}_{codigoGeneracion}.json
 * Ej.: DTE_01_CB09D13B-EFB3-40C5-933C-41E7C1C9606D.json
 * Sin código de generación → usa el id interno del documento.
 */
export function buildDteJsonFileName(input: {
  dte_type_code:   string;
  generation_code: string | null;
  id:              string;
}): string {
  const type = safeSegment(input.dte_type_code) || "XX";
  const code = safeSegment((input.generation_code ?? "").toUpperCase()) || safeSegment(input.id);
  return `DTE_${type}_${code}.json`;
}

/**
 * Serializa el JSON persistido para descarga/visualización. Solo
 * formatea (indentación 2) — nunca altera valores, tipos ni nulos.
 */
export function serializeDteJsonDocument(json: unknown): string {
  return JSON.stringify(json, null, 2);
}
