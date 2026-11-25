// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/validate-mh-event-json.ts
//
// MH20 (Fase 6, IMP20-002/018/019/022/023) — validación AJV de EVENTOS
// fiscales (Invalidación, Contingencia, Retorno, Operaciones Especiales)
// contra el schema oficial que corresponde a la versión que el PROPIO
// evento declara en identificacion.version (D3).
//
//   INV  v2 → anulacion-schema-v2.json      v3 → v2_0/invalidacion-schema-v3.json
//   CONT v3 → contingencia-schema-v3.json   v4 → v2_0/contingencia-schema-v4.json
//   18   v1 → v2_0/fe-eret-v1.json
//   17   v1 → v2_0/fe-eop-v1.json
//
// Los schemas son copia literal de los originales (SHA256SUMS.md). Una
// versión desconocida es un error explícito: nunca se cae a un schema por
// defecto. Compiladores en caché por schema. Puro: sin base de datos.
//
// El formato de error reproduce exactamente el de los builders históricos
// (filtra los errores "if", traduce additionalProperties) para que los
// mensajes de MH_1_2 no cambien.
// ─────────────────────────────────────────────────────────────────

import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { readDteJsonVersion } from "./dte-json-version";
import {
  getDteSchemaByVersion,
  listKnownDteVersions,
  type DteSchemaId,
} from "./dte-spec-registry";

export type MhEventKind = "INV" | "CONT" | "17" | "18";

export interface MhEventValidationError {
  path:    string;
  message: string;
}

export type ValidateMhEventJsonResult =
  | { ok: true; version: number; schemaId: DteSchemaId }
  | { ok: false; error: string; validation_errors: MhEventValidationError[] };

const compiled = new Map<DteSchemaId, ValidateFunction>();

function compiledFor(schemaId: DteSchemaId, schema: object): ValidateFunction {
  const hit = compiled.get(schemaId);
  if (hit) return hit;
  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const fn = ajv.compile(schema);
  compiled.set(schemaId, fn);
  return fn;
}

/** Formatea errores AJV como los builders históricos ("path: mensaje"). */
export function formatAjvErrors(errors: ValidateFunction["errors"]): MhEventValidationError[] {
  const all = errors ?? [];
  const leaf = all.filter((e) => e.keyword !== "if");
  const show = leaf.length > 0 ? leaf : all;
  return show.map((e) => {
    let message = e.message ?? "Error de validación";
    const extra = (e.params as Record<string, unknown>)?.additionalProperty;
    if (e.keyword === "additionalProperties" && typeof extra === "string") {
      message = `propiedad adicional no permitida: "${extra}"`;
    }
    return { path: e.instancePath || "(raíz)", message };
  });
}

export function validateMhEventJson(kind: MhEventKind, eventJson: unknown): ValidateMhEventJsonResult {
  const version = readDteJsonVersion(eventJson);
  if (version === null) {
    return {
      ok:    false,
      error: `El evento "${kind}" no declara identificacion.version; no se puede seleccionar el schema oficial MH.`,
      validation_errors: [{ path: "/identificacion/version", message: "versión ausente o no entera" }],
    };
  }
  const selected = getDteSchemaByVersion(kind, version);
  if (!selected) {
    return {
      ok:    false,
      error:
        `No existe schema oficial MH para el evento "${kind}" versión ${version} ` +
        `(versiones conocidas: ${listKnownDteVersions(kind).join(", ") || "ninguna"}).`,
      validation_errors: [{ path: "/identificacion/version", message: `versión ${version} desconocida` }],
    };
  }
  const validate = compiledFor(selected.schemaId, selected.schema);
  if (validate(eventJson)) return { ok: true, version, schemaId: selected.schemaId };
  return {
    ok:    false,
    error: `El evento no cumple el schema oficial MH (${selected.schemaId}).`,
    validation_errors: formatAjvErrors(validate.errors),
  };
}
