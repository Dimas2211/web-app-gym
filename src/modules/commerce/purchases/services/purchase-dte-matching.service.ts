// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-dte-matching.service.ts
//
// Matching sugerido de proveedor y productos desde un DTE importado.
// Solo lee y sugiere; no crea, modifica ni elimina ningún registro.
// Sin librerías externas de fuzzy search — lógica simple de solapamiento
// de palabras, mantenible y sin dependencias nuevas.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type {
  DteItemDetected,
  DteItemMatch,
  DteMatchResult,
  DteProductSuggestion,
  DteSupplierDetected,
  DteSupplierMatch,
  DteSupplierSuggestion,
  MatchConfidence,
  MatchTypeProduct,
  MatchTypeSupplier,
} from "../types/purchase-dte-import.types";
import type { PurchaseDteImportRecord } from "../types/purchase-dte-import.types";

// ── Constantes ────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "und", "unidad",
  "servicio", "producto", "y", "en", "a", "con", "por", "para",
  "un", "una", "se", "su", "al",
]);

const SUPPLIER_FETCH_LIMIT = 500;
const PRODUCT_FETCH_LIMIT  = 500;
const MAX_ALTERNATIVES     = 3;

// Umbrales de confianza para coincidencia por nombre
const THRESHOLD_MEDIUM = 70;  // score >= 70 → MEDIUM
const THRESHOLD_LOW    = 40;  // score >= 40 → LOW  (por debajo de LOW: NONE)

// ── Normalización de texto ─────────────────────────────────────────
// Minúsculas, quita tildes (NFD + strip combining marks), reemplaza
// no-alfanumérico con espacio, compacta espacios.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Score de solapamiento de palabras (0–100) ─────────────────────
// Cuenta qué fracción de las palabras relevantes de `query`
// aparecen en `target`. Ignora stopwords y palabras < 3 chars.

function wordOverlapScore(query: string, target: string): number {
  const qNorm  = normalize(query);
  const tNorm  = normalize(target);
  const qWords = qNorm.split(" ").filter(w => w.length >= 3 && !STOPWORDS.has(w));
  if (qWords.length === 0) return 0;
  const tWords = new Set(tNorm.split(" ").filter(w => w.length >= 3 && !STOPWORDS.has(w)));
  const matched = qWords.filter(w => tWords.has(w)).length;
  return Math.round((matched / qWords.length) * 100);
}

// ── Helpers de confianza / tipo por score ─────────────────────────

function nameConfidence(score: number): MatchConfidence {
  if (score >= THRESHOLD_MEDIUM) return "MEDIUM";
  return "LOW";
}

function productMatchType(score: number): MatchTypeProduct {
  if (score >= THRESHOLD_MEDIUM) return "NAME_SIMILAR";
  return "PARTIAL_WORDS";
}

// ── Helpers de lectura segura de campos de un objeto ─────────────

function safeStr(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function safeNum(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (isFinite(n)) return n;
  }
  return null;
}

// ── Parser seguro de una línea del cuerpoDocumento ────────────────
// Devuelve null si el item no es un objeto o no tiene numItem válido.
// No lanza excepciones ante campos ausentes o con tipo incorrecto.

function parseDteLine(
  item: unknown,
): { lineNumber: number; detected: DteItemDetected } | null {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
  const obj     = item as Record<string, unknown>;
  const lineNum = safeNum(obj, "numItem");
  if (lineNum === null) return null;

  // Importes de línea
  const rawVentaGravada = safeNum(obj, "ventaGravada");
  const rawVentaExenta  = safeNum(obj, "ventaExenta");
  const rawVentaNoSuj   = safeNum(obj, "ventaNoSuj");
  const ventaGravada    = rawVentaGravada ?? 0;
  const ventaExenta     = rawVentaExenta  ?? 0;
  const ventaNoSuj      = rawVentaNoSuj   ?? 0;
  const lineTotal       = ventaGravada + ventaExenta + ventaNoSuj;

  // Tributos: suma del campo "monto" dentro de cada elemento del array
  let taxAmount: number | null = null;
  if (Array.isArray(obj["tributos"])) {
    taxAmount = (obj["tributos"] as unknown[]).reduce<number>((acc, t) => {
      if (t !== null && typeof t === "object" && !Array.isArray(t)) {
        const m = safeNum(t as Record<string, unknown>, "monto");
        return m !== null ? acc + m : acc;
      }
      return acc;
    }, 0);
  }

  const hasAnyAmount =
    rawVentaGravada !== null || rawVentaExenta !== null || rawVentaNoSuj !== null;

  return {
    lineNumber: lineNum,
    detected: {
      code:            safeStr(obj, "codigo"),
      description:     safeStr(obj, "descripcion"),
      quantity:        safeNum(obj, "cantidad"),
      unit_code:       safeNum(obj, "uniMedida"),
      unit_price:      safeNum(obj, "precioUni"),
      discount_amount: safeNum(obj, "montoDescu"),
      taxable_amount:  rawVentaGravada,
      tax_amount:      taxAmount,
      line_total:      hasAnyAmount ? lineTotal : null,
    },
  };
}

// ── Sugerencias vacías (sin coincidencia) ─────────────────────────

function noSupplierSuggestion(): DteSupplierSuggestion {
  return {
    supplier_id:   null,
    supplier_code: null,
    supplier_name: null,
    match_type:    "NONE",
    confidence:    "NONE",
    score:         0,
  };
}

function noProductSuggestion(): DteProductSuggestion {
  return {
    product_id:   null,
    product_code: null,
    product_name: null,
    match_type:   "NONE",
    confidence:   "NONE",
    score:        0,
  };
}

// ── Matching de proveedor ─────────────────────────────────────────
// Orden: NRC exacto → NIT exacto → nombre normalizado similar.
// Solo sugiere; no crea ni modifica el registro de proveedor.

export async function matchSupplier(
  detected:  DteSupplierDetected,
  tenant_id: string,
): Promise<DteSupplierMatch> {
  const select = { id: true, supplier_code: true, name: true } as const;

  // 1. NRC exacto
  if (detected.nrc) {
    const hit = await prisma.supplier.findFirst({
      where:  { tenant_id, nrc: detected.nrc },
      select,
    });
    if (hit) {
      return {
        detected,
        suggestion: {
          supplier_id:   hit.id,
          supplier_code: hit.supplier_code,
          supplier_name: hit.name,
          match_type:    "NRC_EXACT" as MatchTypeSupplier,
          confidence:    "HIGH",
          score:         100,
        },
        alternatives: [],
      };
    }
  }

  // 2. NIT exacto
  if (detected.nit) {
    const hit = await prisma.supplier.findFirst({
      where:  { tenant_id, nit: detected.nit },
      select,
    });
    if (hit) {
      return {
        detected,
        suggestion: {
          supplier_id:   hit.id,
          supplier_code: hit.supplier_code,
          supplier_name: hit.name,
          match_type:    "NIT_EXACT" as MatchTypeSupplier,
          confidence:    "HIGH",
          score:         100,
        },
        alternatives: [],
      };
    }
  }

  // 3. Nombre normalizado similar — carga todos y puntúa en memoria
  if (detected.name) {
    const all = await prisma.supplier.findMany({
      where:  { tenant_id },
      select,
      take:   SUPPLIER_FETCH_LIMIT,
    });

    const scored = all
      .map(s => ({ ...s, score: wordOverlapScore(detected.name!, s.name) }))
      .filter(s => s.score >= THRESHOLD_LOW)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const best       = scored[0];
      const confidence = nameConfidence(best.score);

      const alternatives: DteSupplierSuggestion[] = scored
        .slice(1, 1 + MAX_ALTERNATIVES)
        .map(s => ({
          supplier_id:   s.id,
          supplier_code: s.supplier_code,
          supplier_name: s.name,
          match_type:    "NAME_SIMILAR" as MatchTypeSupplier,
          confidence:    nameConfidence(s.score),
          score:         s.score,
        }));

      return {
        detected,
        suggestion: {
          supplier_id:   best.id,
          supplier_code: best.supplier_code,
          supplier_name: best.name,
          match_type:    "NAME_SIMILAR",
          confidence,
          score:         best.score,
        },
        alternatives,
      };
    }
  }

  return { detected, suggestion: noSupplierSuggestion(), alternatives: [] };
}

// ── Matching de productos ─────────────────────────────────────────
// Carga el catálogo activo del tenant una sola vez y lo reutiliza
// para todas las líneas del DTE. Orden por línea:
//   código exacto → nombre normalizado similar.
// No crea productos ni guarda aprendizaje.

export async function matchProducts(
  lines:     unknown[],
  tenant_id: string,
): Promise<DteItemMatch[]> {
  if (lines.length === 0) return [];

  const products = await prisma.product.findMany({
    where: {
      tenant_id,
      allow_purchase: true,
      status: { notIn: ["BLOCKED_PURCHASE", "INACTIVE", "DISCONTINUED"] },
    },
    select: { id: true, product_code: true, name: true },
    take:   PRODUCT_FETCH_LIMIT,
  });

  const result: DteItemMatch[] = [];

  for (const rawLine of lines) {
    const parsed = parseDteLine(rawLine);
    if (!parsed) continue;

    const { lineNumber, detected } = parsed;

    // 1. Código exacto contra product_code
    if (detected.code) {
      const hit = products.find(p => p.product_code === detected.code);
      if (hit) {
        result.push({
          line_number: lineNumber,
          detected,
          suggestion: {
            product_id:   hit.id,
            product_code: hit.product_code,
            product_name: hit.name,
            match_type:   "CODE_EXACT",
            confidence:   "HIGH",
            score:        100,
          },
          alternatives: [],
        });
        continue;
      }
    }

    // 2. Nombre normalizado similar contra product.name
    if (detected.description) {
      const scored = products
        .map(p => ({ ...p, score: wordOverlapScore(detected.description!, p.name) }))
        .filter(p => p.score >= THRESHOLD_LOW)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        const best       = scored[0];
        const matchType  = productMatchType(best.score);
        const confidence = nameConfidence(best.score);

        const alternatives: DteProductSuggestion[] = scored
          .slice(1, 1 + MAX_ALTERNATIVES)
          .map(p => ({
            product_id:   p.id,
            product_code: p.product_code,
            product_name: p.name,
            match_type:   productMatchType(p.score),
            confidence:   nameConfidence(p.score),
            score:        p.score,
          }));

        result.push({
          line_number: lineNumber,
          detected,
          suggestion: {
            product_id:   best.id,
            product_code: best.product_code,
            product_name: best.name,
            match_type:   matchType,
            confidence,
            score:        best.score,
          },
          alternatives,
        });
        continue;
      }
    }

    // Sin coincidencia
    result.push({
      line_number: lineNumber,
      detected,
      suggestion:  noProductSuggestion(),
      alternatives: [],
    });
  }

  return result;
}

// ── Orquestador principal ─────────────────────────────────────────
// Recibe el registro completo (ya validado de tenant/location) y
// devuelve el resultado de matching sin tocar la base de datos
// más allá de las lecturas de suppliers y products.

export async function matchDteImport(
  record: PurchaseDteImportRecord,
): Promise<DteMatchResult> {
  // Extrae el objeto raíz del raw_json de forma segura
  const rawObj =
    record.raw_json !== null &&
    typeof record.raw_json === "object" &&
    !Array.isArray(record.raw_json)
      ? (record.raw_json as Record<string, unknown>)
      : null;

  const detected: DteSupplierDetected = {
    nit:  record.issuer_nit,
    nrc:  record.issuer_nrc,
    name: record.issuer_name,
  };

  const supplier_match = await matchSupplier(detected, record.tenant_id);

  const cuerpo: unknown[] =
    rawObj && Array.isArray(rawObj["cuerpoDocumento"])
      ? (rawObj["cuerpoDocumento"] as unknown[])
      : [];

  const item_matches = await matchProducts(cuerpo, record.tenant_id);

  return {
    dte_import_id: record.id,
    supplier_match,
    item_matches,
  };
}
