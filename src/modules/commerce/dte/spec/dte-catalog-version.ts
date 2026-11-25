// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/dte-catalog-version.ts
//
// MH20 (IMP20-009, Fase 5.1A) — resolución de la VERSIÓN de catálogo
// DteCatalogItem según el perfil normativo.
//
//   MH_1_2 → version "1"   (filas históricas V1.2, default del modelo)
//   MH_2_0 → version "2.0" (filas 2.0, prisma/seeds/data/dte-catalog-items-mh20.data.ts)
//
// La unicidad persistida ya es (catalog_code, item_code, version), por lo
// que ambas versiones coexisten sin migración. TODA consulta de catálogo
// debe filtrar por versión: sin ese filtro, sembrar 2.0 expondría códigos
// 2.0 (p. ej. CAT-017 "11" Bitcoin, CAT-028 "cccc.ccc") en flujos 1.2.
//
// Sin herencia entre versiones: un catálogo sin cambios en 2.0 que no
// tenga filas "2.0" NO se completa con filas "1" de forma implícita; el
// llamador 2.0 decide explícitamente con resolveDteCatalogVersionFor().
// ─────────────────────────────────────────────────────────────────

import { DEFAULT_DTE_SPEC_PROFILE, type DteSpecProfile } from "./dte-spec-profile";

export const DTE_CATALOG_VERSION_MH12 = "1";
export const DTE_CATALOG_VERSION_MH20 = "2.0";

export type DteCatalogVersion = typeof DTE_CATALOG_VERSION_MH12 | typeof DTE_CATALOG_VERSION_MH20;

/**
 * Catálogos con contenido 2.0 versionado (sembrado como version "2.0").
 * El resto de catálogos no cambió de códigos en 2.0 (03-catalogos-impacto-zolvi
 * §4) y se resuelve con las filas V1.2 también bajo MH_2_0.
 */
export const DTE_CATALOGS_VERSIONED_MH20: ReadonlySet<string> = new Set([
  "CAT-002",
  "CAT-017",
  "CAT-024",
  "CAT-028",
  "CAT-033",
]);

/** Versión base del perfil (sin considerar el catálogo concreto). */
export function resolveDteCatalogVersion(profile: DteSpecProfile = DEFAULT_DTE_SPEC_PROFILE): DteCatalogVersion {
  return profile === "MH_2_0" ? DTE_CATALOG_VERSION_MH20 : DTE_CATALOG_VERSION_MH12;
}

/**
 * Versión efectiva de un catálogo concreto bajo un perfil.
 *   - MH_1_2 → siempre "1".
 *   - MH_2_0 → "2.0" si el catálogo tiene contenido 2.0 versionado; "1" si
 *     el catálogo no cambió de códigos (decisión explícita, no fallback).
 */
export function resolveDteCatalogVersionFor(
  catalogCode: string,
  profile: DteSpecProfile = DEFAULT_DTE_SPEC_PROFILE,
): DteCatalogVersion {
  if (profile !== "MH_2_0") return DTE_CATALOG_VERSION_MH12;
  return DTE_CATALOGS_VERSIONED_MH20.has(catalogCode) ? DTE_CATALOG_VERSION_MH20 : DTE_CATALOG_VERSION_MH12;
}

/** Fragmento `where` Prisma para un catálogo bajo un perfil. */
export function dteCatalogWhere(
  catalogCode: string,
  profile: DteSpecProfile = DEFAULT_DTE_SPEC_PROFILE,
): { catalog_code: string; version: DteCatalogVersion } {
  return { catalog_code: catalogCode, version: resolveDteCatalogVersionFor(catalogCode, profile) };
}
