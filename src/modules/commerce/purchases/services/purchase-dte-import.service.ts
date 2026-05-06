// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-dte-import.service.ts
//
// Lógica de negocio para importación de JSONs DTE.
// Sin "use server" — importable desde route handlers.
//
// Operaciones:
//   extractDteMetadata        — extrae campos conocidos del JSON DTE sin fallar
//   createPurchaseDteImport   — guarda raw_json + metadata en purchase_dte_imports
//
// No crea Purchase, no crea Product, no crea Supplier, no toca inventory.
// El status inicial siempre es UPLOADED.
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { DteMetadata, PurchaseDteImportRecord } from "../types/purchase-dte-import.types";

// ── Helpers de extracción seguros ─────────────────────────────────

function asObject(v: unknown): Record<string, unknown> | null {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function safeString(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

function safeDecimal(obj: Record<string, unknown> | null, key: string): number | null {
  if (!obj) return null;
  const v = obj[key];
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (isFinite(n)) return n;
  }
  return null;
}

// ── Extractor de metadata DTE mínima ─────────────────────────────
// Lee campos comunes del JSON DTE de Hacienda (SV).
// Si un campo no existe o no tiene el tipo esperado, queda null.
// No lanza excepciones por campos opcionales ausentes.

export function extractDteMetadata(dteJson: Record<string, unknown>): DteMetadata {
  const id      = asObject(dteJson["identificacion"]);
  const emisor  = asObject(dteJson["emisor"]);
  const resumen = asObject(dteJson["resumen"]);
  const cuerpo  = dteJson["cuerpoDocumento"];

  // identificacion
  const dte_type         = safeString(id, "tipoDte");
  const generation_code  = safeString(id, "codigoGeneracion");
  const control_number   = safeString(id, "numeroControl");
  const environment_code = safeString(id, "ambiente");
  const fecEmi           = safeString(id, "fecEmi");
  const horEmi           = safeString(id, "horEmi");

  // emisor
  const issuer_nit  = safeString(emisor, "nit");
  const issuer_nrc  = safeString(emisor, "nrc");
  const issuer_name = safeString(emisor, "nombre");

  // issued_at: fecEmi + horEmi si ambos existen; solo fecEmi si es parseable; null si no
  let issued_at: string | null = null;
  if (fecEmi) {
    const iso     = horEmi ? `${fecEmi}T${horEmi}` : `${fecEmi}T00:00:00`;
    const parsed  = new Date(iso);
    if (!isNaN(parsed.getTime())) issued_at = parsed.toISOString();
  }

  // resumen — totalPagar tiene prioridad; si no existe usa montoTotalOperacion
  const subtotal     = safeDecimal(resumen, "subTotal");
  const tax_amount   = safeDecimal(resumen, "totalIva");
  const total_amount =
    safeDecimal(resumen, "totalPagar") ??
    safeDecimal(resumen, "montoTotalOperacion");

  // cuerpoDocumento — solo count, no se parsea contenido
  const item_count = Array.isArray(cuerpo) ? (cuerpo as unknown[]).length : null;

  return {
    dte_type,
    generation_code,
    control_number,
    environment_code,
    issuer_nit,
    issuer_nrc,
    issuer_name,
    issued_at,
    subtotal,
    tax_amount,
    total_amount,
    item_count,
  };
}

// ── Tipos de resultado ────────────────────────────────────────────

export type CreateDteImportResult =
  | {
      ok:       true;
      id:       string;
      status:   string;
      metadata: DteMetadata;
      warnings: string[];
    }
  | { ok: false; error: string };

// ── Crear registro de importación DTE ────────────────────────────
// Guarda raw_json sin modificar y metadata extraída.
// Si ya existe un registro con el mismo generation_code en el mismo
// tenant+location, agrega un warning pero no bloquea la operación.

export async function createPurchaseDteImport(
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  raw_json:    Record<string, unknown>,
): Promise<CreateDteImportResult> {
  const metadata: DteMetadata = extractDteMetadata(raw_json);
  const warnings: string[]    = [];

  // Detección de duplicado por generation_code — solo advierte, no bloquea
  if (metadata.generation_code) {
    const existing = await prisma.purchaseDteImport.findFirst({
      where: {
        tenant_id,
        location_id,
        generation_code: metadata.generation_code,
      },
      select: { id: true },
    });
    if (existing) {
      warnings.push(
        `Ya existe un DTE importado con codigoGeneracion "${metadata.generation_code}" (id: ${existing.id}).`,
      );
    }
  }

  const record = await prisma.purchaseDteImport.create({
    data: {
      tenant_id,
      location_id,
      raw_json:         raw_json as Prisma.InputJsonValue,
      status:           "UPLOADED",
      dte_type:         metadata.dte_type         ?? null,
      generation_code:  metadata.generation_code  ?? null,
      control_number:   metadata.control_number   ?? null,
      environment_code: metadata.environment_code ?? null,
      issuer_nit:       metadata.issuer_nit       ?? null,
      issuer_nrc:       metadata.issuer_nrc       ?? null,
      issuer_name:      metadata.issuer_name      ?? null,
      issued_at:        metadata.issued_at ? new Date(metadata.issued_at) : null,
      subtotal:
        metadata.subtotal !== null
          ? new Prisma.Decimal(metadata.subtotal)
          : null,
      tax_amount:
        metadata.tax_amount !== null
          ? new Prisma.Decimal(metadata.tax_amount)
          : null,
      total_amount:
        metadata.total_amount !== null
          ? new Prisma.Decimal(metadata.total_amount)
          : null,
      item_count:  metadata.item_count ?? null,
      created_by:  user_id,
    },
    select: {
      id:     true,
      status: true,
    },
  });

  return {
    ok:       true,
    id:       record.id,
    status:   record.status,
    metadata,
    warnings,
  };
}

// ── Re-export del tipo de registro para conveniencia ──────────────
export type { PurchaseDteImportRecord };
