// ─────────────────────────────────────────────────────────────────
// platform — gym-clients-import-runner.ts
//
// GYM-ONBOARDING. Runner SERVER-ONLY para importar socios del gimnasio
// (modelo Client de la vertical GYM) desde un preview ya validado contra
// la base runtime destino. NO es el importador de Customer (commerce).
//
// Garantías:
// - Solo escribe en clients. Nunca crea User (ni acceso al portal),
//   membresías, pagos, asistencias, reservas ni movimientos comerciales.
// - Política fija CREATE_ONLY: no actualiza, no elimina, no hace upsert.
// - gym_id / branch_id / sport_id / goal_id vienen de los dependencyChecks
//   del analizador DB-aware (WHERE tenant_id / Gym.tenant_id).
// - Sin import parcial: cualquier fila bloqueada aborta todo.
// - operational_code: el del archivo, o generado EN LOTE con la
//   configuración de códigos del gimnasio (getClientCodeSettings) — no
//   se llama N veces al generador individual (repetiría el mismo código).
// - EXECUTE: una sola $transaction con pg_advisory_xact_lock por gimnasio
//   (serializa imports concurrentes del mismo gym); dentro del lock se
//   re-verifican gym, sucursales, códigos y documentos y se recalculan los
//   códigos; inserción con createMany (atómica). @@unique([gym_id,
//   operational_code]) y qr_token @unique son la última barrera.
// - qr_token único por fila (generateQrToken). modality default NORMAL.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[gym-clients-import-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import type { Gender, GymClientModality, Prisma } from "@prisma/client";
import { generateQrToken, getClientCodeSettings } from "@/lib/utils/operational-codes";
import type {
  GymClientsImportResult,
  GymImportDryRunResult,
  GymImportRowResult,
} from "../../../types/platform.types";
import {
  strVal,
  isBlank,
  normalizeDocument,
  normalizeOperationalCode,
  parseBirthDate,
  parseGender,
  parseGymStatus,
  parseModality,
  allocateOperationalCodes,
} from "../gym-onboarding-fields";
import {
  type GymImportRunnerInput,
  type GymBlockedRow,
  GYM_IMPORT_TX_OPTIONS,
  blockedOutcome,
  findDependencyId,
  fullName,
  globalBlockReason,
  parsedRowsByNumber,
} from "./gym-import-runner-shared";
import { createManyInBatches } from "./batch-write";

export const GYM_CLIENTS_IMPORT_LOCK_NAMESPACE = "zolvi:data-onboarding:gym-clients:";

interface PreparedClient {
  rowNumber:    number;
  name:         string;
  branchName:   string;
  explicitCode: string | null;
  documentKey:  string | null;
  data:         Omit<Prisma.ClientCreateManyInput, "operational_code" | "qr_token">;
}

function nullable(v: unknown): string | null {
  const s = strVal(v);
  return s === "" ? null : s;
}

export async function runGymClientsImport(
  input: GymImportRunnerInput,
): Promise<GymClientsImportResult | GymImportDryRunResult> {
  const { parsedPreview, dbAwareResult, prismaClient, tenantId, isDryRun } = input;
  const totalRows = dbAwareResult.rows.length;

  const globalBlock = globalBlockReason(input);
  if (globalBlock) throw new Error(globalBlock);

  // ── 1. Preparar filas desde el análisis DB-aware (solo CREATE) ──
  const parsedByNumber = parsedRowsByNumber(parsedPreview);
  const prepared: PreparedClient[] = [];
  const blocked:  GymBlockedRow[]  = [];
  const gymIds = new Set<string>();

  for (const dbRow of dbAwareResult.rows) {
    const data       = parsedByNumber.get(dbRow.rowNumber)?.data ?? {};
    const name       = fullName(data);
    const branchName = strVal(data.branch_name);
    const code       = strVal(data.operational_code);
    const ref        = { rowNumber: dbRow.rowNumber, name, code, branchName };

    const gymId    = findDependencyId(dbRow, "gym");
    const branchId = findDependencyId(dbRow, "branch");
    if (!gymId || !branchId) {
      blocked.push({ ...ref, reason: "Gimnasio o sucursal no resueltos por el análisis." });
      continue;
    }
    gymIds.add(gymId);

    const status   = parseGymStatus(data.status);
    const gender   = parseGender(data.gender);
    const birth    = parseBirthDate(data.birth_date);
    const modality = parseModality(data.modality);
    if (status === "INVALID" || gender === "INVALID" || birth === "INVALID" || modality === "INVALID") {
      blocked.push({ ...ref, reason: "Datos inválidos (status/gender/birth_date/modality)." });
      continue;
    }
    if (!isBlank(data.sport_name) && !findDependencyId(dbRow, "sport")) {
      blocked.push({ ...ref, reason: "Deporte no resuelto por el análisis." });
      continue;
    }
    if (!isBlank(data.goal_name) && !findDependencyId(dbRow, "goal")) {
      blocked.push({ ...ref, reason: "Objetivo no resuelto por el análisis." });
      continue;
    }

    prepared.push({
      rowNumber:    dbRow.rowNumber,
      name,
      branchName,
      explicitCode: code || null,
      documentKey:  isBlank(data.document_id) ? null : normalizeDocument(data.document_id),
      data: {
        gym_id:                  gymId,
        tenant_id:               tenantId,
        branch_id:               branchId,
        first_name:              strVal(data.first_name),
        last_name:               strVal(data.last_name),
        document_id:             nullable(data.document_id),
        birth_date:              birth ? new Date(`${birth}T00:00:00.000Z`) : null,
        gender:                  gender as Gender | null,
        email:                   nullable(data.email),
        phone:                   nullable(data.phone),
        address:                 nullable(data.address),
        emergency_contact_name:  nullable(data.emergency_contact_name),
        emergency_contact_phone: nullable(data.emergency_contact_phone),
        sport_id:                findDependencyId(dbRow, "sport"),
        goal_id:                 findDependencyId(dbRow, "goal"),
        assigned_trainer_id:     null,
        user_id:                 null,
        notes:                   nullable(data.notes),
        status:                  status ?? "active",
        modality:                modality as GymClientModality,
      },
    });
  }

  if (gymIds.size > 1) {
    throw new Error("El análisis resolvió más de un gimnasio para la misma organización. Importación abortada.");
  }

  const okRefs = () => prepared.map((p) => ({ rowNumber: p.rowNumber, name: p.name, code: p.explicitCode ?? "", branchName: p.branchName }));

  if (blocked.length > 0) {
    return blockedOutcome({ isDryRun, totalRows, okRows: okRefs(), blocked, label: "clientes GYM" });
  }
  if (prepared.length === 0) {
    throw new Error("El archivo no contiene clientes para importar.");
  }

  const gymId = [...gymIds][0];

  // ── 2. Asignación de códigos (lectura) — misma función en dry-run y EXECUTE ──
  async function assignCodes(db: Prisma.TransactionClient | typeof prismaClient) {
    const [settings, existing] = await Promise.all([
      getClientCodeSettings(tenantId, db as typeof prismaClient),
      db.client.findMany({ where: { gym_id: gymId }, select: { operational_code: true, document_id: true } }),
    ]);
    const used = new Set(existing.map((c) => c.operational_code).filter(Boolean).map((c) => normalizeOperationalCode(c)));
    const docs = new Set(existing.map((c) => c.document_id).filter(Boolean).map((d) => normalizeDocument(d)));

    const clashes: GymBlockedRow[] = [];
    for (const p of prepared) {
      const ref = { rowNumber: p.rowNumber, name: p.name, code: p.explicitCode ?? "", branchName: p.branchName };
      if (p.explicitCode && used.has(normalizeOperationalCode(p.explicitCode))) {
        clashes.push({ ...ref, reason: `El código operativo "${p.explicitCode}" ya existe en el gimnasio.` });
      } else if (p.documentKey && docs.has(p.documentKey)) {
        clashes.push({ ...ref, reason: "Ya existe un cliente con el mismo documento." });
      }
    }
    for (const p of prepared) if (p.explicitCode) used.add(normalizeOperationalCode(p.explicitCode));

    const generated = allocateOperationalCodes({
      ...settings,
      usedCodes: used,
      count:     prepared.filter((p) => !p.explicitCode).length,
    });
    let g = 0;
    const codes = prepared.map((p) => p.explicitCode ?? generated[g++]);
    return { codes, clashes };
  }

  // ── 3. Dry-run: sin escrituras ─────────────────────────────────
  if (isDryRun) {
    const { codes, clashes } = await assignCodes(prismaClient);
    if (clashes.length > 0) {
      return blockedOutcome({ isDryRun, totalRows, okRows: okRefs(), blocked: clashes, label: "clientes GYM" });
    }
    return {
      wouldCreate: prepared.length,
      blocked:     0,
      totalRows,
      rows:        prepared.map((p, i) => ({
        rowNumber: p.rowNumber, name: p.name, code: codes[i], branchName: p.branchName, resolution: "CREATED" as const,
      })),
    } satisfies GymImportDryRunResult;
  }

  // ── 4. EXECUTE: transacción atómica bajo lock del gimnasio ──────
  const branchIds = [...new Set(prepared.map((p) => p.data.branch_id))];

  const finalCodes = await prismaClient.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${GYM_CLIENTS_IMPORT_LOCK_NAMESPACE + gymId}))`;

    // Re-verificación dentro del lock: el estado pudo cambiar tras el análisis.
    const gym = await tx.gym.findUnique({ where: { tenant_id: tenantId }, select: { id: true } });
    if (!gym || gym.id !== gymId) {
      throw new Error("La extensión GYM de la organización cambió durante la importación. No se escribió ningún registro.");
    }
    const liveBranches = await tx.branch.findMany({
      where:  { tenant_id: tenantId, id: { in: branchIds } },
      select: { id: true, status: true, gym_id: true },
    });
    const okBranches = new Set(
      liveBranches.filter((b) => b.status === "active" && (!b.gym_id || b.gym_id === gymId)).map((b) => b.id),
    );
    if (branchIds.some((id) => !okBranches.has(id))) {
      throw new Error("Una sucursal del archivo ya no es válida para el gimnasio destino. No se escribió ningún registro.");
    }

    const { codes, clashes } = await assignCodes(tx);
    if (clashes.length > 0) {
      blockedOutcome({ isDryRun: false, totalRows, okRows: okRefs(), blocked: clashes, label: "clientes GYM" });
    }

    // ONBOARDING-5K: INSERT multi-fila por lotes de 500 dentro de esta transacción.
    await createManyInBatches(
      prepared.map((p, i) => ({ ...p.data, operational_code: codes[i], qr_token: generateQrToken() })),
      (batch) => tx.client.createMany({ data: batch }),
      "clientes GYM",
    );
    return codes;
  }, GYM_IMPORT_TX_OPTIONS);

  const rows: GymImportRowResult[] = prepared.map((p, i) => ({
    rowNumber: p.rowNumber, name: p.name, code: finalCodes[i], branchName: p.branchName, resolution: "CREATED",
  }));

  return {
    created:      prepared.length,
    skipped:      0,
    errors:       0,
    totalRows,
    importPolicy: "CREATE_ONLY",
    datasetKey:   "gym_clients",
    rows,
  } satisfies GymClientsImportResult;
}
