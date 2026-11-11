// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding — signer-provisioning.service.ts
//
// FISCAL-ONBOARDING — orquestador idempotente de firmadores DTE por
// organización/ambiente. Modos:
//   INSPECT  — solo lectura del VPS (ejecutor) -> observed_state.
//   PLAN     — sin efectos: spec + registro + observación -> plan.
//   APPLY    — exige confirmación textual "APPLY <id>", plan sin bloqueos
//              y lock exclusivo. La API Key se genera UNA vez y se persiste
//              cifrada ANTES de llamar al VPS: reintentos reutilizan la
//              misma clave (nunca dos claves por reintento).
//   VERIFY   — ejecutor (contenedor/puerto/plantillas/Apache) + verificación
//              remota (DNS/TLS/403/acceso con clave) + huellas VPS↔Zolvi↔DteCredential.
//   ROLLBACK — exige "ROLLBACK <id>" y el runId de un APPLY propio; el
//              ejecutor solo revierte lo que ese run creó.
//
// No ejecuta comandos: delega en el ejecutor del VPS (operaciones
// predefinidas). No transmite a Hacienda ni firma documentos.
// ─────────────────────────────────────────────────────────────────

import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { controlPlanePrisma } from "@/modules/platform/runtime/control-plane-prisma";
import { encryptText, decryptText } from "@/lib/security/encryption";
import { fingerprintSecret } from "@/modules/commerce/dte/lib/dte-credential-secret-guard";
import {
  allocatePort,
  deriveResourceNames,
  DEFAULT_ALLOWED_ROOT_DOMAINS,
  validateSignerSpec,
  type SignerSpec,
} from "../../../../ops/dte-signer-executor/lib/signer-core.mjs";
import { planSignerProvisioning, type SignerProvisioningPlan } from "./signer-provisioning.planner";
import {
  getSignerExecutorTransport,
  type SignerExecutorObserved,
  type SignerExecutorResponse,
  type SignerExecutorTransport,
} from "./signer-executor.transport";
import { verifySignerEndpoint, type RemoteCheck } from "./signer-remote-verifier";

export type SignerProvisioningMode = "INSPECT" | "PLAN" | "APPLY" | "VERIFY" | "ROLLBACK";
export type FiscalEnvironment = "TEST" | "PRODUCTION";

type Db = Pick<PrismaClient, "platformDteSignerProvisioning" | "platformDteSignerProvisioningRun">;

export interface RegisterCredentialInput {
  organizationId: string;
  issuerConfigId: string;
  environment:    FiscalEnvironment;
  signerUrl:      string;
  signerApiKey:   string;
  signerNit:      string | null;
  userId:         string;
}

export type RegisterCredentialFn = (input: RegisterCredentialInput) => Promise<{ ok: true } | { ok: false; error: string }>;
export type ReadCredentialFingerprintFn = (input: { organizationId: string; issuerConfigId: string; environment: FiscalEnvironment }) =>
  Promise<{ ok: true; signerHost: string | null; apiKeyFingerprint: string | null } | { ok: false; error: string }>;

export interface SignerProvisioningDeps {
  db?:        Db;
  transport?: SignerExecutorTransport;
  verifier?:  typeof verifySignerEndpoint;
  now?:       () => Date;
  generateApiKey?: () => string;
  registerCredential?: RegisterCredentialFn;
  readCredentialFingerprint?: ReadCredentialFingerprintFn;
  allowedRootDomains?: readonly string[];
}

const LOCK_MS = 10 * 60_000;
const MUTABLE_SPEC_STATUSES = ["DRAFT", "PLANNED", "FAILED", "ROLLED_BACK"] as const;

function allowedDomains(deps: SignerProvisioningDeps): readonly string[] {
  if (deps.allowedRootDomains) return deps.allowedRootDomains;
  const raw = process.env["ZOLVI_SIGNER_ALLOWED_ROOT_DOMAINS"]?.split(",").map((d) => d.trim()).filter(Boolean);
  return raw && raw.length > 0 ? raw : DEFAULT_ALLOWED_ROOT_DOMAINS;
}

type ProvisioningRow = Prisma.PlatformDteSignerProvisioningGetPayload<object>;

function specFromRow(row: ProvisioningRow, deps: SignerProvisioningDeps): SignerSpec {
  return {
    slug:        row.slug,
    environment: row.environment as FiscalEnvironment,
    hostname:    row.hostname,
    port:        row.port,
    signerNit:   row.signer_nit ?? "",
    cpanelUser:  row.cpanel_user ?? "",
    allowedRootDomains: allowedDomains(deps),
  };
}

// ── Spec declarativa ────────────────────────────────────────────────

export interface UpsertSignerSpecInput {
  slug:            string;
  hostname:        string;
  cpanelUser:      string;
  signerNit:       string;
  issuerConfigId?: string | null;
  fiscalProfile?:  string | null;
  preferredPort?:  number | null;
}

export type UpsertSignerSpecResult =
  | { ok: true; provisioningId: string; port: number; containerName: string }
  | { ok: false; error: string; code: string };

export async function upsertSignerProvisioningSpec(
  organizationId: string,
  environment: FiscalEnvironment,
  input: UpsertSignerSpecInput,
  userId: string,
  deps: SignerProvisioningDeps = {},
): Promise<UpsertSignerSpecResult> {
  const db = deps.db ?? controlPlanePrisma;
  if (environment !== "TEST" && environment !== "PRODUCTION") return { ok: false, code: "INVALID_ENV", error: "Ambiente inválido." };

  const existing = await db.platformDteSignerProvisioning.findUnique({
    where: { organization_id_environment: { organization_id: organizationId, environment } },
  });
  if (existing && !(MUTABLE_SPEC_STATUSES as readonly string[]).includes(existing.status)) {
    const sameInfra =
      existing.slug === input.slug && existing.hostname === input.hostname &&
      existing.cpanel_user === input.cpanelUser && existing.signer_nit === input.signerNit &&
      (input.preferredPort == null || input.preferredPort === existing.port);
    if (!sameInfra) {
      return { ok: false, code: "SPEC_LOCKED", error: `El firmador está en estado ${existing.status}; para cambiar hostname/puerto/NIT ejecute ROLLBACK primero.` };
    }
  }

  const others = await db.platformDteSignerProvisioning.findMany({
    where:  existing ? { NOT: { id: existing.id } } : {},
    select: { port: true },
  });
  const port = allocatePort({ usedPorts: others.map((o) => o.port), preferred: input.preferredPort ?? existing?.port ?? null });
  if (port === null) return { ok: false, code: "NO_PORT", error: "No hay puertos libres en el rango de firmadores." };
  if (input.preferredPort != null && port !== input.preferredPort) {
    return { ok: false, code: "PORT_UNAVAILABLE", error: `El puerto ${input.preferredPort} no está disponible (reservado o asignado).` };
  }

  const spec: SignerSpec = {
    slug: input.slug, environment, hostname: input.hostname, port,
    signerNit: input.signerNit, cpanelUser: input.cpanelUser, allowedRootDomains: allowedDomains(deps),
  };
  const v = validateSignerSpec(spec);
  if (!v.ok) return { ok: false, code: "INVALID_SPEC", error: v.errors.join(" ") };
  const names = deriveResourceNames(spec);

  const data = {
    slug: input.slug, hostname: input.hostname, port, container_name: names.containerName,
    cpanel_user: input.cpanelUser, signer_nit: input.signerNit,
    issuer_config_id: input.issuerConfigId ?? existing?.issuer_config_id ?? null,
    fiscal_profile: input.fiscalProfile ?? existing?.fiscal_profile ?? null,
    updated_by: userId,
  };

  try {
    if (existing) {
      const row = await db.platformDteSignerProvisioning.update({ where: { id: existing.id }, data });
      return { ok: true, provisioningId: row.id, port, containerName: names.containerName };
    }
    const row = await db.platformDteSignerProvisioning.create({
      data: { ...data, organization_id: organizationId, environment, status: "DRAFT", created_by: userId },
    });
    return { ok: true, provisioningId: row.id, port, containerName: names.containerName };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, code: "DUPLICATE_RESOURCE", error: "Hostname, puerto o contenedor ya asignado a otro firmador." };
    }
    throw err;
  }
}

// ── Ejecución de modos ─────────────────────────────────────────────

export interface SignerProvisioningRunResult {
  ok:      boolean;
  mode:    SignerProvisioningMode;
  runId:   string | null;
  status:  string | null;
  error?:  string;
  code?:   string;
  plan?:   SignerProvisioningPlan;
  steps?:  Array<{ op: string; status: string; detail?: string }>;
  checks?: Array<{ code: string; status: string; detail?: string }>;
  remoteChecks?: RemoteCheck[];
}

async function recordRun(
  db: Db,
  row: ProvisioningRow,
  mode: SignerProvisioningMode,
  status: "SUCCESS" | "FAILED" | "BLOCKED",
  data: { runId?: string; steps?: unknown; error?: string | null; userId: string; startedAt: Date; finishedAt: Date },
): Promise<string> {
  const run = await db.platformDteSignerProvisioningRun.create({
    data: {
      ...(data.runId ? { id: data.runId } : {}),
      organization_id: row.organization_id,
      provisioning_id: row.id,
      environment:     row.environment,
      mode,
      status,
      steps:           (data.steps ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      error_message:   data.error ?? null,
      triggered_by:    data.userId,
      started_at:      data.startedAt,
      finished_at:     data.finishedAt,
    },
  });
  return run.id;
}

async function acquireLock(db: Db, row: ProvisioningRow, runId: string, now: Date): Promise<boolean> {
  const res = await db.platformDteSignerProvisioning.updateMany({
    where: { id: row.id, OR: [{ lock_run_id: null }, { lock_expires_at: { lt: now } }] },
    data:  { lock_run_id: runId, lock_expires_at: new Date(now.getTime() + LOCK_MS) },
  });
  return res.count === 1;
}

async function releaseLock(db: Db, row: ProvisioningRow, runId: string): Promise<void> {
  await db.platformDteSignerProvisioning.updateMany({
    where: { id: row.id, lock_run_id: runId },
    data:  { lock_run_id: null, lock_expires_at: null },
  });
}

function sanitizeObserved(o: SignerExecutorObserved | undefined | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!o) return Prisma.JsonNull;
  // allContainers puede listar otros clientes: solo guardamos conteo.
  const { allContainers, ...rest } = o;
  return { ...rest, containerCount: allContainers?.length ?? null } as Prisma.InputJsonValue;
}

export async function runSignerProvisioning(
  input: {
    organizationId: string;
    environment:    FiscalEnvironment;
    mode:           SignerProvisioningMode;
    userId:         string;
    confirm?:       string;
    rollbackRunId?: string;
  },
  deps: SignerProvisioningDeps = {},
): Promise<SignerProvisioningRunResult> {
  const db        = deps.db ?? controlPlanePrisma;
  const transport = deps.transport ?? getSignerExecutorTransport();
  const now       = deps.now ?? (() => new Date());
  const startedAt = now();
  const { mode } = input;

  const row = await db.platformDteSignerProvisioning.findUnique({
    where: { organization_id_environment: { organization_id: input.organizationId, environment: input.environment } },
  });
  if (!row) return { ok: false, mode, runId: null, status: null, code: "NO_SPEC", error: "Primero registre la especificación del firmador." };

  const spec  = specFromRow(row, deps);
  const names = deriveResourceNames(spec);
  const fail = async (code: string, error: string, extra: Partial<SignerProvisioningRunResult> = {}, runStatus: "FAILED" | "BLOCKED" = "BLOCKED") => {
    const runId = await recordRun(db, row, mode, runStatus, { steps: extra.steps ?? extra.plan?.blockers ?? null, error, userId: input.userId, startedAt, finishedAt: now() });
    return { ok: false, mode, runId, status: row.status, code, error, ...extra } satisfies SignerProvisioningRunResult;
  };

  const registry = await db.platformDteSignerProvisioning.findMany({
    select: { organization_id: true, environment: true, hostname: true, port: true, container_name: true },
  });

  const buildPlan = (observed: SignerExecutorObserved | null) =>
    planSignerProvisioning({
      organizationId: row.organization_id, spec, registry, observed,
      apiKeyFingerprint: row.api_key_fingerprint, credentialRegistered: !!row.credential_registered_at,
    });

  // ── INSPECT ──
  if (mode === "INSPECT") {
    const res = await transport.call("inspect", { spec });
    if (!res.ok) {
      // El código viaja en la bitácora: distingue un fallo NUEVO de INSPECT
      // del last_error persistido por un APPLY anterior.
      const code = res.code ?? "EXECUTOR_ERROR";
      return fail(code, `${code}: ${res.message ?? "INSPECT falló."}`, {}, "FAILED");
    }
    // Un INSPECT exitoso demuestra que el ejecutor es alcanzable: un
    // last_error de transporte (de un APPLY previo que perdió la respuesta)
    // queda obsoleto y no debe seguir mostrándose como fallo actual. El
    // status NO cambia: el APPLY sigue sin completarse (usar PLAN/VERIFY).
    const staleTransportError = !!row.last_error && /^(EXECUTOR_UNREACHABLE|EXECUTOR_TIMEOUT)\b/.test(row.last_error);
    await db.platformDteSignerProvisioning.update({
      where: { id: row.id },
      data: {
        observed_state: sanitizeObserved(res.observed),
        ...(staleTransportError
          ? { last_error: `INSPECT ${now().toISOString()}: ejecutor accesible. El error de transporte anterior (APPLY) ya no aplica; estado ${row.status} conservado: revise PLAN antes de continuar.` }
          : {}),
      },
    });
    const runId = await recordRun(db, row, mode, "SUCCESS", { steps: null, userId: input.userId, startedAt, finishedAt: now() });
    return { ok: true, mode, runId, status: row.status, plan: buildPlan(res.observed ?? null) };
  }

  // ── PLAN (sin efectos en el VPS) ──
  if (mode === "PLAN") {
    let observed: SignerExecutorObserved | null = null;
    if (transport.configured) {
      const res = await transport.call("inspect", { spec });
      if (res.ok) observed = res.observed ?? null;
    }
    const plan = buildPlan(observed);
    if (plan.ok && (row.status === "DRAFT" || row.status === "FAILED" || row.status === "ROLLED_BACK")) {
      await db.platformDteSignerProvisioning.update({ where: { id: row.id }, data: { status: "PLANNED", template_version: plan.templateVersion, last_error: null } });
    }
    const runId = await recordRun(db, row, mode, plan.ok ? "SUCCESS" : "BLOCKED", { steps: plan.operations, error: plan.blockers.map((b) => b.message).join(" ") || null, userId: input.userId, startedAt, finishedAt: now() });
    return { ok: plan.ok, mode, runId, status: plan.ok && row.status === "DRAFT" ? "PLANNED" : row.status, plan };
  }

  // ── APPLY ──
  if (mode === "APPLY") {
    if (input.confirm !== `APPLY ${names.id}`) return fail("CONFIRMATION_REQUIRED", `Confirmación exacta requerida: "APPLY ${names.id}".`);
    if (!transport.configured) return fail("EXECUTOR_NOT_CONFIGURED", "El ejecutor del VPS no está configurado.");

    // El lock va ANTES del INSPECT y de leer la API Key: dos APPLY
    // consecutivos (doble clic, dos pestañas) no pueden decidir ambos sobre
    // una fila leída sin clave y generar dos API Keys distintas.
    const runId = randomUUID();
    if (!(await acquireLock(db, row, runId, now()))) {
      return { ok: false, mode, runId: null, status: row.status, code: "LOCKED", error: "Hay otra operación en curso para este firmador." };
    }

    try {
      const fresh = (await db.platformDteSignerProvisioning.findUnique({
        where: { organization_id_environment: { organization_id: row.organization_id, environment: row.environment } },
      })) ?? row;
      const inspect = await transport.call("inspect", { spec });
      if (!inspect.ok) return await fail(inspect.code ?? "EXECUTOR_ERROR", inspect.message ?? "INSPECT previo falló.", {}, "FAILED");
      const plan = planSignerProvisioning({
        organizationId: fresh.organization_id, spec, registry, observed: inspect.observed ?? null,
        apiKeyFingerprint: fresh.api_key_fingerprint, credentialRegistered: !!fresh.credential_registered_at,
      });
      if (!plan.ok) return await fail("PLAN_BLOCKED", plan.blockers.map((b) => b.message).join(" "), { plan });

      // API Key: generar y persistir cifrada UNA vez, antes de tocar el VPS.
      let apiKey: string | undefined;
      if (!inspect.observed?.apiKey?.present) {
        if (fresh.encrypted_api_key) {
          apiKey = decryptText(fresh.encrypted_api_key);
        } else {
          apiKey = (deps.generateApiKey ?? (() => randomBytes(32).toString("hex")))();
          await db.platformDteSignerProvisioning.update({
            where: { id: row.id },
            data:  { encrypted_api_key: encryptText(apiKey), api_key_fingerprint: fingerprintSecret(apiKey) },
          });
        }
      }

      await db.platformDteSignerProvisioning.update({ where: { id: row.id }, data: { status: "APPLYING", last_error: null } });
      let res: SignerExecutorResponse = await transport.call("apply", { spec, runId, ...(apiKey ? { apiKey } : {}) });

      // Una recarga de Apache puede cortar la respuesta HTTPS del ejecutor
      // aunque el VPS haya aplicado cambios. INSPECT es de solo lectura:
      // reconcilia el estado, nunca ejecuta APPLY otra vez ni rota la clave.
      if (res.code === "EXECUTOR_UNREACHABLE" || res.code === "EXECUTOR_TIMEOUT") {
        const postFailure = await transport.call("inspect", { spec });
        if (postFailure.ok && postFailure.observed) {
          const o = postFailure.observed;
          const expectedFp = fresh.api_key_fingerprint ?? (apiKey ? fingerprintSecret(apiKey) : null);
          const ready =
            o.container?.state === "running" &&
            o.container.managed &&
            o.container.loopbackOnly &&
            o.container.boundToExpectedPort &&
            o.cert?.present &&
            o.apiKey?.present &&
            !!expectedFp &&
            o.apiKey.fingerprint === expectedFp &&
            o.compose?.matches &&
            o.vhost?.matches &&
            !(o.vhostForeignIncludes?.length);
          res = ready
            ? { ok: true, op: "apply", observed: o, steps: [{ op: "RECONCILE", status: "OK", detail: "Infraestructura confirmada mediante INSPECT posterior a la pérdida de respuesta; ejecutar VERIFY." }] }
            : { ok: false, op: "apply", code: "APPLY_PARTIAL", message: "APPLY perdió la conexión y el VPS presenta recursos incompletos. No se reintentó automáticamente.", observed: o,
                steps: [{ op: "RECONCILE", status: "FAILED", detail: "INSPECT detectó infraestructura incompleta; revisar antes de reintentar." }] };
        } else {
          res = { ...res, code: "APPLY_UNCERTAIN", message: "Se perdió la respuesta de APPLY y no fue posible inspeccionar el VPS. No reintentar ni ejecutar ROLLBACK sin revisar su estado." };
        }
      }

      const keyStep = res.steps?.find((s) => s.op === "API_KEY");
      const vpsFp = res.observed?.apiKey?.fingerprint ?? null;
      const zolviFp = fresh.api_key_fingerprint ?? (apiKey ? fingerprintSecret(apiKey) : null);
      const drift = !!vpsFp && !!zolviFp && vpsFp !== zolviFp;

      const nextStatus = res.ok && !drift ? "INFRA_READY" : res.code === "CERT_MISSING" ? "PLANNED" : "FAILED";
      const errorMsg = drift
        ? "API_KEY_DRIFT: la API Key del VPS no coincide con la registrada en Zolvi."
        : res.ok ? null : `${res.code ?? "APPLY_FAILED"}: ${res.message ?? res.steps?.find((s) => s.status === "FAILED" || s.status === "BLOCKED" || s.status === "REVERTED")?.detail ?? "APPLY no completado."}`;

      await db.platformDteSignerProvisioning.update({
        where: { id: row.id },
        data:  {
          status: nextStatus, last_error: errorMsg, template_version: plan.templateVersion,
          observed_state: sanitizeObserved(res.observed),
          ...(keyStep && !fresh.api_key_fingerprint && vpsFp ? { api_key_fingerprint: vpsFp } : {}),
        },
      });
      await recordRun(db, row, mode, res.ok && !drift ? "SUCCESS" : "FAILED", { runId, steps: res.steps ?? null, error: errorMsg, userId: input.userId, startedAt, finishedAt: now() });
      return { ok: res.ok && !drift, mode, runId, status: nextStatus, steps: res.steps, plan, ...(errorMsg ? { error: errorMsg, code: drift ? "API_KEY_DRIFT" : res.code } : {}) };
    } finally {
      await releaseLock(db, row, runId);
    }
  }

  // ── VERIFY ──
  if (mode === "VERIFY") {
    if (!transport.configured) return fail("EXECUTOR_NOT_CONFIGURED", "El ejecutor del VPS no está configurado.");
    const local = await transport.call("verify", { spec });
    const apiKey = row.encrypted_api_key ? decryptText(row.encrypted_api_key) : null;
    const remote = await (deps.verifier ?? verifySignerEndpoint)({
      hostname: spec.hostname, signerUrl: names.signerUrl, apiKey,
      expectedIp: process.env["ZOLVI_SIGNER_VPS_IP"]?.trim() || null,
    });

    const checks: Array<{ code: string; status: string; detail?: string }> = [...(local.checks ?? [])];
    if (!local.ok && !local.checks) checks.push({ code: "EXECUTOR", status: "failed", detail: local.message ?? local.code });

    const vpsFp = local.observed?.apiKey?.fingerprint ?? null;
    checks.push({
      code: "API_KEY_FINGERPRINT_VPS",
      status: vpsFp && vpsFp === row.api_key_fingerprint ? "ok" : "failed",
      detail: vpsFp === row.api_key_fingerprint ? `huella ${vpsFp}` : "La huella del VPS no coincide con Zolvi.",
    });

    let credentialOk = false;
    if (row.issuer_config_id) {
      const reader = deps.readCredentialFingerprint ?? defaultReadCredentialFingerprint;
      const cred = await reader({ organizationId: row.organization_id, issuerConfigId: row.issuer_config_id, environment: spec.environment });
      if (cred.ok) {
        const hostOk = cred.signerHost === spec.hostname;
        const fpOk = !!cred.apiKeyFingerprint && cred.apiKeyFingerprint === row.api_key_fingerprint;
        credentialOk = hostOk && fpOk;
        checks.push({
          code: "ZOLVI_CREDENTIAL_MATCH",
          status: credentialOk ? "ok" : "failed",
          detail: credentialOk ? "DteCredential usa este firmador y esta API Key."
            : !hostOk ? `DteCredential apunta a ${cred.signerHost ?? "ningún firmador"}; registre la credencial.`
            : "La API Key de DteCredential no coincide con la del firmador.",
        });
      } else {
        checks.push({ code: "ZOLVI_CREDENTIAL_MATCH", status: "failed", detail: cred.error });
      }
    } else {
      checks.push({ code: "ZOLVI_CREDENTIAL_MATCH", status: "failed", detail: "Sin issuer_config_id asociado." });
    }

    const infraOk = local.ok && remote.ok && checks.filter((c) => c.code !== "ZOLVI_CREDENTIAL_MATCH").every((c) => c.status === "ok");
    const nextStatus = infraOk && credentialOk ? "SIGNER_READY" : infraOk ? "INFRA_READY" : row.status === "SIGNER_READY" ? "FAILED" : row.status;
    const error = infraOk && credentialOk ? null : checks.concat(remote.checks).filter((c) => c.status === "failed").map((c) => `${c.code}: ${c.detail ?? ""}`).join(" · ");

    await db.platformDteSignerProvisioning.update({
      where: { id: row.id },
      data:  { status: nextStatus, last_error: error, observed_state: sanitizeObserved(local.observed) },
    });
    const runId = await recordRun(db, row, mode, infraOk && credentialOk ? "SUCCESS" : "FAILED", { steps: { checks, remote: remote.checks }, error, userId: input.userId, startedAt, finishedAt: now() });
    return { ok: infraOk && credentialOk, mode, runId, status: nextStatus, checks, remoteChecks: remote.checks, ...(error ? { error } : {}) };
  }

  // ── ROLLBACK ──
  if (input.confirm !== `ROLLBACK ${names.id}`) return fail("CONFIRMATION_REQUIRED", `Confirmación exacta requerida: "ROLLBACK ${names.id}".`);
  if (!transport.configured) return fail("EXECUTOR_NOT_CONFIGURED", "El ejecutor del VPS no está configurado.");
  if (!input.rollbackRunId) return fail("RUN_ID_REQUIRED", "Indique el runId del APPLY a revertir.");
  const applyRun = await db.platformDteSignerProvisioningRun.findFirst({
    where: { id: input.rollbackRunId, provisioning_id: row.id, mode: "APPLY" },
    select: { id: true },
  });
  if (!applyRun) return fail("RUN_NOT_OWNED", "El runId no corresponde a un APPLY de este firmador.");

  const lockId = randomUUID();
  if (!(await acquireLock(db, row, lockId, now()))) {
    return { ok: false, mode, runId: null, status: row.status, code: "LOCKED", error: "Hay otra operación en curso para este firmador." };
  }
  try {
    const res = await transport.call("rollback", { spec, runId: applyRun.id });
    const nextStatus = res.ok ? "ROLLED_BACK" : "FAILED";
    const removedKey = res.steps?.some((s) => s.op === "API_KEY" && s.status === "REMOVED");
    await db.platformDteSignerProvisioning.update({
      where: { id: row.id },
      data: {
        status: nextStatus,
        last_error: res.ok ? null : res.message ?? "ROLLBACK incompleto.",
        observed_state: sanitizeObserved(res.observed),
        // Si el VPS eliminó la clave creada por ese APPLY, Zolvi también la descarta.
        ...(removedKey ? { encrypted_api_key: null, api_key_fingerprint: null, credential_registered_at: null } : {}),
      },
    });
    const runId = await recordRun(db, row, mode, res.ok ? "SUCCESS" : "FAILED", { steps: res.steps ?? null, error: res.ok ? null : res.message ?? null, userId: input.userId, startedAt, finishedAt: now() });
    return { ok: res.ok, mode, runId, status: nextStatus, steps: res.steps, ...(res.ok ? {} : { error: res.message ?? "ROLLBACK incompleto.", code: res.code }) };
  } finally {
    await releaseLock(db, row, lockId);
  }
}

// ── Registro de la credencial del firmador en Zolvi (runtime) ──────

export async function registerSignerCredentialForProvisioning(
  organizationId: string,
  environment: FiscalEnvironment,
  userId: string,
  deps: SignerProvisioningDeps = {},
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const db = deps.db ?? controlPlanePrisma;
  const row = await db.platformDteSignerProvisioning.findUnique({
    where: { organization_id_environment: { organization_id: organizationId, environment } },
  });
  if (!row) return { ok: false, code: "NO_SPEC", error: "No hay firmador registrado para este ambiente." };
  if (row.status !== "INFRA_READY" && row.status !== "SIGNER_READY") {
    return { ok: false, code: "INFRA_NOT_READY", error: `El firmador está en ${row.status}; ejecute APPLY y VERIFY antes de registrar la credencial.` };
  }
  if (!row.issuer_config_id) return { ok: false, code: "NO_ISSUER", error: "Asocie el DteIssuerConfig del emisor antes de registrar." };
  if (!row.encrypted_api_key) return { ok: false, code: "NO_API_KEY", error: "El firmador no tiene API Key registrada en Zolvi." };

  const names = deriveResourceNames(specFromRow(row, deps));
  const result = await (deps.registerCredential ?? defaultRegisterCredential)({
    organizationId, issuerConfigId: row.issuer_config_id, environment,
    signerUrl: names.signerUrl, signerApiKey: decryptText(row.encrypted_api_key),
    signerNit: row.signer_nit, userId,
  });
  if (!result.ok) return { ok: false, code: "REGISTER_FAILED", error: result.error };

  await db.platformDteSignerProvisioning.update({ where: { id: row.id }, data: { credential_registered_at: new Date(), updated_by: userId } });
  return { ok: true };
}

async function resolveOrgTenant(organizationId: string): Promise<string | null> {
  const org = await controlPlanePrisma.platformOrganization.findUnique({ where: { id: organizationId }, select: { tenant_id: true } });
  return org?.tenant_id ?? null;
}

const defaultRegisterCredential: RegisterCredentialFn = async (input) => {
  const tenantId = await resolveOrgTenant(input.organizationId);
  if (!tenantId) return { ok: false, error: "La organización no tiene tenant vinculado." };
  const { withOrganizationRuntimePrisma } = await import("@/modules/platform/runtime/runtime-database-router");
  const { upsertDteCredential } = await import("@/modules/commerce/dte/services/dte-credential.service");
  try {
    return await withOrganizationRuntimePrisma(input.organizationId, async (client) => {
      const issuer = await client.dteIssuerConfig.findFirst({
        where:  { id: input.issuerConfigId, tenant_id: tenantId, environment: input.environment },
        select: { id: true, tenant_id: true, location_id: true },
      });
      if (!issuer) return { ok: false as const, error: "El DteIssuerConfig no existe en el runtime de esta organización o es de otro ambiente." };
      const actor = await client.user.findFirst({ where: { id: input.userId, tenant_id: tenantId }, select: { id: true } });
      const res = await upsertDteCredential(
        issuer.id, issuer.tenant_id, issuer.location_id, actor?.id ?? null,
        { signerUrl: input.signerUrl, signerApiKey: input.signerApiKey, ...(input.signerNit ? { signerNit: input.signerNit } : {}) },
        client,
      );
      return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Runtime no disponible: ${err.name}` : "Runtime no disponible." };
  }
};

const defaultReadCredentialFingerprint: ReadCredentialFingerprintFn = async (input) => {
  const tenantId = await resolveOrgTenant(input.organizationId);
  if (!tenantId) return { ok: false, error: "La organización no tiene tenant vinculado." };
  const { withOrganizationRuntimePrisma } = await import("@/modules/platform/runtime/runtime-database-router");
  const { getDteCredentialStatus } = await import("@/modules/commerce/dte/services/dte-credential.service");
  try {
    return await withOrganizationRuntimePrisma(input.organizationId, async (client) => {
      const issuer = await client.dteIssuerConfig.findFirst({
        where: { id: input.issuerConfigId, tenant_id: tenantId, environment: input.environment }, select: { id: true },
      });
      if (!issuer) return { ok: false as const, error: "DteIssuerConfig no encontrado en el runtime." };
      const st = await getDteCredentialStatus(issuer.id, client);
      return { ok: true as const, signerHost: st.signer_host ?? null, apiKeyFingerprint: st.signer_api_key_fingerprint ?? null };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Runtime no disponible: ${err.name}` : "Runtime no disponible." };
  }
};

// ── Atestación de autorización MH PRODUCTION (no automatizable) ─────

export async function confirmMhProductionAuthorization(
  organizationId: string,
  reference: string,
  userId: string,
  deps: SignerProvisioningDeps = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = deps.db ?? controlPlanePrisma;
  const ref = reference.trim();
  if (ref.length < 6) return { ok: false, error: "Indique la referencia documental de la autorización de Hacienda (resolución/correo/fecha)." };
  const row = await db.platformDteSignerProvisioning.findUnique({
    where: { organization_id_environment: { organization_id: organizationId, environment: "PRODUCTION" } },
  });
  if (!row) return { ok: false, error: "Registre primero la especificación del firmador PRODUCTION." };
  await db.platformDteSignerProvisioning.update({
    where: { id: row.id },
    data:  { mh_authorization_confirmed_at: new Date(), mh_authorization_confirmed_by: userId, mh_authorization_reference: ref.slice(0, 300) },
  });
  return { ok: true };
}

// ── Resumen sanitizado para UI ─────────────────────────────────────

export interface SignerProvisioningSummary {
  exists:          boolean;
  id:              string | null;
  environment:     FiscalEnvironment;
  slug:            string | null;
  hostname:        string | null;
  port:            number | null;
  container_name:  string | null;
  cpanel_user:     string | null;
  signer_nit:      string | null;
  issuer_config_id: string | null;
  status:          string;
  template_version: string | null;
  api_key_fingerprint: string | null;
  credential_registered_at: Date | null;
  mh_authorization_confirmed_at: Date | null;
  mh_authorization_reference: string | null;
  last_error:      string | null;
  resource_id:     string | null;
  signer_url:      string | null;
  executor_configured: boolean;
  recent_runs:     Array<{ id: string; mode: string; status: string; started_at: Date; error_message: string | null }>;
}

export async function getSignerProvisioningSummary(
  organizationId: string,
  environment: FiscalEnvironment,
  deps: SignerProvisioningDeps = {},
): Promise<SignerProvisioningSummary> {
  const db = deps.db ?? controlPlanePrisma;
  const transport = deps.transport ?? getSignerExecutorTransport();
  const row = await db.platformDteSignerProvisioning.findUnique({
    where: { organization_id_environment: { organization_id: organizationId, environment } },
  });
  const runs = row
    ? await db.platformDteSignerProvisioningRun.findMany({
        where: { provisioning_id: row.id }, orderBy: { started_at: "desc" }, take: 8,
        select: { id: true, mode: true, status: true, started_at: true, error_message: true },
      })
    : [];
  const names = row && validateSignerSpec(specFromRow(row, deps)).ok ? deriveResourceNames(specFromRow(row, deps)) : null;
  return {
    exists: !!row, id: row?.id ?? null, environment,
    slug: row?.slug ?? null, hostname: row?.hostname ?? null, port: row?.port ?? null,
    container_name: row?.container_name ?? null, cpanel_user: row?.cpanel_user ?? null,
    signer_nit: row?.signer_nit ?? null, issuer_config_id: row?.issuer_config_id ?? null,
    status: row?.status ?? "NOT_REGISTERED", template_version: row?.template_version ?? null,
    api_key_fingerprint: row?.api_key_fingerprint ?? null,
    credential_registered_at: row?.credential_registered_at ?? null,
    mh_authorization_confirmed_at: row?.mh_authorization_confirmed_at ?? null,
    mh_authorization_reference: row?.mh_authorization_reference ?? null,
    last_error: row?.last_error ?? null,
    resource_id: names?.id ?? null, signer_url: names?.signerUrl ?? null,
    executor_configured: transport.configured,
    recent_runs: runs,
  };
}
