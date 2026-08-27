// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-fse14-e2e-local.ts
//
// Runner dev-only (tsx) con PrismaClient REAL contra la base LOCAL,
// que ejecuta el flujo end-to-end completo de FSE 14 usando
// exclusivamente los services/actions reales ya implementados:
//
//   0. Preflight (host local, config TEST, firmador, schema, allowlists)
//   1. Activar temporalmente la DteIssuerConfig TEST (switchActiveDteEnvironment)
//   2. Preparar Supplier EXCLUDED_SUBJECT de prueba (reutiliza datos reales)
//   3. Crear Purchase DRAFT (document_type=FSE) → línea no-stockable → CONFIRMED
//   4. createPendingDteForPurchase (real)
//   5. generateAndPersistFseJsonForDte (real — genera + AJV)
//   6. Cálculo independiente de totales vs JSON generado
//   7. signDteDocument (real)
//   8. transmitDteDocument (real — TRANSMISIÓN REAL A MH TEST)
//   9. Verificar que no hubo un segundo movimiento de inventario
//  10. deliverDteToExternalDb (real — INSERT REAL EN MARIADB EXTERNA)
//  11. finally: restaurar la DteIssuerConfig activa a su estado original
//
// Guardas de seguridad:
//   - Aborta si NODE_ENV=production.
//   - Aborta si DATABASE_URL no es localhost/127.0.0.1 o contiene un
//     indicador de host remoto.
//   - Aborta si, tras resolver la config activa, el ambiente resultante
//     no es exactamente "TEST" — nunca transmite en PRODUCTION.
//   - Requiere FSE14_LOCAL_TEST="YES" y FSE14_MH_TEST="YES" explícitos.
//   - El paso 11 (restaurar ambiente activo) corre en `finally` — se
//     ejecuta incluso si algún paso anterior falla o aborta.
//
// Ejecutar (PowerShell):
//   $env:FSE14_LOCAL_TEST="YES"
//   $env:FSE14_MH_TEST="YES"
//   npx tsx src/modules/commerce/dte/dev/verify-fse14-e2e-local.ts
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { switchActiveDteEnvironment } from "../services/dte-issuer-config.service";
import { createPurchase, addPurchaseItem, confirmPurchase } from "@/modules/commerce/purchases/services/purchase.service";
import { updateSupplier } from "@/modules/commerce/suppliers/services/supplier.service";
import { createPendingDteForPurchase } from "../services/dte-outgoing.service";
import { generateAndPersistFseJsonForDte } from "../services/generate-fse-json-pipeline.service";
import { signDteDocument } from "../services/sign-dte-document.service";
import { transmitDteDocument } from "../services/transmit-dte-document.service";
import { deliverDteToExternalDb } from "../services/deliver-dte-to-external-db.service";
import { reopenRejectedDteForResign } from "../services/reopen-rejected-dte-for-resign.service";

// ── Fijos del entorno de prueba (resueltos manualmente en preflight previo) ──
const TENANT_ID    = "382d8840-3311-4da5-8acb-86e9f858e980";
const LOCATION_ID  = "bbd6cb00-78b2-4d85-a4b3-9e6bfa8dafd9";
const ADMIN_USER_ID = "bb440773-d1d6-4e90-9d54-672df8b81d35"; // super_admin real del tenant
const TEST_ISSUER_CONFIG_ID = "2d47dc24-941e-4137-91f0-635baadaff5d"; // config TEST existente (inactiva)
const SUPPLIER_ID   = "7fbe6f7a-befe-414e-b2dd-712bbdae1836"; // "DIMAS" — DUI real ya válido en BD
const PRODUCT_ID    = "00b9c1ae-42de-4b7b-8963-14eed8c9f34e"; // servicio no-stockable existente

class AbortError extends Error {}
function abort(message: string): never {
  throw new AbortError(message);
}

function mask(v: string | null | undefined): string {
  if (!v) return "—";
  return v.length <= 4 ? "****" : v.slice(0, 3) + "***" + v.slice(-2);
}

// ── 0. Guardas de ambiente local ──────────────────────────────────

const REMOTE_MARKERS = [
  "supabase", "pooler", "neon.tech", "railway", "render.com",
  "amazonaws", "aws", "azure", "digitalocean", "vercel",
];

function assertLocalEnvironment(): void {
  if (process.env.NODE_ENV === "production") {
    abort("NODE_ENV=production. Este script no puede ejecutarse en producción.");
  }
  if (process.env.FSE14_LOCAL_TEST !== "YES") {
    abort('Falta confirmación explícita. Define FSE14_LOCAL_TEST="YES" antes de ejecutar.');
  }
  if (process.env.FSE14_MH_TEST !== "YES") {
    abort('Falta confirmación explícita de transmisión real MH TEST. Define FSE14_MH_TEST="YES".');
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  if (!rawUrl) abort("DATABASE_URL no está definida.");

  let host = "";
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    abort("DATABASE_URL no es una URL válida.");
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    abort(`DATABASE_URL apunta a host "${host}", no a localhost/127.0.0.1. Abortado.`);
  }
  const lowerUrl = rawUrl.toLowerCase();
  for (const marker of REMOTE_MARKERS) {
    if (lowerUrl.includes(marker)) {
      abort(`DATABASE_URL contiene el indicador remoto "${marker}". Abortado.`);
    }
  }
}

async function main() {
  assertLocalEnvironment();
  console.log("=== FASE 0 — Preflight ===");
  console.log("DATABASE_URL host: local (verificado)");

  let previousActiveConfigId: string | null = null;
  let previousActiveEnvironment: string | null = null;

  try {
    // ── FASE 1 — Activar config TEST temporalmente ──────────────────
    const before = await prisma.dteIssuerConfig.findFirst({
      where: { tenant_id: TENANT_ID, location_id: LOCATION_ID, is_active: true },
      select: { id: true, environment: true },
    });
    if (!before) abort("No hay ninguna DteIssuerConfig activa. Abortado.");
    previousActiveConfigId    = before.id;
    previousActiveEnvironment = before.environment;
    console.log(`Config activa ANTES: id=${before.id} environment=${before.environment}`);

    const switchResult = await switchActiveDteEnvironment({
      tenant_id: TENANT_ID,
      location_id: LOCATION_ID,
      target_issuer_config_id: TEST_ISSUER_CONFIG_ID,
      user_id: ADMIN_USER_ID,
    });
    if (!switchResult.ok) {
      abort(`No se pudo activar la config TEST: ${switchResult.error}`);
    }
    console.log(`Config activa DESPUÉS del switch: environment=${switchResult.environment}`);
    if (switchResult.environment !== "TEST") {
      abort(`switchActiveDteEnvironment resolvió "${switchResult.environment}", no TEST. Abortado antes de continuar.`);
    }

    const activeNow = await prisma.dteIssuerConfig.findFirst({
      where: { id: TEST_ISSUER_CONFIG_ID },
      select: { environment: true, is_active: true, cod_estable_mh: true, cod_punto_venta_mh: true, nit: true, nrc: true },
    });
    if (!activeNow || activeNow.environment !== "TEST" || !activeNow.is_active) {
      abort("Verificación post-switch falló: la config activa no resuelve TEST. Abortado.");
    }
    console.log(`Preflight OK: environment=TEST, cod_estable_mh=${activeNow.cod_estable_mh}, cod_punto_venta_mh=${activeNow.cod_punto_venta_mh}, nit=${mask(activeNow.nit)}, nrc=${mask(activeNow.nrc)}`);

    // ── MODO RETRY — reabre un documento REJECTED (MH 802) existente,
    //    lo re-firma y re-transmite, SIN nuevo correlativo/documento.
    //    Usa el mismo mecanismo real reopenRejectedDteForResign.
    const retryDteId = process.env.FSE14_RETRY_DTE_ID;
    if (retryDteId) {
      console.log(`\n=== MODO RETRY — reabriendo documento REJECTED id=${retryDteId} ===`);
      const reopenRes = await reopenRejectedDteForResign({
        dteDocumentId: retryDteId, tenantId: TENANT_ID, locationId: LOCATION_ID, userId: ADMIN_USER_ID,
      });
      console.log(`reopenRejectedDteForResign → ok=${reopenRes.ok}${!reopenRes.ok ? " error=" + reopenRes.error : ""}`);
      if (!reopenRes.ok) abort(`No se pudo reabrir para re-firma: ${reopenRes.error}`);

      const reopened = await prisma.dteOutgoingDocument.findUniqueOrThrow({
        where: { id: retryDteId }, select: { dte_status: true, environment: true, purchase_id: true, sale_id: true },
      });
      console.log(`Estado tras reapertura: ${JSON.stringify(reopened)}`);
      if (reopened.environment !== "TEST") abort("El documento reabierto no es TEST. Abortado.");

      const resignRes = await signDteDocument({ dteDocumentId: retryDteId, userId: ADMIN_USER_ID, tenantId: TENANT_ID, locationId: LOCATION_ID });
      console.log(`Re-firma → ok=${resignRes.ok}${resignRes.ok ? " dteStatus=" + resignRes.dteStatus : " error=" + resignRes.error}`);
      if (!resignRes.ok) abort(`Re-firma falló: ${resignRes.error}`);

      const preCheck = await prisma.dteOutgoingDocument.findUniqueOrThrow({ where: { id: retryDteId }, select: { environment: true } });
      if (preCheck.environment !== "TEST") abort("Última verificación pre-retransmisión: no es TEST. Abortado.");

      const retransmitRes = await transmitDteDocument({ dteDocumentId: retryDteId, userId: ADMIN_USER_ID, tenantId: TENANT_ID, locationId: LOCATION_ID });
      console.log("Resultado re-transmisión:", JSON.stringify(retransmitRes, null, 2));

      const finalRetry = await prisma.dteOutgoingDocument.findUniqueOrThrow({
        where: { id: retryDteId },
        select: { dte_status: true, reception_stamp: true, mh_response: true, rejection_reason: true, purchase_id: true, sale_id: true, signed_jws: true },
      });
      console.log("Estado final tras retry:", JSON.stringify({ ...finalRetry, signed_jws_present: !!finalRetry.signed_jws, signed_jws: undefined }, null, 2));

      if (finalRetry.dte_status === "ACCEPTED" || finalRetry.dte_status === "OBSERVED") {
        console.log("\n=== Delivery MariaDB (real) tras retry ===");
        const deliverRes = await deliverDteToExternalDb({ dteDocumentId: retryDteId, userId: ADMIN_USER_ID, tenantId: TENANT_ID, locationId: LOCATION_ID });
        console.log("Resultado delivery MariaDB:", JSON.stringify(deliverRes, null, 2));
      }

      const movCheck = await prisma.inventoryMovement.count({ where: { tenant_id: TENANT_ID, location_id: LOCATION_ID, product_id: PRODUCT_ID } });
      console.log(`Movimientos de inventario del producto tras retry: ${movCheck} (no debe haber cambiado).`);

      console.log(`\n=== RESULTADO FINAL RETRY: dte_status=${finalRetry.dte_status} dteId=${retryDteId} ===`);
      return;
    }

    // ── FASE 2 — Preparar Supplier EXCLUDED_SUBJECT ─────────────────
    console.log("\n=== FASE 2 — Supplier de prueba ===");
    const supplierBefore = await prisma.supplier.findUniqueOrThrow({
      where: { id: SUPPLIER_ID },
      select: { id: true, name: true, taxpayer_type: true, id_type_code: true, dui: true, nit: true },
    });
    console.log(`Supplier ANTES: name=${supplierBefore.name} taxpayer_type=${supplierBefore.taxpayer_type} id_type_code=${supplierBefore.id_type_code} dui=${mask(supplierBefore.dui)}`);

    const updRes = await updateSupplier(TENANT_ID, ADMIN_USER_ID, {
      id: SUPPLIER_ID,
      name: supplierBefore.name,
      taxpayer_type: "EXCLUDED_SUBJECT",
      activity_code: "96090",
      activity_name: "Otras actividades de servicios personales n.c.p.",
      dept_code: "06",
      dept_name: "San Salvador",
      municipality_code: "01",
      municipality_name: "San Salvador",
      address_complement: "Colonia Escalón, San Salvador, El Salvador (dirección de prueba)",
      phone: "22223333",
    } as never);
    if (!updRes.ok) abort(`No se pudo actualizar el Supplier de prueba: ${updRes.error}`);
    console.log("Supplier actualizado: taxpayer_type=EXCLUDED_SUBJECT + datos fiscales completados.");

    // ── FASE 3 — Crear y confirmar Purchase FSE ─────────────────────
    console.log("\n=== FASE 3 — Purchase de prueba ===");
    const todayIso = new Date().toISOString().slice(0, 10);
    const created = await createPurchase(TENANT_ID, LOCATION_ID, ADMIN_USER_ID, {
      supplier_id: SUPPLIER_ID,
      purchase_date: todayIso,
      purchase_code: "",
      document_type: "FSE",
      document_series: "FSE-E2E",
      document_number: "000001",
      payment_condition: "CON",
      cancellation_type: "EFE",
      notes: "Prueba E2E FSE 14 — bloque final de implementación.",
    } as never);
    if (!created.ok) abort(`No se pudo crear la Purchase: ${created.error}`);
    const purchaseId = created.id;
    console.log(`Purchase creada: id=${purchaseId} purchase_code=${created.purchase_code}`);

    const itemRes = await addPurchaseItem(purchaseId, TENANT_ID, LOCATION_ID, ADMIN_USER_ID, {
      product_id: PRODUCT_ID,
      quantity: 1,
      unit_cost: 50,
      tax_amount: 0,
      notes: null,
    } as never);
    if (!itemRes.ok) abort(`No se pudo agregar la línea: ${itemRes.error}`);
    console.log("Línea agregada: 1 x servicio no-stockable, costo unitario $50.00, impuesto $0.00");

    const stockBefore = await prisma.productLocation.findFirst({
      where: { tenant_id: TENANT_ID, location_id: LOCATION_ID, product_id: PRODUCT_ID },
      select: { current_stock: true },
    });
    const movementsBefore = await prisma.inventoryMovement.count({
      where: { tenant_id: TENANT_ID, location_id: LOCATION_ID, product_id: PRODUCT_ID },
    });

    const confirmRes = await confirmPurchase(purchaseId, TENANT_ID, LOCATION_ID, ADMIN_USER_ID);
    if (!confirmRes.ok) abort(`No se pudo confirmar la Purchase: ${confirmRes.error}`);
    console.log("Purchase CONFIRMED.");

    const movementsAfterConfirm = await prisma.inventoryMovement.count({
      where: { tenant_id: TENANT_ID, location_id: LOCATION_ID, product_id: PRODUCT_ID },
    });
    console.log(`Movimientos de inventario para el producto (no-stockable) — antes: ${movementsBefore}, después de confirmar: ${movementsAfterConfirm} (debe ser igual, 0 esperado).`);

    const purchaseAfter = await prisma.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
      select: { subtotal: true, tax_amount: true, total_amount: true, retention_1pct_applies: true, retention_1pct_amount: true,
        income_tax_withholding_applies: true, income_tax_withholding_amount: true },
    });
    console.log(`Totales Purchase: subtotal=${purchaseAfter.subtotal} tax_amount=${purchaseAfter.tax_amount} total_amount=${purchaseAfter.total_amount}`);
    console.log(`Retenciones: iva1%=${purchaseAfter.retention_1pct_applies}/${purchaseAfter.retention_1pct_amount} renta=${purchaseAfter.income_tax_withholding_applies}/${purchaseAfter.income_tax_withholding_amount}`);

    // ── FASE 4 — createPendingDteForPurchase ────────────────────────
    console.log("\n=== FASE 4 — createPendingDteForPurchase ===");
    const pendingRes = await createPendingDteForPurchase(TENANT_ID, LOCATION_ID, ADMIN_USER_ID, {
      purchase_id: purchaseId,
      issuer_config_id: TEST_ISSUER_CONFIG_ID,
      environment: "TEST",
    });
    if (!pendingRes.ok) abort(`createPendingDteForPurchase falló: ${pendingRes.error}`);
    const dteId = pendingRes.dte_document_id;
    console.log(`DteOutgoingDocument creado: id=${dteId}`);

    const dteRow = await prisma.dteOutgoingDocument.findUniqueOrThrow({
      where: { id: dteId },
      select: { dte_type_code: true, purchase_id: true, sale_id: true, environment: true,
        generation_code: true, control_number: true, dte_status: true },
    });
    console.log(JSON.stringify(dteRow, null, 2));
    if (dteRow.dte_type_code !== "14") abort("dte_type_code no es 14.");
    if (dteRow.purchase_id !== purchaseId) abort("purchase_id no coincide.");
    if (dteRow.sale_id !== null) abort("sale_id NO es null — viola la regla XOR.");
    if (dteRow.environment !== "TEST") abort("environment no es TEST tras crear el pendiente.");
    if (!dteRow.control_number?.startsWith("DTE-14-")) abort(`control_number no tiene prefijo DTE-14-: ${dteRow.control_number}`);
    console.log("Invariante XOR verificada: purchase_id presente, sale_id null.");

    // Duplicado activo — debe rechazar
    const dupRes = await createPendingDteForPurchase(TENANT_ID, LOCATION_ID, ADMIN_USER_ID, {
      purchase_id: purchaseId,
      issuer_config_id: TEST_ISSUER_CONFIG_ID,
      environment: "TEST",
    });
    console.log(`Intento de FSE duplicado para la misma Purchase → ok=${dupRes.ok} (esperado false): ${!dupRes.ok ? dupRes.error : "N/A"}`);

    // ── FASE 5 — Generar + persistir + AJV ──────────────────────────
    console.log("\n=== FASE 5 — generateAndPersistFseJsonForDte ===");
    const genRes = await generateAndPersistFseJsonForDte({
      tenant_id: TENANT_ID, location_id: LOCATION_ID, dte_document_id: dteId, user_id: ADMIN_USER_ID,
    });
    console.log(`ok=${genRes.ok} dte_status=${genRes.dte_status}`);
    if (!genRes.ok) abort(`generateAndPersistFseJsonForDte falló: ${genRes.error}`);
    if (genRes.validation_errors && genRes.validation_errors.length > 0) {
      console.log("ERRORES AJV:");
      for (const e of genRes.validation_errors) console.log(`  ${e.path} — ${e.message}`);
      abort("AJV inválido. Deteniendo antes de firmar.");
    }
    if (genRes.dte_status !== "SCHEMA_VALIDATED") abort(`dte_status esperado SCHEMA_VALIDATED, obtuvo ${genRes.dte_status}`);
    console.log("AJV: VÁLIDO. dte_status = SCHEMA_VALIDATED.");

    // ── Resumen sanitizado del JSON ──────────────────────────────────
    const json = genRes.json_document as any;
    const sanitized = {
      identificacion: json.identificacion,
      emisor: { ...json.emisor, nit: mask(json.emisor.nit) },
      sujetoExcluido: { ...json.sujetoExcluido, numDocumento: mask(json.sujetoExcluido.numDocumento) },
      cuerpoDocumento: json.cuerpoDocumento,
      resumen: json.resumen,
    };
    console.log("\n=== JSON FSE (sanitizado) ===");
    console.log(JSON.stringify(sanitized, null, 2));

    // ── FASE 6 — Cálculo independiente ───────────────────────────────
    console.log("\n=== FASE 6 — Cálculo independiente ===");
    const items = await prisma.purchaseItem.findMany({ where: { purchase_id: purchaseId }, select: { line_subtotal: true } });
    const sumLineas = items.reduce((s, i) => s + Number(i.line_subtotal), 0);
    const expectedIvaRete1 = purchaseAfter.retention_1pct_applies ? Number(purchaseAfter.retention_1pct_amount) : 0;
    const expectedReteRenta = purchaseAfter.income_tax_withholding_applies ? Number(purchaseAfter.income_tax_withholding_amount) : 0;
    const expectedTotalPagar = Math.round((sumLineas - expectedIvaRete1 - expectedReteRenta) * 100) / 100;

    console.log(`Σ líneas de compra = ${sumLineas.toFixed(2)} — JSON totalCompra = ${json.resumen.totalCompra} — match=${sumLineas.toFixed(2) === Number(json.resumen.totalCompra).toFixed(2)}`);
    console.log(`ivaRete1 esperado = ${expectedIvaRete1.toFixed(2)} — JSON ivaRete1 = ${json.resumen.ivaRete1} — match=${expectedIvaRete1.toFixed(2) === Number(json.resumen.ivaRete1).toFixed(2)}`);
    console.log(`reteRenta esperado = ${expectedReteRenta.toFixed(2)} — JSON reteRenta = ${json.resumen.reteRenta} — match=${expectedReteRenta.toFixed(2) === Number(json.resumen.reteRenta).toFixed(2)}`);
    console.log(`totalPagar esperado = ${expectedTotalPagar.toFixed(2)} — JSON totalPagar = ${json.resumen.totalPagar} — match=${expectedTotalPagar.toFixed(2) === Number(json.resumen.totalPagar).toFixed(2)}`);

    if (
      sumLineas.toFixed(2) !== Number(json.resumen.totalCompra).toFixed(2) ||
      expectedIvaRete1.toFixed(2) !== Number(json.resumen.ivaRete1).toFixed(2) ||
      expectedReteRenta.toFixed(2) !== Number(json.resumen.reteRenta).toFixed(2) ||
      expectedTotalPagar.toFixed(2) !== Number(json.resumen.totalPagar).toFixed(2)
    ) {
      abort("DIFERENCIA en el cálculo independiente vs JSON generado. Deteniendo antes de firmar.");
    }
    console.log("Cálculo independiente: TODOS los totales coinciden centavo por centavo.");

    // ── FASE 7 — Firma real ──────────────────────────────────────────
    console.log("\n=== FASE 7 — Firma (signDteDocument) ===");
    const signRes = await signDteDocument({ dteDocumentId: dteId, userId: ADMIN_USER_ID, tenantId: TENANT_ID, locationId: LOCATION_ID });
    console.log(`ok=${signRes.ok}`);
    if (!signRes.ok) abort(`Firma falló: ${signRes.error}`);
    console.log(`dteStatus=${signRes.dteStatus} signedAt=${signRes.signedAt}`);

    const signedRow = await prisma.dteOutgoingDocument.findUniqueOrThrow({
      where: { id: dteId }, select: { signed_jws: true, dte_status: true },
    });
    console.log(`signed_jws presente=${!!signedRow.signed_jws} (longitud=${signedRow.signed_jws?.length ?? 0}) dte_status=${signedRow.dte_status}`);

    // ── FASE 8 — Transmisión real a MH TEST ──────────────────────────
    console.log("\n=== FASE 8 — Transmisión REAL a MH TEST ===");
    const preTransmitCheck = await prisma.dteOutgoingDocument.findUniqueOrThrow({
      where: { id: dteId }, select: { environment: true },
    });
    if (preTransmitCheck.environment !== "TEST") {
      abort(`ÚLTIMA VERIFICACIÓN: environment del documento es "${preTransmitCheck.environment}", no TEST. ABORTANDO TRANSMISIÓN.`);
    }
    console.log("Última verificación pre-transmisión: environment=TEST. Procediendo.");

    const transmitRes = await transmitDteDocument({ dteDocumentId: dteId, userId: ADMIN_USER_ID, tenantId: TENANT_ID, locationId: LOCATION_ID });
    console.log("Resultado transmisión:", JSON.stringify(transmitRes, null, 2));

    const finalDoc = await prisma.dteOutgoingDocument.findUniqueOrThrow({
      where: { id: dteId },
      select: {
        dte_status: true, reception_stamp: true, mh_response: true, sent_at: true, accepted_at: true,
        rejected_at: true, observed_at: true, rejection_reason: true, purchase_id: true, sale_id: true, signed_jws: true,
      },
    });
    console.log("\nEstado final del documento tras transmisión:");
    console.log(JSON.stringify({
      dte_status: finalDoc.dte_status,
      reception_stamp: finalDoc.reception_stamp,
      mh_response: finalDoc.mh_response,
      sent_at: finalDoc.sent_at,
      accepted_at: finalDoc.accepted_at,
      rejected_at: finalDoc.rejected_at,
      observed_at: finalDoc.observed_at,
      rejection_reason: finalDoc.rejection_reason,
      purchase_id: finalDoc.purchase_id,
      sale_id: finalDoc.sale_id,
      signed_jws_present: !!finalDoc.signed_jws,
    }, null, 2));

    const logs = await prisma.dteTransmissionLog.findMany({
      where: { dte_document_id: dteId, operation_type: "SEND" },
      orderBy: { created_at: "desc" }, take: 1,
      select: { http_status: true, error_message: true, response_body: true, created_at: true },
    });
    console.log("\nÚltimo DteTransmissionLog (SEND):");
    console.log(JSON.stringify(logs[0] ?? null, null, 2));

    // ── FASE 9 — Regresión inventario ────────────────────────────────
    console.log("\n=== FASE 9 — Regresión de inventario ===");
    const movementsAfterFse = await prisma.inventoryMovement.count({
      where: { tenant_id: TENANT_ID, location_id: LOCATION_ID, product_id: PRODUCT_ID },
    });
    console.log(`Movimientos de inventario para el producto — después de confirmar: ${movementsAfterConfirm}, después de emitir FSE: ${movementsAfterFse} (deben ser iguales).`);
    if (movementsAfterFse !== movementsAfterConfirm) {
      console.log("ALERTA: el conteo de movimientos cambió tras emitir FSE — investigar.");
    }

    // ── FASE 10 — Delivery MariaDB (solo si hay respuesta MH válida) ──
    if (finalDoc.dte_status === "ACCEPTED" || finalDoc.dte_status === "OBSERVED") {
      console.log("\n=== FASE 10 — Delivery MariaDB (real) ===");
      const deliverRes = await deliverDteToExternalDb({ dteDocumentId: dteId, userId: ADMIN_USER_ID, tenantId: TENANT_ID, locationId: LOCATION_ID });
      console.log("Resultado delivery MariaDB:", JSON.stringify(deliverRes, null, 2));
    } else {
      console.log(`\n=== FASE 10 — Delivery MariaDB OMITIDO (dte_status=${finalDoc.dte_status}, no es ACCEPTED/OBSERVED) ===`);
    }

    console.log(`\n=== RESULTADO FINAL: dte_status=${finalDoc.dte_status} purchaseId=${purchaseId} dteId=${dteId} ===`);

  } finally {
    // ── FASE 11 — Restaurar ambiente activo original ─────────────────
    if (previousActiveConfigId) {
      console.log("\n=== FASE 11 — Restaurando config activa original ===");
      const restoreRes = await switchActiveDteEnvironment({
        tenant_id: TENANT_ID, location_id: LOCATION_ID,
        target_issuer_config_id: previousActiveConfigId, user_id: ADMIN_USER_ID,
      });
      console.log(`Restauración: ok=${restoreRes.ok} environment=${restoreRes.ok ? restoreRes.environment : "N/A"} (original era ${previousActiveEnvironment})`);
      const finalActive = await prisma.dteIssuerConfig.findFirst({
        where: { tenant_id: TENANT_ID, location_id: LOCATION_ID, is_active: true },
        select: { id: true, environment: true },
      });
      console.log(`Config activa FINAL: id=${finalActive?.id} environment=${finalActive?.environment}`);
      if (finalActive?.id !== previousActiveConfigId) {
        console.log("¡ADVERTENCIA CRÍTICA! La config activa NO quedó restaurada al estado original.");
      }
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("\n=== ERROR / ABORT ===");
    console.error(err instanceof AbortError ? err.message : err);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
