// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/dte-spec-guard.ts
//
// MH20 (IMP20-003) — guardias de versión fiscal para firma y transmisión.
// Generaliza fex11LegacyVersionError a todos los tipos y perfiles.
//
// Coherencia exigida (BLOQUE 5C):
//   versión persistida (identificacion.version del json_document)
//   ↔ perfil persistido (DteOutgoingDocument.mh_spec_profile, si existe)
//   ↔ schema seleccionado (registro por tipo + versión)
//   ↔ versión enviada a MH (se toma SIEMPRE de identificacion.version).
//
// Un documento histórico con mh_spec_profile = NULL se infiere por su
// versión (sin backfill). Un documento firmado nunca se regenera aquí.
// ─────────────────────────────────────────────────────────────────

import { readDteJsonVersion } from "./dte-json-version";
import { isDteSpecProfile, type DteSpecProfile } from "./dte-spec-profile";
import {
  getDteSchemaByVersion,
  getDteSpecVersion,
  inferProfileFromDocument,
  isDteSpecKind,
  isVersionOfProfile,
  listKnownDteVersions,
  type DteSchemaId,
  type DteSpecKind,
} from "./dte-spec-registry";

export type DteDocumentSpecCoherence =
  | {
      ok:       true;
      kind:     DteSpecKind;
      version:  number;
      /** Perfil persistido, o inferido si es NULL (AMBIGUOUS = FEX v3). */
      profile:  DteSpecProfile | "AMBIGUOUS";
      schemaId: DteSchemaId;
      /**
       * DOCUMENT = versión leída del json_document.
       * LEGACY_FALLBACK = histórico sin versión legible ni perfil persistido:
       * se usa la versión MH_1_2 del registro (comportamiento previo exacto).
       */
      versionSource: "DOCUMENT" | "LEGACY_FALLBACK";
    }
  | { ok: false; error: string };

export function checkDteDocumentSpecCoherence(params: {
  kind:             string;
  jsonDocument:     unknown;
  persistedProfile?: string | null;
}): DteDocumentSpecCoherence {
  const { kind, jsonDocument, persistedProfile } = params;
  if (!isDteSpecKind(kind)) {
    return { ok: false, error: `Tipo DTE sin especificación fiscal registrada: "${kind}".` };
  }
  const version = readDteJsonVersion(jsonDocument);
  if (version === null) {
    // Compatibilidad histórica: un documento sin perfil persistido (NULL,
    // anterior a M1) cuyo JSON no expone versión se trata como MH_1_2,
    // exactamente como antes (tabla fija por tipo). Con perfil persistido
    // se exige versión legible (fail-closed).
    if (persistedProfile === null || persistedProfile === undefined) {
      const legacyVersion = getDteSpecVersion("MH_1_2", kind);
      const legacySchema  = getDteSchemaByVersion(kind, legacyVersion);
      if (legacySchema) {
        return {
          ok: true, kind, version: legacyVersion, profile: "MH_1_2",
          schemaId: legacySchema.schemaId, versionSource: "LEGACY_FALLBACK",
        };
      }
    }
    return { ok: false, error: "El JSON del documento no tiene identificacion.version legible." };
  }
  const schema = getDteSchemaByVersion(kind, version);
  if (!schema) {
    return {
      ok:    false,
      error:
        `La versión ${version} no es una versión fiscal conocida para el tipo "${kind}" ` +
        `(conocidas: ${listKnownDteVersions(kind).join(", ") || "ninguna"}).`,
    };
  }
  if (persistedProfile !== null && persistedProfile !== undefined) {
    if (!isDteSpecProfile(persistedProfile)) {
      return { ok: false, error: `Perfil normativo persistido desconocido: "${persistedProfile}".` };
    }
    if (!isVersionOfProfile(persistedProfile, kind, version)) {
      return {
        ok:    false,
        error:
          `Incoherencia fiscal: el documento declara versión ${version} pero fue generado con el perfil ` +
          `${persistedProfile} (que exige versión ${getDteSpecVersion(persistedProfile, kind)}). Operación bloqueada.`,
      };
    }
    return { ok: true, kind, version, profile: persistedProfile, schemaId: schema.schemaId, versionSource: "DOCUMENT" };
  }
  const inferred = inferProfileFromDocument(kind, version);
  if (!inferred) {
    return { ok: false, error: `La versión ${version} del tipo "${kind}" no pertenece a ningún perfil normativo.` };
  }
  return { ok: true, kind, version, profile: inferred, schemaId: schema.schemaId, versionSource: "DOCUMENT" };
}

/**
 * Guardia de FIRMA: un documento aún no firmado cuyo JSON corresponde a
 * un perfil distinto del activo del emisor debe regenerarse (mismo
 * numeroControl y codigoGeneracion; nunca un correlativo nuevo).
 * Devuelve el mensaje de error o null.
 */
export function unsignedDocumentProfileMismatchError(params: {
  kind:          DteSpecKind;
  version:       number;
  activeProfile: DteSpecProfile;
}): string | null {
  const { kind, version, activeProfile } = params;
  if (isVersionOfProfile(activeProfile, kind, version)) return null;
  return (
    `El JSON de este documento usa la versión ${version}, pero el perfil normativo activo del emisor ` +
    `(${activeProfile}) exige la versión ${getDteSpecVersion(activeProfile, kind)}. Regenere el JSON del ` +
    `documento antes de firmarlo (se conservan numeroControl y codigoGeneracion).`
  );
}
