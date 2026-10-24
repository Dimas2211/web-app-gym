// ─────────────────────────────────────────────────────────────────
// platform — gym-trainers-import-runner.ts
//
// GYM-ONBOARDING. Runner SERVER-ONLY para importar entrenadores (modelo
// Trainer de la vertical GYM) desde un preview ya validado contra la
// base runtime destino.
//
// Garantías:
// - Solo escribe en trainers, con user_id = null: nunca crea User ni
//   vincula cuentas (eso sigue en la interfaz de Entrenadores, que valida
//   tenant + rol trainer). No crea disponibilidad, sesiones, clases ni
//   reservas. No modifica entrenadores existentes.
// - Política fija CREATE_ONLY. Sin import parcial.
// - gym_id / branch_id vienen de los dependencyChecks del analizador.
// - EXECUTE: una sola $transaction con pg_advisory_xact_lock por
//   gimnasio; dentro del lock se re-verifican gym, sucursales y
//   duplicados (email / nombre completo) y se inserta con createMany.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[gym-trainers-import-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import type { Prisma } from "@prisma/client";
import type {
  GymTrainersImportResult,
  GymImportDryRunResult,
  GymImportRowResult,
} from "../../../types/platform.types";
import {
  strVal,
  isBlank,
  normalizeKey,
  personKey,
  parseGymStatus,
  parsePersonalizedCapacity,
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

export const GYM_TRAINERS_IMPORT_LOCK_NAMESPACE = "zolvi:data-onboarding:gym-trainers:";

interface PreparedTrainer {
  rowNumber:  number;
  name:       string;
  branchName: string;
  emailKey:   string | null;
  nameKey:    string;
  data:       Prisma.TrainerCreateManyInput;
}

function nullable(v: unknown): string | null {
  const s = strVal(v);
  return s === "" ? null : s;
}

export async function runGymTrainersImport(
  input: GymImportRunnerInput,
): Promise<GymTrainersImportResult | GymImportDryRunResult> {
  const { parsedPreview, dbAwareResult, prismaClient, tenantId, isDryRun } = input;
  const totalRows = dbAwareResult.rows.length;

  const globalBlock = globalBlockReason(input);
  if (globalBlock) throw new Error(globalBlock);

  const parsedByNumber = parsedRowsByNumber(parsedPreview);
  const prepared: PreparedTrainer[] = [];
  const blocked:  GymBlockedRow[]   = [];
  const gymIds = new Set<string>();

  for (const dbRow of dbAwareResult.rows) {
    const data       = parsedByNumber.get(dbRow.rowNumber)?.data ?? {};
    const name       = fullName(data);
    const branchName = strVal(data.branch_name);
    const ref        = { rowNumber: dbRow.rowNumber, name, code: "", branchName };

    const gymId    = findDependencyId(dbRow, "gym");
    const branchId = findDependencyId(dbRow, "branch");
    if (!gymId || !branchId) {
      blocked.push({ ...ref, reason: "Gimnasio o sucursal no resueltos por el análisis." });
      continue;
    }
    gymIds.add(gymId);

    const status   = parseGymStatus(data.status);
    const capacity = parsePersonalizedCapacity(data.personalized_capacity);
    if (status === "INVALID" || capacity === "INVALID") {
      blocked.push({ ...ref, reason: "Datos inválidos (status/personalized_capacity)." });
      continue;
    }

    prepared.push({
      rowNumber:  dbRow.rowNumber,
      name,
      branchName,
      emailKey:   isBlank(data.email) ? null : normalizeKey(data.email),
      nameKey:    personKey(data.first_name, data.last_name),
      data: {
        gym_id:                gymId,
        tenant_id:             tenantId,
        branch_id:             branchId,
        user_id:               null,
        first_name:            strVal(data.first_name),
        last_name:             strVal(data.last_name),
        email:                 nullable(data.email),
        phone:                 nullable(data.phone),
        specialty:             nullable(data.specialty),
        notes:                 nullable(data.notes),
        personalized_capacity: capacity,
        status:                status ?? "active",
      },
    });
  }

  if (gymIds.size > 1) {
    throw new Error("El análisis resolvió más de un gimnasio para la misma organización. Importación abortada.");
  }

  const okRefs = () => prepared.map((p) => ({ rowNumber: p.rowNumber, name: p.name, code: "", branchName: p.branchName }));

  if (blocked.length > 0) {
    return blockedOutcome({ isDryRun, totalRows, okRows: okRefs(), blocked, label: "entrenadores" });
  }
  if (prepared.length === 0) {
    throw new Error("El archivo no contiene entrenadores para importar.");
  }

  const gymId = [...gymIds][0];

  async function findClashes(db: Prisma.TransactionClient | typeof prismaClient): Promise<GymBlockedRow[]> {
    const existing = await db.trainer.findMany({
      where:  { gym_id: gymId },
      select: { first_name: true, last_name: true, email: true },
    });
    const emails = new Set(existing.map((t) => normalizeKey(t.email)).filter(Boolean));
    const names  = new Set(existing.map((t) => personKey(t.first_name, t.last_name)));
    return prepared
      .filter((p) => (p.emailKey && emails.has(p.emailKey)) || names.has(p.nameKey))
      .map((p) => ({
        rowNumber: p.rowNumber, name: p.name, code: "", branchName: p.branchName,
        reason: "Ya existe un entrenador con el mismo email o nombre completo en el gimnasio.",
      }));
  }

  if (isDryRun) {
    const clashes = await findClashes(prismaClient);
    if (clashes.length > 0) {
      return blockedOutcome({ isDryRun, totalRows, okRows: okRefs(), blocked: clashes, label: "entrenadores" });
    }
    return {
      wouldCreate: prepared.length,
      blocked:     0,
      totalRows,
      rows:        prepared.map((p) => ({
        rowNumber: p.rowNumber, name: p.name, code: "", branchName: p.branchName, resolution: "CREATED" as const,
      })),
    } satisfies GymImportDryRunResult;
  }

  const branchIds = [...new Set(prepared.map((p) => p.data.branch_id))];

  await prismaClient.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${GYM_TRAINERS_IMPORT_LOCK_NAMESPACE + gymId}))`;

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

    const clashes = await findClashes(tx);
    if (clashes.length > 0) {
      blockedOutcome({ isDryRun: false, totalRows, okRows: okRefs(), blocked: clashes, label: "entrenadores" });
    }

    // ONBOARDING-5K: INSERT multi-fila por lotes de 500 dentro de esta transacción.
    await createManyInBatches(
      prepared.map((p) => p.data),
      (batch) => tx.trainer.createMany({ data: batch }),
      "entrenadores",
    );
  }, GYM_IMPORT_TX_OPTIONS);

  const rows: GymImportRowResult[] = prepared.map((p) => ({
    rowNumber: p.rowNumber, name: p.name, code: "", branchName: p.branchName, resolution: "CREATED",
  }));

  return {
    created:      prepared.length,
    skipped:      0,
    errors:       0,
    totalRows,
    importPolicy: "CREATE_ONLY",
    datasetKey:   "gym_trainers",
    rows,
  } satisfies GymTrainersImportResult;
}
