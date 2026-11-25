// ─────────────────────────────────────────────────────────────────
// commerce/purchases — utils/inspect-received-dte-spec.ts
//
// MH20 (Fase 6, IMP20-027) — inspección normativa de un DTE RECIBIDO
// (proveedor) antes de guardarlo en purchase_dte_imports.
//
// Convivencia 1.2 / 2.0: el emisor del proveedor decide su versión; Zolvi
// la detecta por identificacion.version (registro D2), no la exige igual a
// la del perfil propio. Solo lectura: no crea compra, producto, proveedor
// ni movimiento de inventario, y no modifica raw_json.
//
// Advierte (nunca bloquea) sobre diferencias 2.0 que impactan el mapeo
// posterior a compras:
//   - Archivo DTE 2.0 (firmaElectronica / selloRecibido en la raíz).
//   - Sello ausente o con formato distinto a 40 alfanuméricos.
//   - NC v4 sin resumen.subTotal (subtotal queda null, no se infiere).
//   - Retención en resumen.ivaRete (2.0) vs ivaRete1 (1.2): no se mapea
//     automáticamente a la compra.
//   - Versión desconocida o tipo no esperado como documento recibido.
// ─────────────────────────────────────────────────────────────────

import {
  inferProfileFromDocument,
  isDteSpecKind,
} from "@/modules/commerce/dte/spec/dte-spec-registry";

const STAMP_RE = /^[A-Z0-9]{40}$/;

export interface ReceivedDteSpecInspection {
  tipoDte:   string | null;
  version:   number | null;
  /** MH_1_2 | MH_2_0 | AMBIGUOUS (FEX v3) | UNKNOWN */
  profile:   "MH_1_2" | "MH_2_0" | "AMBIGUOUS" | "UNKNOWN";
  archiveFormat: boolean;
  warnings:  string[];
}

function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function inspectReceivedDteSpec(
  dteJson: Record<string, unknown>,
  receptionStamp: string | null,
): ReceivedDteSpecInspection {
  const ident   = obj(dteJson.identificacion);
  const resumen = obj(dteJson.resumen);
  const tipoDte = typeof ident?.tipoDte === "string" ? ident.tipoDte : null;
  const rawVer  = ident?.version;
  const version = typeof rawVer === "number" && Number.isInteger(rawVer) ? rawVer : null;
  const warnings: string[] = [];

  let profile: ReceivedDteSpecInspection["profile"] = "UNKNOWN";
  if (tipoDte && version !== null && isDteSpecKind(tipoDte)) {
    profile = inferProfileFromDocument(tipoDte, version) ?? "UNKNOWN";
  }
  if (profile === "UNKNOWN") {
    warnings.push(
      `Versión normativa no reconocida (tipoDte "${tipoDte ?? "?"}", version ${version ?? "?"}): revise el documento antes de usarlo en una compra.`,
    );
  }
  if (tipoDte === "14") {
    warnings.push("El documento es una Factura de Sujeto Excluido (14): la emite el comprador, no un proveedor. Verifique su origen.");
  }

  const archiveFormat = "firmaElectronica" in dteJson || "selloRecibido" in dteJson;
  if (archiveFormat) {
    warnings.push("Archivo DTE con firmaElectronica/selloRecibido en la raíz: la firma no se verifica localmente.");
  }
  if (!receptionStamp) {
    warnings.push("El documento no trae sello de recepción de MH.");
  } else if (!STAMP_RE.test(receptionStamp)) {
    warnings.push("El sello de recepción no tiene el formato esperado (40 caracteres alfanuméricos).");
  }

  if (profile === "MH_2_0") {
    if (tipoDte === "05" && resumen && !("subTotal" in resumen)) {
      warnings.push("Nota de Crédito 2.0 sin resumen.subTotal: el subtotal de la importación queda vacío (no se infiere).");
    }
    if (resumen && "ivaRete" in resumen && !("ivaRete1" in resumen)) {
      warnings.push("La retención viene en resumen.ivaRete (MH 2.0): no se mapea automáticamente a la compra; revise el monto.");
    }
  }

  return { tipoDte, version, profile, archiveFormat, warnings };
}
