// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding/testing — onboarding-5k-fixtures.ts
//
// ONBOARDING-5K. Generadores de archivos .xlsx sintéticos (hoja "Datos",
// mismos encabezados que las plantillas oficiales) para los 9 datasets.
// Solo para pruebas: datos ficticios, todas las columnas opcionales
// rellenas para medir tamaños realistas de archivo.
// ─────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx";
import type { DataOnboardingDatasetKey } from "../../../types/platform.types";

export const ONBOARDING_DATASETS = [
  "categories",
  "lines",
  "sublines",
  "customers",
  "suppliers",
  "products",
  "inventory_initial",
  "gym_clients",
  "gym_trainers",
] as const satisfies readonly DataOnboardingDatasetKey[];

export type OnboardingDataset = (typeof ONBOARDING_DATASETS)[number];

/** Dependencias que deben existir en la base destino (nombres usados por los generadores). */
export const FIXTURE_DEPS = {
  categoryName: "Categoria Base",
  lineName:     "Linea Base",
  unitName:     "Unidad 5K",
  unitSymbol:   "U5K",
  branchName:   "Sucursal Centro",
} as const;

const HEADERS: Record<OnboardingDataset, string[]> = {
  categories:        ["name*", "description", "status"],
  lines:             ["name*", "category_name*", "status"],
  sublines:          ["name*", "line_name*", "category_name", "status"],
  customers:         ["customer_code", "name*", "document_type", "document_number", "email", "phone", "address", "city", "country_code", "notes", "status"],
  suppliers:         ["name*", "trade_name", "nit", "nrc", "email", "phone", "address", "city", "country_code", "economic_activity", "contact_name", "status"],
  products:          ["product_code*", "name*", "description", "product_type*", "category_name*", "line_name", "brand", "unit_name*", "package_unit", "sku", "cost_price", "sale_price", "is_stockable*", "allow_purchase*", "allow_sale*", "status"],
  inventory_initial: ["product_code*", "location_name*", "quantity*", "unit_cost", "notes"],
  gym_clients:       ["first_name*", "last_name*", "branch_name*", "operational_code", "document_id", "birth_date", "gender", "email", "phone", "address", "emergency_contact_name", "emergency_contact_phone", "notes", "status", "modality"],
  gym_trainers:      ["first_name*", "last_name*", "branch_name*", "email", "phone", "specialty", "notes", "personalized_capacity", "status"],
};

const pad = (n: number, w = 5) => String(n).padStart(w, "0");

/** Fila válida i (1-based). `tag` diferencia archivos (p. ej. por tenant/corrida). */
export function fixtureRow(dataset: OnboardingDataset, i: number, tag = "A"): unknown[] {
  const n = pad(i);
  switch (dataset) {
    case "categories":
      return [`Categoria ${tag} ${n}`, `Descripcion de la categoria ${n} para pruebas de volumen`, "active"];
    case "lines":
      return [`Linea ${tag} ${n}`, FIXTURE_DEPS.categoryName, "active"];
    case "sublines":
      return [`Sublinea ${tag} ${n}`, FIXTURE_DEPS.lineName, FIXTURE_DEPS.categoryName, "active"];
    case "customers":
      return ["", `Cliente Comercial ${tag} ${n}`, "NIT", `0614-${tag}${n}-101-${i % 10}`, `cliente${n}@ejemplo.test`,
        `7${pad(i, 7)}`, `Colonia Escalon, calle ${i}, casa ${i % 97}`, "San Salvador", "SV", "Cliente importado en prueba 5K", "active"];
    case "suppliers":
      return [`Proveedor ${tag} ${n}`, `Proveedor ${tag} ${n} S.A. de C.V.`, `0614${tag}${n}1011`, `${pad(i, 6)}-${i % 9}`,
        `proveedor${n}@ejemplo.test`, `2${pad(i, 7)}`, `Boulevard de los Heroes ${i}`, "San Salvador", "SV", "46510", `Contacto ${n}`, "active"];
    case "products":
      return [`P${tag}-${n}`, `Producto ${tag} ${n} de prueba de volumen`, `Descripcion extendida del producto ${n}`, "PRODUCT",
        FIXTURE_DEPS.categoryName, FIXTURE_DEPS.lineName, "Marca Prueba", FIXTURE_DEPS.unitName, "Caja", `SKU-${tag}-${n}`,
        (i % 50) + 1.25, (i % 50) + 2.5, "true", "true", "true", "ACTIVE"];
    case "inventory_initial":
      return [`P${tag}-${n}`, FIXTURE_DEPS.branchName, (i % 20) + 1, (i % 50) + 1.25, `Carga inicial ${n}`];
    case "gym_clients":
      return [`Nombre${tag}${n}`, `Apellido${n}`, FIXTURE_DEPS.branchName, "", `DOC-${tag}-${n}`,
        `19${80 + (i % 20)}-0${(i % 9) + 1}-1${i % 9}`, i % 2 === 0 ? "female" : "male", `socio${tag}${n}@ejemplo.test`,
        `6${pad(i, 7)}`, `Residencial Prueba ${i}`, `Contacto ${n}`, `6${pad(i + 1, 7)}`, "Socio importado en prueba 5K", "active", "NORMAL"];
    case "gym_trainers":
      return [`Entrenador${tag}${n}`, `Apellido${n}`, FIXTURE_DEPS.branchName, `coach${tag}${n}@ejemplo.test`,
        `7${pad(i, 7)}`, "Funcional", "Entrenador importado en prueba 5K", (i % 10) + 1, "active"];
  }
}

export interface BuildWorkbookOptions {
  tag?:         string;
  /** Filas vacías intercaladas (cada `emptyEvery` filas de datos). */
  emptyEvery?:  number;
  /** Sobrescribe filas concretas (índice 1-based de dato → fila). */
  overrides?:   Record<number, unknown[]>;
  /** Extiende el rango declarado (!ref) hasta esta fila, como una hoja con formato en filas vacías. */
  phantomRows?: number;
}

export function buildWorkbookAoa(dataset: OnboardingDataset, count: number, opts: BuildWorkbookOptions = {}): unknown[][] {
  const aoa: unknown[][] = [HEADERS[dataset]];
  for (let i = 1; i <= count; i++) {
    aoa.push(opts.overrides?.[i] ?? fixtureRow(dataset, i, opts.tag));
    if (opts.emptyEvery && i % opts.emptyEvery === 0) aoa.push([]);
  }
  return aoa;
}

export function buildWorkbookBuffer(dataset: OnboardingDataset, count: number, opts: BuildWorkbookOptions = {}): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(buildWorkbookAoa(dataset, count, opts));
  if (opts.phantomRows) {
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    range.e.r = Math.max(range.e.r, opts.phantomRows - 1);
    ws["!ref"] = XLSX.utils.encode_range(range);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
}
