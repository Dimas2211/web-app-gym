// ─────────────────────────────────────────────────────────────────
// commerce/dte — utils/mh20-builder-helpers.ts
//
// MH20 (BLOQUE 5F) — piezas comunes de los builders con perfil MH_2_0.
// Solo se usan en la rama MH_2_0: la rama MH_1_2 no las llama y produce
// exactamente el JSON histórico (golden __golden__/*.golden.json).
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { DteSpecProfile } from "../spec/dte-spec-profile";
import { resolveMhTerritory20, type MhTerritory } from "./dte-territory-projection";

/** Límite de resumen.observaciones (fe-f-v2 / fe-fse-v2 maxLength 3000; MH20-026). */
export const MH20_OBSERVACIONES_MAX = 3000;

/**
 * resumen.observaciones (MH20-026, campo 168). Recorta a 3000 y envía null
 * si está vacío. Ningún flujo productivo pasa todavía texto libre (decisión
 * interna pendiente #4 de 04-bloqueos-activacion.md: si sale.notes /
 * purchase.notes son aptos para el documento fiscal).
 */
export function normalizeMh20Observaciones(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MH20_OBSERVACIONES_MAX);
}

/**
 * MH20 (Fase 5.1D) — observaciones FISCALES explícitas (resumen.observaciones).
 *
 * Decisión de diseño: las notas internas (sale.notes, purchase.notes, notas
 * de administración) NUNCA se envían a Hacienda con el perfil MH_2_0. La
 * única fuente es el texto fiscal que el llamador entrega de forma explícita
 * en DteBuildProfileOptions.observaciones (hoy ningún flujo productivo lo
 * hace → null, que los schemas 2.0 admiten). Sin recorte silencioso: un
 * texto fiscal > 3000 caracteres es un error (no se altera el contenido).
 */
export type Mh20FiscalObservationsResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

export function resolveMh20FiscalObservations(explicit: string | null | undefined): Mh20FiscalObservationsResult {
  if (typeof explicit !== "string") return { ok: true, value: null };
  const trimmed = explicit.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > MH20_OBSERVACIONES_MAX) {
    return {
      ok:    false,
      error: `Las observaciones fiscales exceden ${MH20_OBSERVACIONES_MAX} caracteres (${trimmed.length}); no se recortan automáticamente.`,
    };
  }
  return { ok: true, value: trimmed };
}

export interface Mh20Direccion {
  departamento: string;
  municipio:    string;
  distrito:     string;
  complemento:  string;
}

export type Mh20DireccionResult =
  | { ok: true; direccion: Mh20Direccion | null }
  | { ok: false; error: string };

/**
 * Dirección 2.0 {departamento, municipio, distrito, complemento}
 * (SCH20-008/009/110/111/237/239/451). `required` = emisor (campo 28
 * requerido). Sin territorio y sin complemento → null (solo si no es
 * requerido). Nunca se inventa un complemento.
 */
export function buildMh20Direccion(params: {
  role:        string;
  territory:   MhTerritory | null;
  complemento: string | null | undefined;
  required:    boolean;
}): Mh20DireccionResult {
  const { role, territory, required } = params;
  const complemento = params.complemento?.trim() ?? "";
  if (!territory) {
    if (required) {
      return { ok: false, error: `La dirección del ${role} es obligatoria en MH 2.0 (departamento, municipio, distrito y complemento).` };
    }
    if (complemento) {
      return { ok: false, error: `La dirección del ${role} tiene complemento pero no departamento/municipio; complete la localidad desde el catálogo.` };
    }
    return { ok: true, direccion: null };
  }
  if (!complemento) {
    return { ok: false, error: `La dirección del ${role} no tiene complemento; MH 2.0 lo exige junto con el distrito.` };
  }
  return { ok: true, direccion: { ...territory, complemento } };
}

/** Sección 3 del número de control (MH20-003/077, IMP20-011). */
export const MH20_ESTABLISHMENT_SECTION = /^[MSBP][0-9]{3}P[0-9]{3}$/;

export function mh20ControlNumberSectionError(controlNumber: string | null | undefined): string | null {
  const section = (controlNumber ?? "").split("-")[2] ?? "";
  if (MH20_ESTABLISHMENT_SECTION.test(section)) return null;
  return (
    `El número de control "${controlNumber ?? ""}" no usa la codificación de establecimiento/punto de venta ` +
    `asignada por la AT (M|S|B|P + 3 dígitos y P + 3 dígitos), obligatoria en MH 2.0. Corrija cod_estable_mh / ` +
    `cod_punto_venta_mh del emisor; el número reservado no se modifica.`
  );
}

export interface Mh20PartyTerritories {
  emisor:   MhTerritory | null;
  receptor: MhTerritory | null;
}

/** Opciones comunes de los builders puros (default = MH_1_2, salida histórica). */
export interface DteBuildProfileOptions {
  profile?:       DteSpecProfile;
  /** Obligatorio con MH_2_0: territorios ya proyectados (resolveMh20PartyTerritories). */
  territories?:   Mh20PartyTerritories | null;
  /**
   * Observaciones FISCALES explícitas para resumen.observaciones (MH_2_0).
   * Nunca se derivan de notas internas (Fase 5.1D). Sin valor → null.
   */
  observaciones?: string | null;
}

/**
 * Renombra claves conservando su posición y elimina las indicadas
 * (p.ej. ivaRete1 → ivaRete, sin reteRenta). Pura.
 */
export function remapKeys(
  obj: Record<string, unknown>,
  rename: Readonly<Record<string, string>>,
  drop: readonly string[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (drop.includes(k)) continue;
    out[rename[k] ?? k] = v;
  }
  return out;
}

/**
 * Resuelve (solo lectura) los territorios 2.0 de emisor y receptor.
 * Con MH_1_2 no consulta nada y devuelve null.
 */
export async function resolveMh20PartyTerritories(
  profile: DteSpecProfile,
  emisor:   { deptCode: string | null | undefined; municipalityCode: string | null | undefined },
  receptor: { role: string; deptCode: string | null | undefined; municipalityCode: string | null | undefined } | null,
  db: PrismaClient,
): Promise<{ ok: true; territories: Mh20PartyTerritories | null } | { ok: false; error: string }> {
  if (profile !== "MH_2_0") return { ok: true, territories: null };
  const e = await resolveMhTerritory20({ role: "emisor", ...emisor }, db);
  if (!e.ok) return { ok: false, error: e.error };
  let r: MhTerritory | null = null;
  if (receptor) {
    const rr = await resolveMhTerritory20(receptor, db);
    if (!rr.ok) return { ok: false, error: rr.error };
    r = rr.territory;
  }
  return { ok: true, territories: { emisor: e.territory, receptor: r } };
}
