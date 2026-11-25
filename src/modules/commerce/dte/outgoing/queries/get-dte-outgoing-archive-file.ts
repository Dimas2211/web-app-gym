// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — get-dte-outgoing-archive-file.ts
//
// MH20 (Fase 6, IMP20-021) — lectura READ-ONLY para construir el
// "Archivo DTE" 2.0 del receptor (services/build-dte-archive-file.service.ts).
//
// Scoping obligatorio: id + tenant_id + location_id + documento operativo.
// Lee signed_jws y reception_stamp (necesarios para firmaElectronica /
// selloRecibido); nunca los registra en logs. mh_spec_profile solo se lee
// con el interruptor MH 2.0 encendido (mh20ProfileSelect): apagado, un
// FEX v3 queda AMBIGUOUS y los demás se infieren por versión.
// No escribe nada.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import { OPERATIONAL_DTE_WHERE } from "@/modules/commerce/dte/utils/dte-document-purpose";
import { mh20ProfileSelect } from "@/modules/commerce/dte/config/dte-mh20.flags";
import { buildDteArchiveFile, type DteArchiveFileResult } from "@/modules/commerce/dte/services/build-dte-archive-file.service";

export type DteOutgoingArchiveFile =
  | { status: "NOT_FOUND" }
  | { status: "BUILT"; id: string; dte_type_code: string; environment: string; result: DteArchiveFileResult };

export async function getDteOutgoingArchiveFile(params: {
  dteId:      string;
  tenantId:   string;
  locationId: string;
  client?:    PrismaClient;
}): Promise<DteOutgoingArchiveFile> {
  const { dteId, tenantId, locationId, client = prisma } = params;
  const row = await client.dteOutgoingDocument.findFirst({
    where:  { id: dteId, tenant_id: tenantId, location_id: locationId, ...OPERATIONAL_DTE_WHERE },
    select: {
      id: true, dte_type_code: true, environment: true, json_document: true,
      signed_jws: true, reception_stamp: true,
      ...mh20ProfileSelect(),
    },
  });
  if (!row) return { status: "NOT_FOUND" };
  const persistedProfile = (row as { mh_spec_profile?: string | null }).mh_spec_profile ?? null;
  return {
    status:        "BUILT",
    id:            row.id,
    dte_type_code: row.dte_type_code,
    environment:   String(row.environment),
    result: buildDteArchiveFile({
      kind:           row.dte_type_code,
      jsonDocument:   row.json_document,
      signedJws:      row.signed_jws,
      receptionStamp: row.reception_stamp,
      persistedProfile,
      environment:    String(row.environment),
    }),
  };
}
