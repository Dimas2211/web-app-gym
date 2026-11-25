// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/dte-spec-registry.ts
//
// MH20 (IMP20-001, D2) — registro central de especificaciones fiscales.
//
// ÚNICO punto que conoce (perfil, tipo) → versión + schema oficial.
// Tabla §2.2 de docs/fiscal/mh-normativa-2.0/auditoria/04-diseno-tecnico.md.
//
//   Tipo  │ MH_1_2                       │ MH_2_0                              │ Estado
//   01 FE │ v1 fe-01.schema.json         │ v2 v2_0/fe-f-v2.json                │ SCH20-001
//   03 CCF│ v3 ccfe-03.schema.json       │ v4 v2_0/fe-ccf-v4.json              │ SCH20-102
//   05 NC │ v3 fe-nc-v3.json             │ v4 v2_0/fe-nc-v4.json               │ SCH20-222
//   11 FEX│ v3 fex-11-v3.schema.json     │ v3 (mismo archivo, SHA idéntico)    │ pending INC-003
//   14 FSE│ v1 fse-14.schema.json        │ v2 v2_0/fe-fse-v2.json              │ SCH20-446
//   INV   │ v2 anulacion-schema-v2.json  │ v3 v2_0/invalidacion-schema-v3.json │ SCH20-513 (plazos INC-004/006)
//   CONT  │ v3 contingencia-schema-v3    │ v4 v2_0/contingencia-schema-v4.json │ pending INC-005
//   18 RET│ —                            │ v1 v2_0/fe-eret-v1.json             │ sin endpoint (MT-GAP-001)
//   17 OE │ —                            │ v1 v2_0/fe-eop-v1.json              │ por autorización (INC-001)
//
// Los schemas v2_0/ son copia literal de
// docs/fiscal/mh-normativa-2.0/originales/svfe-json-schemas/ (SHA-256 en
// schemas/mh/v2_0/SHA256SUMS.md). Ningún schema histórico se modifica.
//
// Validación por versión (D3): getDteSchemaByVersion(kind, version) elige
// el schema por la versión que el PROPIO documento lleva en
// identificacion.version, nunca por la configuración actual del emisor.
// ─────────────────────────────────────────────────────────────────

import feV1Schema      from "../schemas/mh/fe-01.schema.json";
import ccfV3Schema     from "../schemas/mh/ccfe-03.schema.json";
import ncV3Schema      from "../schemas/mh/fe-nc-v3.json";
import fexV3Schema     from "../schemas/mh/fex-11-v3.schema.json";
import fseV1Schema     from "../schemas/mh/fse-14.schema.json";
import invV2Schema     from "../schemas/mh/anulacion-schema-v2.json";
import contV3Schema    from "../schemas/mh/contingencia-schema-v3.json";
import feV2Schema      from "../schemas/mh/v2_0/fe-f-v2.json";
import ccfV4Schema     from "../schemas/mh/v2_0/fe-ccf-v4.json";
import ncV4Schema      from "../schemas/mh/v2_0/fe-nc-v4.json";
import fseV2Schema     from "../schemas/mh/v2_0/fe-fse-v2.json";
import invV3Schema     from "../schemas/mh/v2_0/invalidacion-schema-v3.json";
import contV4Schema    from "../schemas/mh/v2_0/contingencia-schema-v4.json";
import retV1Schema     from "../schemas/mh/v2_0/fe-eret-v1.json";
import eopV1Schema     from "../schemas/mh/v2_0/fe-eop-v1.json";
import type { DteSpecProfile } from "./dte-spec-profile";

// ── Tipos ─────────────────────────────────────────────────────────

/** Tipos de documento / evento con especificación registrada. */
export const DTE_SPEC_KINDS = ["01", "03", "05", "11", "14", "INV", "CONT", "17", "18"] as const;
export type DteSpecKind = (typeof DTE_SPEC_KINDS)[number];

export function isDteSpecKind(value: unknown): value is DteSpecKind {
  return typeof value === "string" && (DTE_SPEC_KINDS as readonly string[]).includes(value);
}

/** Identificador estable del archivo de schema (ruta relativa a schemas/mh/). */
export type DteSchemaId =
  | "fe-01.schema.json"
  | "ccfe-03.schema.json"
  | "fe-nc-v3.json"
  | "fex-11-v3.schema.json"
  | "fse-14.schema.json"
  | "anulacion-schema-v2.json"
  | "contingencia-schema-v3.json"
  | "v2_0/fe-f-v2.json"
  | "v2_0/fe-ccf-v4.json"
  | "v2_0/fe-nc-v4.json"
  | "v2_0/fe-fse-v2.json"
  | "v2_0/invalidacion-schema-v3.json"
  | "v2_0/contingencia-schema-v4.json"
  | "v2_0/fe-eret-v1.json"
  | "v2_0/fe-eop-v1.json";

export interface DteSpecEntry {
  kind:     DteSpecKind;
  profile:  DteSpecProfile;
  version:  number;
  schemaId: DteSchemaId;
  /**
   * Contradicción oficial abierta: la entrada existe para desarrollo y
   * pruebas TEST, pero la generación en PRODUCTION falla de forma
   * cerrada (04-diseno-tecnico.md §2.2, regla de seguridad).
   */
  pendingConfirmation?: string;
  /** Funcionalidad bloqueada (no implementada en esta fase / sin endpoint). */
  blocked?: string;
  /**
   * MH20 (Fase 6) — la generación, validación y firma locales están
   * implementadas, pero la TRANSMISIÓN a MH está bloqueada en cualquier
   * ambiente (p. ej. endpoint no documentado, MT-GAP-001).
   */
  transmissionBlocked?: string;
}

// ── Tabla de schemas por (kind, version) ──────────────────────────

const SCHEMAS_BY_ID: Readonly<Record<DteSchemaId, object>> = Object.freeze({
  "fe-01.schema.json":                feV1Schema   as object,
  "ccfe-03.schema.json":              ccfV3Schema  as object,
  "fe-nc-v3.json":                    ncV3Schema   as object,
  "fex-11-v3.schema.json":            fexV3Schema  as object,
  "fse-14.schema.json":               fseV1Schema  as object,
  "anulacion-schema-v2.json":         invV2Schema  as object,
  "contingencia-schema-v3.json":      contV3Schema as object,
  "v2_0/fe-f-v2.json":                feV2Schema   as object,
  "v2_0/fe-ccf-v4.json":              ccfV4Schema  as object,
  "v2_0/fe-nc-v4.json":               ncV4Schema   as object,
  "v2_0/fe-fse-v2.json":              fseV2Schema  as object,
  "v2_0/invalidacion-schema-v3.json": invV3Schema  as object,
  "v2_0/contingencia-schema-v4.json": contV4Schema as object,
  "v2_0/fe-eret-v1.json":             retV1Schema  as object,
  "v2_0/fe-eop-v1.json":              eopV1Schema  as object,
});

/** (kind, version) → schema. FEX v3 es común a ambos perfiles. */
const SCHEMA_ID_BY_KIND_VERSION: Readonly<Record<DteSpecKind, Readonly<Record<number, DteSchemaId>>>> = Object.freeze({
  "01":   { 1: "fe-01.schema.json",           2: "v2_0/fe-f-v2.json" },
  "03":   { 3: "ccfe-03.schema.json",         4: "v2_0/fe-ccf-v4.json" },
  "05":   { 3: "fe-nc-v3.json",               4: "v2_0/fe-nc-v4.json" },
  "11":   { 3: "fex-11-v3.schema.json" },
  "14":   { 1: "fse-14.schema.json",          2: "v2_0/fe-fse-v2.json" },
  "INV":  { 2: "anulacion-schema-v2.json",    3: "v2_0/invalidacion-schema-v3.json" },
  "CONT": { 3: "contingencia-schema-v3.json", 4: "v2_0/contingencia-schema-v4.json" },
  "17":   { 1: "v2_0/fe-eop-v1.json" },
  "18":   { 1: "v2_0/fe-eret-v1.json" },
});

// ── Tabla (perfil, kind) → especificación ─────────────────────────

type SpecTable = Readonly<Record<DteSpecProfile, Partial<Readonly<Record<DteSpecKind, DteSpecEntry>>>>>;

function entry(
  profile: DteSpecProfile,
  kind: DteSpecKind,
  version: number,
  extra: Pick<DteSpecEntry, "pendingConfirmation" | "blocked" | "transmissionBlocked"> = {},
): DteSpecEntry {
  const schemaId = SCHEMA_ID_BY_KIND_VERSION[kind][version];
  if (!schemaId) throw new Error(`dte-spec-registry: falta schema para ${kind} v${version}`);
  return Object.freeze({ kind, profile, version, schemaId, ...extra });
}

const SPEC_TABLE: SpecTable = Object.freeze({
  MH_1_2: Object.freeze({
    "01":   entry("MH_1_2", "01",   1),
    "03":   entry("MH_1_2", "03",   3),
    "05":   entry("MH_1_2", "05",   3),
    "11":   entry("MH_1_2", "11",   3),
    "14":   entry("MH_1_2", "14",   1),
    "INV":  entry("MH_1_2", "INV",  2),
    "CONT": entry("MH_1_2", "CONT", 3),
  }),
  MH_2_0: Object.freeze({
    "01":   entry("MH_2_0", "01",   2),
    "03":   entry("MH_2_0", "03",   4),
    "05":   entry("MH_2_0", "05",   4),
    "11":   entry("MH_2_0", "11",   3, { pendingConfirmation: "INC-003" }),
    "14":   entry("MH_2_0", "14",   2),
    // Fase 6 (IMP20-018): builder v3 implementado. Plazos y fecha del
    // plazos sin confirmar (INC-004) → PRODUCTION fail-closed. INC-006 (fecha
    // del evento) quedó resuelto documentalmente en Fase 6.1.
    "INV":  entry("MH_2_0", "INV",  3, { pendingConfirmation: "INC-004" }),
    // Fase 6 (IMP20-019): builder v4 implementado y validado localmente,
    // pero la versión del evento sigue en contradicción oficial (INC-005)
    // y la emisión de DTE 2.0 en contingencia está bloqueada (R20-PEND-01).
    // El flujo persistido no construye ni transmite v4.
    "CONT": entry("MH_2_0", "CONT", 4, {
      pendingConfirmation: "INC-005",
      blocked:             "INC-005 (versión del Evento de Contingencia 3 vs 4) + R20-PEND-01",
      transmissionBlocked: "INC-005",
    }),
    "17":   entry("MH_2_0", "17",   1, {
      pendingConfirmation: "INC-001",
      blocked: "MT-GAP-001 + autorización del emisor (MH20-063)",
      transmissionBlocked: "MT-GAP-001 (endpoint de recepción del Evento de Operaciones Especiales no documentado)",
    }),
    // Fase 6 (IMP20-022): Retorno local implementado (persistencia M2,
    // builder, AJV, reglas, firma). Transmisión bloqueada: el Manual
    // Técnico v2 no documenta el endpoint (MT-GAP-001). Plazo: INC-013.
    "18":   entry("MH_2_0", "18",   1, {
      pendingConfirmation: "INC-013",
      transmissionBlocked: "MT-GAP-001 (endpoint de recepción del Evento de Retorno no documentado)",
    }),
  }),
});

// ── API pública ───────────────────────────────────────────────────

/** Especificación vigente para (perfil, tipo); null si el tipo no existe en ese perfil. */
export function getDteSpec(profile: DteSpecProfile, kind: DteSpecKind): DteSpecEntry | null {
  return SPEC_TABLE[profile][kind] ?? null;
}

/** Versión de identificacion.version que debe llevar un documento nuevo (perfil, tipo). */
export function getDteSpecVersion(profile: DteSpecProfile, kind: DteSpecKind): number {
  const spec = getDteSpec(profile, kind);
  if (!spec) throw new Error(`El tipo "${kind}" no existe en el perfil normativo ${profile}.`);
  return spec.version;
}

/** Schema oficial para validar un documento según SU propia versión (D3). */
export function getDteSchemaByVersion(
  kind: DteSpecKind,
  version: number,
): { schemaId: DteSchemaId; schema: object } | null {
  const schemaId = SCHEMA_ID_BY_KIND_VERSION[kind]?.[version];
  if (!schemaId) return null;
  return { schemaId, schema: SCHEMAS_BY_ID[schemaId] };
}

/** Versiones conocidas de un tipo (para mensajes de error). */
export function listKnownDteVersions(kind: DteSpecKind): number[] {
  return Object.keys(SCHEMA_ID_BY_KIND_VERSION[kind] ?? {}).map(Number).sort((a, b) => a - b);
}

/**
 * Perfil normativo inferido desde (tipo, versión) de un documento.
 *   - Versión exclusiva de un perfil → ese perfil.
 *   - Versión común a ambos (FEX v3) → "AMBIGUOUS".
 *   - Versión desconocida → null.
 */
export function inferProfileFromDocument(
  kind: DteSpecKind,
  version: number,
): DteSpecProfile | "AMBIGUOUS" | null {
  const in12 = SPEC_TABLE.MH_1_2[kind]?.version === version;
  const in20 = SPEC_TABLE.MH_2_0[kind]?.version === version;
  if (in12 && in20) return "AMBIGUOUS";
  if (in12) return "MH_1_2";
  if (in20) return "MH_2_0";
  return null;
}

/** ¿Es compatible la versión del documento con el perfil indicado? */
export function isVersionOfProfile(profile: DteSpecProfile, kind: DteSpecKind, version: number): boolean {
  return SPEC_TABLE[profile][kind]?.version === version;
}

/**
 * MH20 (Fase 6) — error de transmisión bloqueada para (perfil, tipo), o
 * null si la transmisión está permitida por el registro. Independiente del
 * ambiente: un bloqueo de transmisión aplica también en TEST.
 */
export function dteSpecTransmissionBlockedError(profile: DteSpecProfile, kind: DteSpecKind): string | null {
  const spec = SPEC_TABLE[profile][kind];
  if (!spec) return `El tipo "${kind}" no existe en el perfil normativo ${profile}.`;
  if (!spec.transmissionBlocked) return null;
  return `La transmisión de "${kind}" con el perfil ${profile} está bloqueada: ${spec.transmissionBlocked}.`;
}

/** Todas las entradas (para tests de registro / reportes). */
export function listDteSpecEntries(): DteSpecEntry[] {
  return (Object.keys(SPEC_TABLE) as DteSpecProfile[]).flatMap(
    (p) => Object.values(SPEC_TABLE[p]).filter((e): e is DteSpecEntry => Boolean(e)),
  );
}
