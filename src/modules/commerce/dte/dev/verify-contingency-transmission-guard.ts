// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-contingency-transmission-guard.ts
//
// Bloque C, paso 4 — prueba local (sin llamar a MH) del guard
// assertDteContingencyTransmissionAllowed con 4 casos:
//
//   A) DTE normal (transmission_type_code="1")            → PASS (no bloquea)
//   B) DTE contingente sin Evento asociado                 → BLOQUEADO
//   C) DTE contingente cubierto solo por Evento NO ACCEPTED → BLOQUEADO
//   D) DTE contingente cubierto por Evento ACCEPTED         → PASS
//
// Usa fixtures reales ya existentes en la base local (generados por
// los runners de Bloque A/B) — no crea ni modifica datos.
//
// Ejecutar:
//   npx tsx src/modules/commerce/dte/dev/verify-contingency-transmission-guard.ts
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { assertDteContingencyTransmissionAllowed } from "../services/assert-dte-contingency-transmission-allowed.service";

async function main() {
  // ── Caso D (fixture real: FE01 cubierto por Evento ACCEPTED) ──────
  const acceptedItem = await prisma.dteContingencyEventItem.findFirst({
    where: { contingency_event: { status: "ACCEPTED" } },
    select: {
      dte_document_id: true,
      dte_document: {
        select: { tenant_id: true, location_id: true, transmission_type_code: true, contingency_type_code: true, generation_code: true },
      },
    },
  });
  if (!acceptedItem) {
    console.error("No se encontró ningún item cubierto por un Evento ACCEPTED en la base local. Ejecuta primero Bloque B.");
    process.exitCode = 1;
    return;
  }

  // ── Caso C (fixture real: FE01 cubierto SOLO por Evento NO ACCEPTED) ──
  const nonAcceptedItem = await prisma.dteContingencyEventItem.findFirst({
    where: {
      contingency_event: { status: { not: "ACCEPTED" } },
      // excluir cualquier item que también esté cubierto por un Evento ACCEPTED
      dte_document: { contingency_event_items: { none: { contingency_event: { status: "ACCEPTED" } } } },
    },
    select: {
      dte_document_id: true,
      dte_document: {
        select: { tenant_id: true, location_id: true, transmission_type_code: true, contingency_type_code: true, generation_code: true },
      },
    },
  });
  if (!nonAcceptedItem) {
    console.error("No se encontró ningún item cubierto solo por un Evento NO ACCEPTED en la base local. Ejecuta primero Bloque B (evento en PENDING_SIGNATURE/SIGNED/DRAFT).");
    process.exitCode = 1;
    return;
  }

  console.log("── CASO A — DTE normal (transmission_type_code=1) ──");
  const caseA = await assertDteContingencyTransmissionAllowed({
    dteDocumentId:        "00000000-0000-0000-0000-000000000000", // no existe, irrelevante: la rama normal no consulta DB
    tenantId:             "irrelevant-tenant",
    locationId:           "irrelevant-location",
    transmissionTypeCode: "1",
    contingencyTypeCode:  null,
    generationCode:       null,
  });
  console.log(`  resultado: ${caseA.ok ? "PASS (no bloquea)" : `BLOQUEADO — ${caseA.error}`}`);
  console.log(`  esperado:  PASS`);

  console.log("\n── CASO B — DTE contingente sin Evento asociado ──");
  const caseB = await assertDteContingencyTransmissionAllowed({
    dteDocumentId:        "11111111-1111-1111-1111-111111111111", // sin items → sin cobertura
    tenantId:             acceptedItem.dte_document.tenant_id,
    locationId:           acceptedItem.dte_document.location_id,
    transmissionTypeCode: "2",
    contingencyTypeCode:  "2",
    generationCode:       "11111111-1111-1111-1111-111111111111",
  });
  console.log(`  resultado: ${caseB.ok ? "PASS" : `BLOQUEADO — ${caseB.error}`}`);
  console.log(`  esperado:  BLOQUEADO`);

  console.log("\n── CASO C — DTE contingente cubierto solo por Evento NO ACCEPTED ──");
  const dC = nonAcceptedItem.dte_document;
  const caseC = await assertDteContingencyTransmissionAllowed({
    dteDocumentId:        nonAcceptedItem.dte_document_id,
    tenantId:             dC.tenant_id,
    locationId:           dC.location_id,
    transmissionTypeCode: dC.transmission_type_code,
    contingencyTypeCode:  dC.contingency_type_code,
    generationCode:       dC.generation_code,
  });
  console.log(`  dte_document_id: ${nonAcceptedItem.dte_document_id}`);
  console.log(`  resultado: ${caseC.ok ? "PASS" : `BLOQUEADO — ${caseC.error}`}`);
  console.log(`  esperado:  BLOQUEADO`);

  console.log("\n── CASO D — DTE contingente cubierto por Evento ACCEPTED ──");
  const dD = acceptedItem.dte_document;
  const caseD = await assertDteContingencyTransmissionAllowed({
    dteDocumentId:        acceptedItem.dte_document_id,
    tenantId:             dD.tenant_id,
    locationId:           dD.location_id,
    transmissionTypeCode: dD.transmission_type_code,
    contingencyTypeCode:  dD.contingency_type_code,
    generationCode:       dD.generation_code,
  });
  console.log(`  dte_document_id: ${acceptedItem.dte_document_id}`);
  console.log(`  resultado: ${caseD.ok ? "PASS" : `BLOQUEADO — ${caseD.error}`}`);
  console.log(`  esperado:  PASS`);

  const allOk = caseA.ok === true && caseB.ok === false && caseC.ok === false && caseD.ok === true;
  console.log(`\n── Resultado global: ${allOk ? "TODOS LOS CASOS SEGÚN LO ESPERADO" : "DESVIACIÓN — revisar"} ──`);
  if (!allOk) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("ERROR INESPERADO:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
