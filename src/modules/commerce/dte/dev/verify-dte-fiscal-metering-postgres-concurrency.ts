// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-dte-fiscal-metering-postgres-concurrency.ts
//
// FASE IV-A.1 — CERTIFICACIÓN: prueba el comportamiento REAL de
// PostgreSQL Serializable de reserveDteFiscalCapacity contra la base
// LOCAL (localhost:5432/TrustmeDB), sin fake DB en memoria.
//
// Usa EXCLUSIVAMENTE fixtures técnicos aislados por un tenant_id
// sintético (nunca usado por datos reales) y los borra al final. NUNCA
// transmite/firma/genera JSON DTE real — los DteOutgoingDocument que
// crea son solo filas mínimas para satisfacer el FK de
// DteFiscalMeteringReservation.
//
// Guard de seguridad: aborta ANTES de cualquier escritura si
// DATABASE_URL no apunta exactamente a localhost/TrustmeDB — nunca
// corre esto contra Supabase ni ningún host remoto.
//
// Ejecutar:
//   npx tsx src/modules/commerce/dte/dev/verify-dte-fiscal-metering-postgres-concurrency.ts
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import { randomUUID } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  reserveDteFiscalCapacity,
  DTE_MONTHLY_ENTITLEMENT_CODE,
  type ReserveDteFiscalCapacityResult,
} from "../services/dte-fiscal-metering.service";
import type { CommercialEnforcementContext } from "@/modules/platform/runtime/commercial-enforcement/types";
import type { EffectiveEntitlement } from "@/modules/platform/types/platform.types";

// ── 0. Guard de seguridad — host/db exactos ─────────────────────────

function assertLocalTrustmeDb(): void {
  const raw = process.env.DATABASE_URL ?? "";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    console.error("❌  DATABASE_URL no es una URL válida. Abortando ANTES de cualquier escritura.");
    process.exit(1);
  }
  const host = u.hostname;
  const db = u.pathname.replace(/^\//, "");
  console.log("── Guard de conexión ────────────────────────────────────");
  console.log(`  host : ${host}`);
  console.log(`  db   : ${db}`);
  if (host !== "localhost" || db !== "TrustmeDB") {
    console.error(
      `❌  Esta base NO es localhost/TrustmeDB (host="${host}", db="${db}"). ` +
        "Abortando ANTES de cualquier escritura — este runner solo puede correr contra la base local.",
    );
    process.exit(1);
  }
  if (raw.includes("supabase")) {
    console.error("❌  DATABASE_URL contiene 'supabase' — abortando por seguridad.");
    process.exit(1);
  }
  console.log("  ✅  Confirmado: localhost/TrustmeDB. Continuando.\n");
}

// ── 1. Identidad de fixtures — namespace sintético, nunca real ──────

const CERT_TENANT_ID = `cert-iva1-metering-${randomUUID()}`;
const CERT_LOCATION_ID = `cert-iva1-location-${randomUUID()}`;
const FAKE_NOW = new Date("2099-01-15T12:00:00.000Z"); // "2099-01" en America/El_Salvador — imposible que colisione con datos reales
const FAKE_OLD_NOW = new Date("2098-12-10T12:00:00.000Z"); // "2098-12"
const TZ = "America/El_Salvador";

const createdDocIds: string[] = [];
const createdReservationIds: string[] = [];

async function createFixtureDoc(environment: "TEST" | "PRODUCTION"): Promise<string> {
  const doc = await prisma.dteOutgoingDocument.create({
    data: {
      tenant_id: CERT_TENANT_ID,
      location_id: CERT_LOCATION_ID,
      dte_type_code: "01",
      environment,
      generation_code: randomUUID().toUpperCase(),
      dte_status: "SIGNED", // irrelevante para el FK — nunca se firma/transmite de verdad
    },
    select: { id: true },
  });
  createdDocIds.push(doc.id);
  return doc.id;
}

async function seedReservation(
  dteDocumentId: string,
  status: "PENDING" | "CONSUMED" | "RELEASED",
  periodKey: string,
  reservedAt: Date,
): Promise<string> {
  const row = await prisma.dteFiscalMeteringReservation.create({
    data: {
      tenant_id: CERT_TENANT_ID,
      dte_document_id: dteDocumentId,
      entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE,
      period_key: periodKey,
      status,
      reserved_at: reservedAt,
      resolved_at: status === "PENDING" ? null : reservedAt,
    },
    select: { id: true },
  });
  createdReservationIds.push(row.id);
  return row.id;
}

// ── 2. Contexto comercial fake — MANAGED, timezone real ─────────────

function entitlement(overrides: Partial<EffectiveEntitlement> = {}): EffectiveEntitlement {
  return {
    entitlement_definition_id: "def-dte-cert",
    code: DTE_MONTHLY_ENTITLEMENT_CODE,
    name: "DTE mensuales (certificación)",
    category: "fiscal",
    value_type: "COUNT",
    period_type: "MONTHLY",
    numeric_value: 100,
    is_unlimited: false,
    source: "PLAN",
    ...overrides,
  };
}

function managedCtx(ent: EffectiveEntitlement | undefined): CommercialEnforcementContext {
  return {
    mode: "MANAGED",
    tenantId: CERT_TENANT_ID,
    organizationId: "org-cert",
    planId: "plan-cert",
    verticalId: null,
    effectiveModules: new Map(),
    effectiveEntitlements: ent ? new Map([[DTE_MONTHLY_ENTITLEMENT_CODE, ent]]) : new Map(),
    organizationTimezone: TZ,
  };
}

// ── 3. Proxy de diagnóstico — observa P2034/40001/P2002 SIN tocar el
//      motor de producción. Envuelve $transaction del PrismaClient real
//      y delega todo lo demás sin modificarlo. ──────────────────────

interface DiagnosticsLog {
  label: string;
  attempts: number;
  conflicts: { code: string; meta: unknown }[];
}

function wrapWithDiagnostics(client: PrismaClient, label: string): { client: PrismaClient; log: DiagnosticsLog } {
  const log: DiagnosticsLog = { label, attempts: 0, conflicts: [] };
  const proxy = new Proxy(client, {
    get(target, prop, _receiver) {
      if (prop === "$transaction") {
        return async (...args: unknown[]) => {
          log.attempts++;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return await (target.$transaction as any)(...args);
          } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError) {
              log.conflicts.push({ code: err.code, meta: err.meta });
            }
            throw err;
          }
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { client: proxy, log };
}

// Wrapper para Caso 4 — inyecta un fallo DENTRO de la transacción real,
// después de que assertCapacityAvailable (que usa tx.count, sin tocar)
// ya pasó, y justo en la escritura (tx.create) — simula "fallo técnico
// entre check y write completado". Puramente test-side: nunca modifica
// dte-fiscal-metering.service.ts.
function wrapWithFailingCreate(client: PrismaClient, failForDocId: string): PrismaClient {
  return new Proxy(client, {
    get(target, prop, _receiver) {
      if (prop === "$transaction") {
        return async (cb: (tx: unknown) => Promise<unknown>, opts?: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (target.$transaction as any)(async (tx: any) => {
            const failingTx = new Proxy(tx, {
              get(txTarget, txProp, _txReceiver) {
                if (txProp === "dteFiscalMeteringReservation") {
                  const realSub = txTarget.dteFiscalMeteringReservation;
                  return new Proxy(realSub, {
                    get(subTarget, subProp) {
                      if (subProp === "create") {
                        return async (args: { data: { dte_document_id: string } }) => {
                          if (args.data.dte_document_id === failForDocId) {
                            throw new Error("[CERT-CASE-4] fallo técnico inyectado deliberadamente antes de completar el write");
                          }
                          return subTarget.create(args);
                        };
                      }
                      const v = subTarget[subProp];
                      return typeof v === "function" ? v.bind(subTarget) : v;
                    },
                  });
                }
                const v = txTarget[txProp];
                return typeof v === "function" ? v.bind(txTarget) : v;
              },
            });
            return cb(failingTx);
          }, opts);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// ── 4. Reporte ───────────────────────────────────────────────────────

const results: Record<string, unknown> = {};

async function countOccupied(periodKey: string): Promise<number> {
  return prisma.dteFiscalMeteringReservation.count({
    where: {
      tenant_id: CERT_TENANT_ID,
      entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE,
      period_key: periodKey,
      status: { in: ["PENDING", "CONSUMED"] },
    },
  });
}

async function main() {
  assertLocalTrustmeDb();

  console.log("── Conteos PRE-TEST (deben ser 0 para el tenant sintético) ──");
  const preDocCount = await prisma.dteOutgoingDocument.count({ where: { tenant_id: CERT_TENANT_ID } });
  const preResCount = await prisma.dteFiscalMeteringReservation.count({ where: { tenant_id: CERT_TENANT_ID } });
  const preDocTotal = await prisma.dteOutgoingDocument.count();
  const preResTotal = await prisma.dteFiscalMeteringReservation.count();
  console.log(`  DteOutgoingDocument (tenant sintético)        : ${preDocCount}`);
  console.log(`  DteFiscalMeteringReservation (tenant sintético): ${preResCount}`);
  console.log(`  DteOutgoingDocument (TOTAL en la base)          : ${preDocTotal}`);
  console.log(`  DteFiscalMeteringReservation (TOTAL en la base) : ${preResTotal}\n`);
  results["pre"] = { preDocCount, preResCount, preDocTotal, preResTotal };

  try {
    // ── CASO 1 — dos documentos distintos, limit 100, occupied 99 ────
    console.log("═══ CASO 1 — dos documentos distintos (limit 100, occupied 99) ═══");
    const period1 = "2099-01";
    for (let i = 0; i < 99; i++) {
      const docId = await createFixtureDoc("PRODUCTION");
      await seedReservation(docId, "CONSUMED", period1, FAKE_NOW);
    }
    const docA = await createFixtureDoc("PRODUCTION");
    const docB = await createFixtureDoc("PRODUCTION");
    const ctx100 = managedCtx(entitlement({ numeric_value: 100 }));

    const diagA = wrapWithDiagnostics(prisma, "docA");
    const diagB = wrapWithDiagnostics(prisma, "docB");

    const [settledA, settledB] = await Promise.allSettled([
      reserveDteFiscalCapacity({ dteDocumentId: docA, tenantId: CERT_TENANT_ID, environment: "PRODUCTION", commercialCtx: ctx100, runtimeDb: diagA.client, now: FAKE_NOW }),
      reserveDteFiscalCapacity({ dteDocumentId: docB, tenantId: CERT_TENANT_ID, environment: "PRODUCTION", commercialCtx: ctx100, runtimeDb: diagB.client, now: FAKE_NOW }),
    ]);

    const outcomeA = settledA.status === "fulfilled" ? settledA.value : { ok: false, error: String(settledA.reason) };
    const outcomeB = settledB.status === "fulfilled" ? settledB.value : { ok: false, error: String(settledB.reason) };
    const occupiedAfterCase1 = await countOccupied(period1);

    console.log(`  docA -> ${JSON.stringify(outcomeA)}`);
    console.log(`  docB -> ${JSON.stringify(outcomeB)}`);
    console.log(`  diagA attempts=${diagA.log.attempts} conflicts=${JSON.stringify(diagA.log.conflicts)}`);
    console.log(`  diagB attempts=${diagB.log.attempts} conflicts=${JSON.stringify(diagB.log.conflicts)}`);
    console.log(`  occupied final (period ${period1}) = ${occupiedAfterCase1}\n`);

    const oks = [outcomeA, outcomeB].filter((r) => (r as ReserveDteFiscalCapacityResult).ok === true);
    const blocked = [outcomeA, outcomeB].filter(
      (r) => (r as ReserveDteFiscalCapacityResult).ok === false && (r as { code?: string }).code === "CAPACITY_LIMIT_REACHED",
    );

    results["case1"] = {
      outcomeA, outcomeB,
      diagA: diagA.log, diagB: diagB.log,
      occupiedAfterCase1,
      exactlyOnePending: oks.length === 1,
      exactlyOneBlocked: blocked.length === 1,
      neverExceeded: occupiedAfterCase1 === 100,
    };

    // ── CASO 2 — mismo dte_document_id concurrente ───────────────────
    console.log("═══ CASO 2 — mismo documento, dos reserve concurrentes ═══");
    const period2 = "2099-01";
    const docSame = await createFixtureDoc("PRODUCTION");
    const ctxSame = managedCtx(entitlement({ numeric_value: 1000 }));
    const diagSameA = wrapWithDiagnostics(prisma, "same-A");
    const diagSameB = wrapWithDiagnostics(prisma, "same-B");

    const [settledSameA, settledSameB] = await Promise.allSettled([
      reserveDteFiscalCapacity({ dteDocumentId: docSame, tenantId: CERT_TENANT_ID, environment: "PRODUCTION", commercialCtx: ctxSame, runtimeDb: diagSameA.client, now: FAKE_NOW }),
      reserveDteFiscalCapacity({ dteDocumentId: docSame, tenantId: CERT_TENANT_ID, environment: "PRODUCTION", commercialCtx: ctxSame, runtimeDb: diagSameB.client, now: FAKE_NOW }),
    ]);
    const outcomeSameA = settledSameA.status === "fulfilled" ? settledSameA.value : { ok: false, error: String(settledSameA.reason) };
    const outcomeSameB = settledSameB.status === "fulfilled" ? settledSameB.value : { ok: false, error: String(settledSameB.reason) };
    const rowCountSame = await prisma.dteFiscalMeteringReservation.count({ where: { dte_document_id: docSame } });

    console.log(`  A -> ${JSON.stringify(outcomeSameA)}`);
    console.log(`  B -> ${JSON.stringify(outcomeSameB)}`);
    console.log(`  filas en DB para docSame = ${rowCountSame}`);
    console.log(`  diagSameA conflicts=${JSON.stringify(diagSameA.log.conflicts)}`);
    console.log(`  diagSameB conflicts=${JSON.stringify(diagSameB.log.conflicts)}\n`);

    results["case2"] = { outcomeSameA, outcomeSameB, rowCountSame, diagSameA: diagSameA.log, diagSameB: diagSameB.log, exactlyOneRow: rowCountSame === 1 };

    // ── CASO 3 — RELEASED reacquire ───────────────────────────────────
    console.log("═══ CASO 3 — RELEASED reacquire ═══");
    // 3a. con cupo
    const docReleasedOk = await createFixtureDoc("PRODUCTION");
    const releasedRowId = await seedReservation(docReleasedOk, "RELEASED", "2098-12", FAKE_OLD_NOW);
    const ctxReleasedOk = managedCtx(entitlement({ numeric_value: 1000 }));
    const reacquireOk = await reserveDteFiscalCapacity({
      dteDocumentId: docReleasedOk, tenantId: CERT_TENANT_ID, environment: "PRODUCTION", commercialCtx: ctxReleasedOk, runtimeDb: prisma, now: FAKE_NOW,
    });
    const rowAfterReacquireOk = await prisma.dteFiscalMeteringReservation.findUnique({ where: { id: releasedRowId } });
    console.log(`  3a (con cupo) -> ${JSON.stringify(reacquireOk)}`);
    console.log(`  fila tras reacquire -> status=${rowAfterReacquireOk?.status} period_key=${rowAfterReacquireOk?.period_key} reserved_at=${rowAfterReacquireOk?.reserved_at?.toISOString()} resolved_at=${rowAfterReacquireOk?.resolved_at}`);

    // 3b. sin cupo
    const docReleasedBlocked = await createFixtureDoc("PRODUCTION");
    const releasedBlockedRowId = await seedReservation(docReleasedBlocked, "RELEASED", period1, FAKE_NOW);
    // period1 ya tiene occupied=100 (o el resultado del caso 1) con limit=100 -> sin cupo
    const ctxReleasedBlocked = managedCtx(entitlement({ numeric_value: 100 }));
    const reacquireBlocked = await reserveDteFiscalCapacity({
      dteDocumentId: docReleasedBlocked, tenantId: CERT_TENANT_ID, environment: "PRODUCTION", commercialCtx: ctxReleasedBlocked, runtimeDb: prisma, now: FAKE_NOW,
    });
    const rowAfterReacquireBlocked = await prisma.dteFiscalMeteringReservation.findUnique({ where: { id: releasedBlockedRowId } });
    console.log(`  3b (sin cupo) -> ${JSON.stringify(reacquireBlocked)}`);
    console.log(`  fila tras intento bloqueado -> status=${rowAfterReacquireBlocked?.status}\n`);

    results["case3"] = {
      reacquireOk, rowAfterReacquireOk,
      reacquireBlocked, rowAfterReacquireBlocked,
      okBecamePending: rowAfterReacquireOk?.status === "PENDING" && rowAfterReacquireOk?.period_key === "2099-01",
      blockedStaysReleased: rowAfterReacquireBlocked?.status === "RELEASED",
    };

    // ── CASO 4 — rollback ─────────────────────────────────────────────
    console.log("═══ CASO 4 — transaction rollback (fallo inyectado tras el check) ═══");
    const docRollback = await createFixtureDoc("PRODUCTION");
    const period4 = "2099-02"; // aislado de los otros casos
    const occupiedBeforeRollback = await countOccupied(period4);
    const ctxRollback = managedCtx(entitlement({ numeric_value: 1000 }));
    const failingClient = wrapWithFailingCreate(prisma, docRollback);
    let rollbackError: string | null = null;
    try {
      await reserveDteFiscalCapacity({
        dteDocumentId: docRollback, tenantId: CERT_TENANT_ID, environment: "PRODUCTION", commercialCtx: ctxRollback,
        runtimeDb: failingClient, now: new Date("2099-02-10T12:00:00.000Z"),
      });
    } catch (err) {
      rollbackError = err instanceof Error ? err.message : String(err);
    }
    const rowAfterRollback = await prisma.dteFiscalMeteringReservation.findUnique({ where: { dte_document_id: docRollback } });
    const occupiedAfterRollback = await countOccupied(period4);
    console.log(`  error propagado -> ${rollbackError}`);
    console.log(`  fila parcial en DB -> ${rowAfterRollback ? "SÍ (FALLO)" : "ninguna (correcto)"}`);
    console.log(`  occupied antes=${occupiedBeforeRollback} después=${occupiedAfterRollback}\n`);

    results["case4"] = {
      rollbackErrorOccurred: rollbackError !== null,
      noPhantomRow: rowAfterRollback === null,
      occupiedUnchanged: occupiedBeforeRollback === occupiedAfterRollback,
    };

    // ── CASO 5 — TEST bypass ──────────────────────────────────────────
    console.log("═══ CASO 5 — environment=TEST bypass ═══");
    const docTest = await createFixtureDoc("TEST");
    const testResult = await reserveDteFiscalCapacity({
      dteDocumentId: docTest, tenantId: CERT_TENANT_ID, environment: "TEST", commercialCtx: managedCtx(entitlement()), runtimeDb: prisma, now: FAKE_NOW,
    });
    const testRow = await prisma.dteFiscalMeteringReservation.findUnique({ where: { dte_document_id: docTest } });
    console.log(`  resultado -> ${JSON.stringify(testResult)}`);
    console.log(`  fila creada -> ${testRow ? "SÍ (FALLO)" : "ninguna (correcto)"}\n`);
    results["case5"] = { testResult, noLedgerCreated: testRow === null };

    // ── CASO 6 — Unlimited ────────────────────────────────────────────
    console.log("═══ CASO 6 — Unlimited (mide, nunca bloquea) ═══");
    const docUnlimited = await createFixtureDoc("PRODUCTION");
    const unlimitedResult = await reserveDteFiscalCapacity({
      dteDocumentId: docUnlimited, tenantId: CERT_TENANT_ID, environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ is_unlimited: true, numeric_value: null })), runtimeDb: prisma, now: FAKE_NOW,
    });
    const unlimitedRow = await prisma.dteFiscalMeteringReservation.findUnique({ where: { dte_document_id: docUnlimited } });
    if (unlimitedRow) createdReservationIds.push(unlimitedRow.id);
    console.log(`  resultado -> ${JSON.stringify(unlimitedResult)}`);
    console.log(`  fila -> status=${unlimitedRow?.status}\n`);
    results["case6"] = { unlimitedResult, ledgerCreated: unlimitedRow !== null, status: unlimitedRow?.status };

    // ── CASO 7 — UNCONFIGURED ─────────────────────────────────────────
    console.log("═══ CASO 7 — UNCONFIGURED (fail-closed) ═══");
    const docUnconfigured = await createFixtureDoc("PRODUCTION");
    const unconfiguredResult = await reserveDteFiscalCapacity({
      dteDocumentId: docUnconfigured, tenantId: CERT_TENANT_ID, environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ source: "UNCONFIGURED", numeric_value: null })), runtimeDb: prisma, now: FAKE_NOW,
    });
    const unconfiguredRow = await prisma.dteFiscalMeteringReservation.findUnique({ where: { dte_document_id: docUnconfigured } });
    console.log(`  resultado -> ${JSON.stringify(unconfiguredResult)}`);
    console.log(`  fila creada -> ${unconfiguredRow ? "SÍ (FALLO)" : "ninguna (correcto)"}\n`);
    results["case7"] = { unconfiguredResult, noLedgerCreated: unconfiguredRow === null };
  } finally {
    // ── LIMPIEZA — solo fixtures propios, nunca un DELETE por tenant_id
    //    ciego sin lista explícita como respaldo (defensa en profundidad).
    console.log("── LIMPIEZA ─────────────────────────────────────────────");
    const delRes = await prisma.dteFiscalMeteringReservation.deleteMany({
      where: { OR: [{ id: { in: createdReservationIds } }, { tenant_id: CERT_TENANT_ID }] },
    });
    const delDocs = await prisma.dteOutgoingDocument.deleteMany({
      where: { OR: [{ id: { in: createdDocIds } }, { tenant_id: CERT_TENANT_ID }] },
    });
    console.log(`  DteFiscalMeteringReservation borradas: ${delRes.count}`);
    console.log(`  DteOutgoingDocument borrados          : ${delDocs.count}\n`);

    const postDocCount = await prisma.dteOutgoingDocument.count({ where: { tenant_id: CERT_TENANT_ID } });
    const postResCount = await prisma.dteFiscalMeteringReservation.count({ where: { tenant_id: CERT_TENANT_ID } });
    const postDocTotal = await prisma.dteOutgoingDocument.count();
    const postResTotal = await prisma.dteFiscalMeteringReservation.count();
    console.log("── Conteos POST-CLEANUP ─────────────────────────────────");
    console.log(`  DteOutgoingDocument (tenant sintético)        : ${postDocCount} (esperado 0)`);
    console.log(`  DteFiscalMeteringReservation (tenant sintético): ${postResCount} (esperado 0)`);
    console.log(`  DteOutgoingDocument (TOTAL en la base)          : ${postDocTotal} (debe igualar pre: ${(results["pre"] as any).preDocTotal})`);
    console.log(`  DteFiscalMeteringReservation (TOTAL en la base) : ${postResTotal} (debe igualar pre: ${(results["pre"] as any).preResTotal})\n`);

    results["post"] = { postDocCount, postResCount, postDocTotal, postResTotal };
  }

  console.log("═══ RESUMEN JSON (para el reporte) ═══");
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((err) => {
    console.error("❌  Error inesperado:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
