// commerce/dte — dte-return-event-json.types.ts
//
// MH20 (Fase 6, IMP20-022) — tipos del Evento de Retorno (tipo 18,
// v2_0/fe-eret-v1.json). Interfaces mínimas para el builder puro.

/** Tipos de DTE a los que aplica un Retorno (MH20-058). */
export const RETURN_ELIGIBLE_DTE_TYPES = ["01", "11", "14"] as const;
export type ReturnEligibleDteType = (typeof RETURN_ELIGIBLE_DTE_TYPES)[number];

export function isReturnEligibleDteType(v: string): v is ReturnEligibleDteType {
  return (RETURN_ELIGIBLE_DTE_TYPES as readonly string[]).includes(v);
}

/** Límites oficiales (MF 2.0 X, cond. 2; N2.0 regla 13.3.1; schema fe-eret-v1). */
export const RETURN_MAX_DOCUMENTS = 50;
export const RETURN_MAX_ITEMS     = 2000;

export interface DteIssuerConfigForReturn {
  nit:                string;
  name:               string;
  establishment_code: string | null;
  cod_estable_mh:     string | null;
  point_of_sale_code: string | null;
  cod_punto_venta_mh: string | null;
  environment:        string;
}

/** DTE original (con sello) relacionado en el Retorno. */
export interface ReturnOriginDocument {
  dteDocumentId:  string;
  dteTypeCode:    string;
  generationCode: string;
  receptionStamp: string | null;
  /** json_document firmado del DTE original — NUNCA se modifica. */
  jsonDocument:   unknown;
}

/** Importes devueltos de una línea (ya validados contra el saldo elegible). */
export interface ReturnLineAmounts {
  quantity:    number;
  montoDescu:  number;
  ventaNoSuj:  number;
  ventaExenta: number;
  ventaGravada: number;
  compra:      number;
  ivaItem:     number;
  noGravado:   number;
}

export interface ReturnLineInput {
  dteDocumentId: string;
  /** numItem de la línea del DTE original. */
  sourceItemNo:  number;
  amounts:       ReturnLineAmounts;
}

export interface ReturnEventJsonParams {
  issuerConfig:        DteIssuerConfigForReturn;
  originType:          string;
  documents:           ReturnOriginDocument[];
  lines:               ReturnLineInput[];
  eventGenerationCode: string;
  now?:                Date;
}

export type BuildReturnEventJsonResult =
  | { ok: true;  eventJson: Record<string, unknown>; totalReturned: number; warnings: string[] }
  | { ok: false; error: string; code?: string };
