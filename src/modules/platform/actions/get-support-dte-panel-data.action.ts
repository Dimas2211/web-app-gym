"use server";

// ─────────────────────────────────────────────────────────────────
// platform — get-support-dte-panel-data.action.ts
//
// F2-B1: Datos read-only para el panel DTE de Support Session.
// No escribe nada — solo lectura contra la base del perfil seleccionado.
//
// Reglas de seguridad:
// - Solo super_admin.
// - Nunca devuelve encrypted_password, DATABASE_URL, host ni puerto.
// - Nunca devuelve json_document, signed_jws, mh_response ni tokens.
// - Siempre ejecuta $disconnect() vía withTemporaryPrismaClient.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }         from "@/lib/permissions/guards";
import { prisma }                    from "@/lib/db/prisma";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
}                                    from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import { SUPPORT_DTE_ACTIVE_TYPE_CODES } from "../lib/support-session/dte/support-dte.constants";
import type { SupportDtePanelData, SupportDteTypeCode } from "../types/platform.types";

const DTE_ENVIRONMENT = "TEST" as const;

function safeDate(d: Date | null | undefined): string {
  if (!d) return "";
  try { return d.toISOString(); } catch { return ""; }
}

export async function getSupportDtePanelDataAction(
  profileId: string,
): Promise<SupportDtePanelData> {
  await requireSuperAdmin();

  if (!profileId || typeof profileId !== "string") {
    return { success: false, error: "ID de perfil requerido." };
  }

  try {
    assertEncryptionAvailable();
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "PLATFORM_ENCRYPTION_KEY no disponible." };
  }

  const profile = await prisma.platformDatabaseProfile.findUnique({
    where:  { id: profileId },
    select: {
      db_host: true, db_port: true, db_name: true, db_user: true,
      encrypted_password: true, ssl_mode: true, is_active: true, environment: true,
      organization: { select: { tenant_id: true } },
    },
  });

  if (!profile) return { success: false, error: "Perfil de base de datos no encontrado." };
  if (!profile.is_active) return { success: false, error: "Este perfil de base de datos está inactivo." };

  const tenantId = profile.organization.tenant_id;
  if (!tenantId) {
    return { success: false, error: "Esta organización no tiene tenant_id operativo. Usa \"Detectar tenant\" desde Perfiles de BD." };
  }

  const warnings: string[] = [];

  try {
    const databaseUrl = buildDatabaseUrlFromProfile(profile);

    return await withTemporaryPrismaClient(databaseUrl, async (client) => {
      // Ventas CONFIRMED sin DTE activo (excluye NOT_REQUIRED/INVALIDATED)
      const rawSales = await client.sale.findMany({
        where:   { tenant_id: tenantId, status: "CONFIRMED", inventory_moved: true },
        select: {
          id: true, sale_code: true, sale_date: true, primary_dte_type_code: true,
          total_amount: true, inventory_moved: true,
          customer: { select: { name: true } },
          dte_documents: {
            where:  { dte_status: { notIn: ["NOT_REQUIRED", "INVALIDATED"] } },
            select: { id: true, dte_type_code: true },
          },
        },
        orderBy: { created_at: "desc" },
        take:    30,
      });

      const eligibleSales = rawSales
        .filter((s) => {
          const type = s.primary_dte_type_code;
          if (!type || !SUPPORT_DTE_ACTIVE_TYPE_CODES.includes(type as SupportDteTypeCode)) return false;
          return !s.dte_documents.some((d) => d.dte_type_code === type);
        })
        .map((s) => ({
          id:                    s.id,
          sale_code:             s.sale_code,
          sale_date:             safeDate(s.sale_date),
          customer_name:         s.customer?.name ?? null,
          primary_dte_type_code: s.primary_dte_type_code,
          total_amount:          String(s.total_amount),
          inventory_moved:       s.inventory_moved,
        }));

      const rawDocs = await client.dteOutgoingDocument.findMany({
        where:   { tenant_id: tenantId },
        select: {
          id: true, sale_id: true, dte_type_code: true, dte_status: true, environment: true,
          generation_code: true, control_number: true, json_document: true, signed_jws: true,
          created_at: true, generated_at: true, schema_validated_at: true, rejection_reason: true,
          sale: { select: { sale_code: true } },
        },
        orderBy: { created_at: "desc" },
        take:    30,
      });

      const recentDocuments = rawDocs.map((d) => ({
        id:                  d.id,
        sale_id:             d.sale_id,
        sale_code:           d.sale?.sale_code ?? null,
        dte_type_code:       d.dte_type_code,
        dte_status:          String(d.dte_status),
        environment:         String(d.environment),
        generation_code:     d.generation_code ?? null,
        control_number:      d.control_number ?? null,
        has_json_document:   d.json_document != null,
        has_signed_jws:      !!d.signed_jws,
        created_at:          safeDate(d.created_at),
        generated_at:        d.generated_at ? safeDate(d.generated_at) : null,
        schema_validated_at: d.schema_validated_at ? safeDate(d.schema_validated_at) : null,
        rejection_reason:    d.rejection_reason ?? null,
      }));

      // Estado del emisor DTE — un solo registro esperado por tenant en ambiente TEST.
      // Con multi-location, el estado mostrado corresponde al primero activo encontrado.
      let issuerConfig = { exists: false, is_active: false, environment: null as string | null, has_cod_estable_mh: false, has_cod_punto_venta_mh: false };
      try {
        const issuer = await client.dteIssuerConfig.findFirst({
          where:  { tenant_id: tenantId, environment: DTE_ENVIRONMENT },
          select: { is_active: true, environment: true, cod_estable_mh: true, cod_punto_venta_mh: true },
          orderBy: { created_at: "asc" },
        });
        if (issuer) {
          issuerConfig = {
            exists: true, is_active: issuer.is_active, environment: String(issuer.environment),
            has_cod_estable_mh: !!issuer.cod_estable_mh, has_cod_punto_venta_mh: !!issuer.cod_punto_venta_mh,
          };
        } else {
          warnings.push(`No existe configuración DTE (DteIssuerConfig) activa para ambiente ${DTE_ENVIRONMENT}.`);
        }
      } catch (err) {
        warnings.push(`DTE/issuer-config: ${sanitizeDatabaseError(err)}`);
      }

      const year = new Date().getFullYear();
      const correlatives = [];
      for (const dteType of SUPPORT_DTE_ACTIVE_TYPE_CODES) {
        try {
          const rows = await client.dteCorrelative.findMany({
            where:  { tenant_id: tenantId, environment: DTE_ENVIRONMENT, dte_type_code: dteType, year },
            select: { last_sequence: true },
          });
          if (rows.length === 0) {
            correlatives.push({ dte_type_code: dteType, exists: false, last_sequence: null, year });
            warnings.push(`No existe correlativo DTE tipo "${dteType}" para el año ${year} en ambiente ${DTE_ENVIRONMENT}.`);
          } else {
            correlatives.push({ dte_type_code: dteType, exists: true, last_sequence: rows[0].last_sequence, year });
          }
        } catch (err) {
          warnings.push(`DTE/correlative ${dteType}: ${sanitizeDatabaseError(err)}`);
          correlatives.push({ dte_type_code: dteType, exists: false, last_sequence: null, year });
        }
      }

      return {
        success: true,
        tenantId,
        environment: profile.environment,
        eligibleSales,
        recentDocuments,
        issuerConfig,
        correlatives,
        warnings,
      };
    });
  } catch (err) {
    return { success: false, error: sanitizeDatabaseError(err) };
  }
}
