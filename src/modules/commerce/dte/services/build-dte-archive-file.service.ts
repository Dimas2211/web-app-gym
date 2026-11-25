// ─────────────────────────────────────────────────────────────────
// commerce/dte — build-dte-archive-file.service.ts
//
// MH20 (Fase 6, IMP20-021) — "Archivo DTE" entregable al RECEPTOR
// (Normativa 2.0 Anexo I §4/4.1 Cuadro 11; Manual Técnico v2 §6;
// MH20-024/025/066):
//
//   { <estructura de datos íntegra>, "firmaElectronica": "<JWS>", "selloRecibido": "<sello>" }
//   nombre: <codigoGeneracion>.json
//
// Tres representaciones distintas (no se mezclan):
//   1. Payload fiscal transmitido a MH  → signed_jws (body.documento).
//   2. Archivo DTE para el receptor     → ESTE servicio.
//   3. Payload contractual MariaDB      → build-external-dte-payload.service.ts
//      (contrato del proveedor SIN cambios: no se renombra a este formato).
//
// Reglas:
//   - Solo documentos/eventos MH 2.0 (FE v2, CCF v4, NC v4, FSE v2, FEX v3
//     con perfil persistido MH_2_0, Invalidación v3, Retorno v1). Los MH 1.2
//     conservan su entrega histórica (variant fiscal / external): no se
//     regeneran archivos históricos (MH20-094 abierto).
//   - Requiere sello de 40 caracteres alfanuméricos en mayúsculas (MT v2
//     ejemplos de respuesta; schemas de invalidación) y JWS compacto.
//   - NUNCA modifica el json_document firmado: copia profunda; si la raíz
//     ya trae firmaElectronica/selloRecibido, falla (no se sobrescribe).
//   - Generar el archivo NO es entregarlo: la entrega efectiva al receptor
//     (correo / portal) no se ejecuta aquí.
// Puro: sin base de datos, sin red.
// ─────────────────────────────────────────────────────────────────

import { checkDteDocumentSpecCoherence } from "../spec/dte-spec-guard";
import { validateMhEventJson, type MhEventKind } from "../spec/validate-mh-event-json";
import { parsePersistedDteJson } from "../spec/dte-json-version";

export const MH_RECEPTION_STAMP_RE = /^[A-Z0-9]{40}$/;
const JWS_COMPACT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UUID_RE = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/;

/** Eventos 2.0 cuya entrega al receptor exige Archivo DTE (MH20-066). */
const EVENT_KINDS_2_0: Partial<Record<MhEventKind, number>> = { INV: 3, "18": 1 };

export type DteArchiveFileResult =
  | { ok: true; fileName: string; content: string; archive: Record<string, unknown>; warnings: string[] }
  | { ok: false; code: "MH12_LEGACY_FORMAT" | "NOT_STAMPED" | "INVALID_SIGNATURE" | "INVALID_DOCUMENT" | "ROOT_COLLISION"; error: string };

export interface BuildDteArchiveFileParams {
  /** "01" | "03" | "05" | "11" | "14" | "INV" | "18" */
  kind:              string;
  jsonDocument:      unknown;
  signedJws:         string | null;
  receptionStamp:    string | null;
  /** mh_spec_profile persistido (documentos); null = inferir por versión. */
  persistedProfile?: string | null;
  environment:       string;
}

export function buildDteArchiveFile(p: BuildDteArchiveFileParams): DteArchiveFileResult {
  const doc = parsePersistedDteJson(p.jsonDocument);
  if (!doc) return { ok: false, code: "INVALID_DOCUMENT", error: "El documento no tiene un JSON legible." };

  // ── Normativa del documento ─────────────────────────────────────
  if (p.kind === "INV" || p.kind === "18") {
    const check = validateMhEventJson(p.kind, doc);
    if (!check.ok) return { ok: false, code: "INVALID_DOCUMENT", error: check.error };
    if (EVENT_KINDS_2_0[p.kind] !== check.version) {
      return { ok: false, code: "MH12_LEGACY_FORMAT", error: `El evento ${p.kind} v${check.version} es MH 1.2: se conserva su entrega histórica.` };
    }
  } else {
    const spec = checkDteDocumentSpecCoherence({ kind: p.kind, jsonDocument: doc, persistedProfile: p.persistedProfile ?? null });
    if (!spec.ok) return { ok: false, code: "INVALID_DOCUMENT", error: spec.error };
    if (spec.profile !== "MH_2_0") {
      return {
        ok: false, code: "MH12_LEGACY_FORMAT",
        error: `El documento ${p.kind} v${spec.version} (${spec.profile === "AMBIGUOUS" ? "FEX v3 sin perfil 2.0 persistido" : "MH 1.2"}) conserva su entrega histórica; no se regenera el archivo (MH20-094).`,
      };
    }
  }

  // ── Firma y sello ──────────────────────────────────────────────
  if (!p.receptionStamp || !MH_RECEPTION_STAMP_RE.test(p.receptionStamp)) {
    return { ok: false, code: "NOT_STAMPED", error: "El documento no tiene sello de recepción válido (40 caracteres alfanuméricos): no hay Archivo DTE." };
  }
  if (!p.signedJws || !JWS_COMPACT_RE.test(p.signedJws)) {
    return { ok: false, code: "INVALID_SIGNATURE", error: "El documento no tiene firma electrónica (JWS compacto) válida." };
  }
  if ("firmaElectronica" in doc || "selloRecibido" in doc) {
    return { ok: false, code: "ROOT_COLLISION", error: "El JSON fiscal ya contiene firmaElectronica/selloRecibido en la raíz; no se sobrescribe." };
  }

  const ident = (doc.identificacion ?? {}) as Record<string, unknown>;
  const codigo = typeof ident.codigoGeneracion === "string" ? ident.codigoGeneracion.toUpperCase() : "";
  if (!UUID_RE.test(codigo)) return { ok: false, code: "INVALID_DOCUMENT", error: "El documento no tiene identificacion.codigoGeneracion válido." };

  // Copia profunda: el json_document persistido nunca se muta.
  const archive: Record<string, unknown> = {
    ...(JSON.parse(JSON.stringify(doc)) as Record<string, unknown>),
    firmaElectronica: p.signedJws,
    selloRecibido:    p.receptionStamp,
  };
  const warnings: string[] = [];
  if (p.environment !== "PRODUCTION") warnings.push("Documento de ambiente de PRUEBAS: sin valor legal (MH20-008/070).");
  return { ok: true, fileName: `${codigo}.json`, content: JSON.stringify(archive), archive, warnings };
}
