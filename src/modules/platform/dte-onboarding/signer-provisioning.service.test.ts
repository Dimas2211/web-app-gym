// FISCAL-ONBOARDING — orquestador de firmadores: PLAN sin efectos,
// APPLY con confirmación/lock/clave única, drift, VERIFY y ROLLBACK
// propio. Base y ejecutor simulados (sin VPS, sin red).

import { createHash, randomBytes } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");

vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({ controlPlanePrisma: {} }));

import { runSignerProvisioning, upsertSignerProvisioningSpec, type SignerProvisioningDeps } from "./signer-provisioning.service";
import { planSignerProvisioning } from "./signer-provisioning.planner";
import type { SignerExecutorOp, SignerExecutorParams, SignerExecutorResponse, SignerExecutorTransport } from "./signer-executor.transport";

const fp = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// ── Control Plane simulado ────────────────────────────────────────
type Row = Record<string, unknown> & { id: string; organization_id: string; environment: string; status: string };
function fakeDb() {
  const rows: Row[] = [];
  const runs: Array<Record<string, unknown>> = [];
  let n = 0;
  const matchLock = (r: Row, where: Record<string, unknown>, now?: Date) => {
    if (where.id !== r.id) return false;
    if ("lock_run_id" in where) return r.lock_run_id === where.lock_run_id;
    if (where.OR) return r.lock_run_id == null || (r.lock_expires_at as Date) < (now as Date);
    return true;
  };
  return {
    rows, runs,
    platformDteSignerProvisioning: {
      findUnique: vi.fn(async ({ where }: { where: { organization_id_environment: { organization_id: string; environment: string } } }) =>
        rows.find((r) => r.organization_id === where.organization_id_environment.organization_id && r.environment === where.organization_id_environment.environment) ?? null),
      findMany: vi.fn(async (args: { where?: { NOT?: { id: string } } } = {}) => rows.filter((r) => !args.where?.NOT || r.id !== args.where.NOT.id)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const r = { id: `prov-${++n}`, encrypted_api_key: null, api_key_fingerprint: null, credential_registered_at: null, lock_run_id: null, lock_expires_at: null, ...data } as unknown as Row;
        rows.push(r); return r;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(rows.find((r) => r.id === where.id)!, data)),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const or = where.OR as Array<Record<string, { lt?: Date }>> | undefined;
        const now = or?.[1]?.lock_expires_at?.lt;
        const hits = rows.filter((r) => matchLock(r, where, now));
        hits.forEach((r) => Object.assign(r, data));
        return { count: hits.length };
      }),
    },
    platformDteSignerProvisioningRun: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const r = { id: (data.id as string) ?? `run-${++n}`, ...data }; runs.push(r); return r; }),
      findFirst: vi.fn(async ({ where }: { where: { id: string; provisioning_id: string; mode: string } }) =>
        runs.find((r) => r.id === where.id && r.provisioning_id === where.provisioning_id && r.mode === where.mode) ?? null),
    },
  };
}

// ── VPS simulado detrás del transporte ────────────────────────────
function fakeTransport(opts: { cert?: boolean; existingKeyFp?: string | null; failFirstApplyBeforeKey?: boolean } = {}) {
  const vps = { cert: opts.cert ?? true, keyFp: opts.existingKeyFp ?? null, container: false, keysSent: [] as string[], applyCount: 0 };
  const observed = () => ({
    container: vps.container ? { name: "c", state: "running", managed: true, templateVersion: "zolvi-signer-v1", loopbackOnly: true, boundToExpectedPort: true } : null,
    protected: false, portInUse: vps.container, portOwners: [], dirExists: vps.container,
    cert: { present: vps.cert, fingerprint: vps.cert ? "certfp" : null },
    apiKey: { present: !!vps.keyFp, fingerprint: vps.keyFp },
    compose: { present: vps.container, templateVersion: null, matches: true },
    vhost: { present: false, templateVersion: null, matches: false },
  });
  const call = vi.fn(async (op: SignerExecutorOp, params: SignerExecutorParams): Promise<SignerExecutorResponse> => {
    if (op === "inspect") return { ok: true, observed: observed() };
    if (op === "apply") {
      vps.applyCount++;
      if (params.apiKey) vps.keysSent.push(params.apiKey);
      if (opts.failFirstApplyBeforeKey && vps.applyCount === 1) return { ok: false, code: "EXECUTOR_TIMEOUT", message: "timeout" };
      if (!vps.keyFp) {
        if (!params.apiKey) return { ok: false, code: "API_KEY_REQUIRED" };
        vps.keyFp = fp(params.apiKey);
      }
      if (!vps.cert) return { ok: false, code: "CERT_MISSING", steps: [{ op: "API_KEY", status: "CREATED" }, { op: "CERT", status: "BLOCKED", detail: "falta cert" }], observed: observed() };
      vps.container = true;
      return { ok: true, steps: [{ op: "API_KEY", status: params.apiKey ? "CREATED" : "KEPT" }, { op: "CONTAINER", status: "CREATED" }], observed: observed() };
    }
    if (op === "verify") return { ok: true, checks: [{ code: "CONTAINER_RUNNING", status: "ok" }], observed: observed() };
    // rollback
    vps.container = false; vps.keyFp = null;
    return { ok: true, steps: [{ op: "API_KEY", status: "REMOVED" }, { op: "CERT", status: "UNTOUCHED" }], observed: observed() };
  });
  const transport: SignerExecutorTransport = { configured: true, call };
  return { transport, vps, call };
}

const SPEC_IN = { slug: "cliente-a", hostname: "firmador-cliente-a-test.getzolvi.com", cpanelUser: "zolvi", signerNit: "06140000000000", issuerConfigId: "iss-test" };
const ID = "cliente-a-test";

let db: ReturnType<typeof fakeDb>;
beforeEach(() => { db = fakeDb(); });

const deps = (extra: Partial<SignerProvisioningDeps> = {}): SignerProvisioningDeps => ({
  db: db as never,
  verifier: vi.fn(async () => ({ ok: true, checks: [] })),
  ...extra,
});

describe("upsertSignerProvisioningSpec — colisiones de puerto/hostname y bloqueo de cambios", () => {
  it("dos organizaciones obtienen puertos distintos; puerto preferido ocupado -> PORT_UNAVAILABLE", async () => {
    const a = await upsertSignerProvisioningSpec("org-a", "TEST", SPEC_IN, "u", deps());
    const b = await upsertSignerProvisioningSpec("org-b", "TEST", { ...SPEC_IN, slug: "cliente-b", hostname: "firmador-cliente-b-test.getzolvi.com" }, "u", deps());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.port).not.toBe(b.port);
    const c = await upsertSignerProvisioningSpec("org-c", "TEST", { ...SPEC_IN, slug: "cliente-c", hostname: "firmador-cliente-c-test.getzolvi.com", preferredPort: a.ok ? a.port : 0 }, "u", deps());
    expect(c).toMatchObject({ ok: false, code: "PORT_UNAVAILABLE" });
    const reserved = await upsertSignerProvisioningSpec("org-d", "TEST", { ...SPEC_IN, slug: "cliente-d", hostname: "firmador-cliente-d-test.getzolvi.com", preferredPort: 8115 }, "u", deps());
    expect(reserved).toMatchObject({ ok: false, code: "PORT_UNAVAILABLE" });
  });

  it("con infraestructura aplicada, cambiar hostname exige ROLLBACK (SPEC_LOCKED)", async () => {
    await upsertSignerProvisioningSpec("org-a", "TEST", SPEC_IN, "u", deps());
    db.rows[0].status = "INFRA_READY";
    const r = await upsertSignerProvisioningSpec("org-a", "TEST", { ...SPEC_IN, hostname: "otro-test.getzolvi.com" }, "u", deps());
    expect(r).toMatchObject({ ok: false, code: "SPEC_LOCKED" });
  });
});

describe("planSignerProvisioning", () => {
  const spec = { slug: "cliente-a", environment: "TEST" as const, hostname: SPEC_IN.hostname, port: 8120, signerNit: SPEC_IN.signerNit, cpanelUser: "zolvi" };
  it("hostname/puerto/contenedor de otra organización -> bloqueos", () => {
    const p = planSignerProvisioning({ organizationId: "org-b", spec, registry: [{ organization_id: "org-a", environment: "TEST", hostname: spec.hostname, port: 8120, container_name: "dte-firmador-cliente-a-test" }], observed: null, apiKeyFingerprint: null, credentialRegistered: false });
    expect(p.blockers.map((b) => b.code).sort()).toEqual(["CONTAINER_TAKEN", "HOSTNAME_TAKEN", "PORT_TAKEN"]);
  });
  it("misma organización: su propia fila no colisiona; firmador protegido de MetaTraining bloqueado", () => {
    expect(planSignerProvisioning({ organizationId: "org-a", spec, registry: [{ organization_id: "org-a", environment: "TEST", hostname: spec.hostname, port: 8120, container_name: "dte-firmador-cliente-a-test" }], observed: null, apiKeyFingerprint: null, credentialRegistered: false }).ok).toBe(true);
    const mt = planSignerProvisioning({ organizationId: "org-mt", spec: { ...spec, slug: "metatraining", hostname: "firmador-metatraining-test.getzolvi.com" }, registry: [], observed: null, apiKeyFingerprint: null, credentialRegistered: false });
    expect(mt.blockers.map((b) => b.code)).toContain("PROTECTED_RESOURCE");
  });
  it("la vista previa no contiene ninguna API Key", () => {
    const p = planSignerProvisioning({ organizationId: "org-a", spec, registry: [], observed: null, apiKeyFingerprint: null, credentialRegistered: false });
    expect(JSON.stringify(p)).not.toMatch(/[a-f0-9]{64}/);
  });
});

describe("runSignerProvisioning", () => {
  beforeEach(async () => { await upsertSignerProvisioningSpec("org-a", "TEST", SPEC_IN, "u", deps()); });

  it("PLAN no modifica el VPS (solo inspect) y funciona incluso sin ejecutor", async () => {
    const { transport, call } = fakeTransport();
    const r = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "PLAN", userId: "u" }, deps({ transport }));
    expect(r).toMatchObject({ ok: true, status: "PLANNED" });
    expect(call.mock.calls.map((c) => c[0])).toEqual(["inspect"]);
    const offline = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "PLAN", userId: "u" }, deps({ transport: { configured: false, call: vi.fn() } }));
    expect(offline.plan?.warnings.map((w) => w.code)).toContain("NO_OBSERVATION");
  });

  it("APPLY exige confirmación textual exacta", async () => {
    const { transport, call } = fakeTransport();
    const r = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: "APPLY" }, deps({ transport }));
    expect(r).toMatchObject({ ok: false, code: "CONFIRMATION_REQUIRED" });
    expect(call).not.toHaveBeenCalled();
  });

  it("fallo antes de instalar la clave: el reintento reutiliza LA MISMA API Key (nunca dos claves)", async () => {
    const { transport, vps } = fakeTransport({ failFirstApplyBeforeKey: true });
    const gen = vi.fn(() => randomBytes(32).toString("hex"));
    const first = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: `APPLY ${ID}` }, deps({ transport, generateApiKey: gen }));
    expect(first).toMatchObject({ ok: false, status: "FAILED" });
    const second = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: `APPLY ${ID}` }, deps({ transport, generateApiKey: gen }));
    expect(second).toMatchObject({ ok: true, status: "INFRA_READY" });
    expect(gen).toHaveBeenCalledTimes(1);
    expect(new Set(vps.keysSent).size).toBe(1);
    expect(db.rows[0].api_key_fingerprint).toBe(vps.keyFp);
    expect(String(db.rows[0].encrypted_api_key)).not.toContain(vps.keysSent[0]);
    expect(JSON.stringify(db.runs)).not.toContain(vps.keysSent[0]);
  });

  it("APPLY que arrancó con la fila leída ANTES de que otro APPLY guardara la clave: tras el lock relee y reutiliza esa clave", async () => {
    const { transport, vps } = fakeTransport({ failFirstApplyBeforeKey: true });
    const gen = vi.fn(() => randomBytes(32).toString("hex"));
    const stale = { ...db.rows[0] }; // snapshot sin encrypted_api_key
    await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: `APPLY ${ID}` }, deps({ transport, generateApiKey: gen }));
    const savedKey = db.rows[0].encrypted_api_key;
    expect(savedKey).toBeTruthy();

    db.platformDteSignerProvisioning.findUnique.mockImplementationOnce(async () => ({ ...stale }) as never);
    const second = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: `APPLY ${ID}` }, deps({ transport, generateApiKey: gen }));
    expect(second).toMatchObject({ ok: true, status: "INFRA_READY" });
    expect(gen).toHaveBeenCalledTimes(1);
    expect(new Set(vps.keysSent).size).toBe(1);
    expect(db.rows[0].encrypted_api_key).toBe(savedKey);
  });

  it("sin certificado queda PLANNED (espera al operador); con certificado el re-APPLY no rota la clave", async () => {
    const t = fakeTransport({ cert: false });
    const r1 = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: `APPLY ${ID}` }, deps({ transport: t.transport }));
    expect(r1).toMatchObject({ ok: false, status: "PLANNED", code: "CERT_MISSING" });
    t.vps.cert = true;
    const r2 = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: `APPLY ${ID}` }, deps({ transport: t.transport }));
    expect(r2).toMatchObject({ ok: true, status: "INFRA_READY" });
    expect(t.vps.keysSent).toHaveLength(1);
  });

  it("conexión perdida y APPLY parcial: INSPECT reconcilia, sin repetir APPLY ni rotar clave", async () => {
    const t = fakeTransport();
    const generateApiKey = vi.fn(() => randomBytes(32).toString("hex"));
    const baseCall = t.transport.call.bind(t.transport);
    let inspectCount = 0;
    let applyCount = 0;
    const transport: SignerExecutorTransport = {
      configured: true,
      call: vi.fn(async (op, params) => {
        if (op === "inspect") {
          inspectCount++;
          if (inspectCount === 2) {
            const observed = await baseCall(op, params);
            return { ...observed, observed: { ...observed.observed,
              container: { name: "c", state: "running", managed: true, templateVersion: "zolvi-signer-v1", loopbackOnly: true, boundToExpectedPort: true },
              portInUse: true, apiKey: { present: true, fingerprint: db.rows[0].api_key_fingerprint as string },
              compose: { present: true, templateVersion: "zolvi-signer-v1", matches: true },
              vhost: { present: false, templateVersion: null, matches: false },
            } };
          }
        }
        if (op === "apply") {
          applyCount++;
          return { ok: false, code: "EXECUTOR_UNREACHABLE", message: "No se pudo contactar al ejecutor del VPS." };
        }
        return baseCall(op, params);
      }),
    };
    const result = await runSignerProvisioning(
      { organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: `APPLY ${ID}` },
      deps({ transport, generateApiKey }),
    );
    expect(result).toMatchObject({ ok: false, status: "FAILED", code: "APPLY_PARTIAL" });
    expect(applyCount).toBe(1);
    expect(inspectCount).toBe(2);
    expect(generateApiKey).toHaveBeenCalledTimes(1);
    expect(db.rows[0].encrypted_api_key).toBeTruthy();
    expect(db.rows[0].observed_state).toMatchObject({ vhost: { present: false }, apiKey: { present: true } });
  });

  it("conexión perdida y INSPECT inaccesible: no presume APPLY exitoso", async () => {
    const base = fakeTransport();
    const transport: SignerExecutorTransport = {
      configured: true,
      call: vi.fn(async (op, params) => {
        if (op === "apply") return { ok: false, code: "EXECUTOR_UNREACHABLE" };
        if (op === "inspect" && base.call.mock.calls.filter((c) => c[0] === "inspect").length > 0) {
          return { ok: false, code: "EXECUTOR_UNREACHABLE" };
        }
        return base.transport.call(op, params);
      }),
    };
    const result = await runSignerProvisioning(
      { organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: `APPLY ${ID}` },
      deps({ transport }),
    );
    expect(result).toMatchObject({ ok: false, status: "FAILED", code: "APPLY_UNCERTAIN" });
    expect(transport.call).toHaveBeenCalledTimes(3);
  });

  it("lock vigente -> LOCKED (doble clic / concurrencia), sin llamar apply", async () => {
    const { transport, call } = fakeTransport();
    Object.assign(db.rows[0], { lock_run_id: "otro", lock_expires_at: new Date(Date.now() + 60_000) });
    const r = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: `APPLY ${ID}` }, deps({ transport }));
    expect(r).toMatchObject({ ok: false, code: "LOCKED" });
    expect(call.mock.calls.map((c) => c[0])).not.toContain("apply");
  });

  it("clave existente en el VPS desconocida para Zolvi -> PLAN_BLOCKED (API_KEY_DRIFT)", async () => {
    const { transport, call } = fakeTransport({ existingKeyFp: "deadbeefdeadbeef" });
    const r = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: `APPLY ${ID}` }, deps({ transport }));
    expect(r).toMatchObject({ ok: false, code: "PLAN_BLOCKED" });
    expect(r.plan?.blockers.map((b) => b.code)).toContain("API_KEY_DRIFT");
    expect(call.mock.calls.map((c) => c[0])).not.toContain("apply");
  });

  it("VERIFY: SIGNER_READY solo si DteCredential usa este host y esta clave", async () => {
    const t = fakeTransport();
    await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: `APPLY ${ID}` }, deps({ transport: t.transport }));
    const wrong = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "VERIFY", userId: "u" }, deps({
      transport: t.transport, readCredentialFingerprint: async () => ({ ok: true, signerHost: "firmador-otro.getzolvi.com", apiKeyFingerprint: t.vps.keyFp }),
    }));
    expect(wrong).toMatchObject({ ok: false, status: "INFRA_READY" });
    const right = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "VERIFY", userId: "u" }, deps({
      transport: t.transport, readCredentialFingerprint: async () => ({ ok: true, signerHost: SPEC_IN.hostname, apiKeyFingerprint: t.vps.keyFp }),
    }));
    expect(right).toMatchObject({ ok: true, status: "SIGNER_READY" });
  });

  it("ROLLBACK exige confirmación y un runId de APPLY propio; descarta la clave eliminada", async () => {
    const t = fakeTransport();
    const applied = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "APPLY", userId: "u", confirm: `APPLY ${ID}` }, deps({ transport: t.transport }));
    const noConfirm = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "ROLLBACK", userId: "u", rollbackRunId: applied.runId! }, deps({ transport: t.transport }));
    expect(noConfirm).toMatchObject({ ok: false, code: "CONFIRMATION_REQUIRED" });
    const foreign = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "ROLLBACK", userId: "u", confirm: `ROLLBACK ${ID}`, rollbackRunId: "11111111-1111-4111-8111-111111111111" }, deps({ transport: t.transport }));
    expect(foreign).toMatchObject({ ok: false, code: "RUN_NOT_OWNED" });
    const own = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "ROLLBACK", userId: "u", confirm: `ROLLBACK ${ID}`, rollbackRunId: applied.runId! }, deps({ transport: t.transport }));
    expect(own).toMatchObject({ ok: true, status: "ROLLED_BACK" });
    expect(db.rows[0]).toMatchObject({ encrypted_api_key: null, api_key_fingerprint: null });
  });
});

describe("INSPECT tras un APPLY previo que perdió la conexión (caso REC TEST)", () => {
  const STALE = "EXECUTOR_UNREACHABLE: No se pudo contactar al ejecutor del VPS.";
  const failedRow = async () => {
    await upsertSignerProvisioningSpec("org-a", "TEST", SPEC_IN, "u", deps());
    Object.assign(db.rows[0], { status: "FAILED", last_error: STALE, api_key_fingerprint: fp("k") });
  };

  it("INSPECT exitoso reemplaza el last_error de transporte obsoleto y conserva el status", async () => {
    await failedRow();
    const { transport, call } = fakeTransport({ existingKeyFp: fp("k") });
    const r = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "INSPECT", userId: "u" }, deps({ transport }));
    expect(r).toMatchObject({ ok: true, status: "FAILED" });
    expect(call.mock.calls.map((c) => c[0])).toEqual(["inspect"]);
    expect(db.rows[0].status).toBe("FAILED");
    expect(String(db.rows[0].last_error)).not.toMatch(/EXECUTOR_UNREACHABLE/);
    expect(String(db.rows[0].last_error)).toMatch(/^INSPECT .*ejecutor accesible/);
    expect(db.runs.at(-1)).toMatchObject({ mode: "INSPECT", status: "SUCCESS" });
  });

  it("INSPECT exitoso NO borra errores que no son de transporte (p. ej. API_KEY_DRIFT)", async () => {
    await failedRow();
    db.rows[0].last_error = "API_KEY_DRIFT: la API Key del VPS no coincide con la registrada en Zolvi.";
    const { transport } = fakeTransport({ existingKeyFp: fp("k") });
    await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "INSPECT", userId: "u" }, deps({ transport }));
    expect(db.rows[0].last_error).toMatch(/^API_KEY_DRIFT/);
  });

  it("INSPECT fallido: no toca la fila y la bitácora registra el código del fallo nuevo", async () => {
    await failedRow();
    const transport: SignerExecutorTransport = {
      configured: true,
      call: vi.fn(async () => ({ ok: false, code: "EXECUTOR_UNREACHABLE", message: "No se pudo contactar al ejecutor del VPS." })),
    };
    const r = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "INSPECT", userId: "u" }, deps({ transport }));
    expect(r).toMatchObject({ ok: false, code: "EXECUTOR_UNREACHABLE" });
    expect(db.rows[0]).toMatchObject({ status: "FAILED", last_error: STALE });
    expect(db.runs.at(-1)).toMatchObject({ mode: "INSPECT", status: "FAILED", error_message: "EXECUTOR_UNREACHABLE: No se pudo contactar al ejecutor del VPS." });
  });

  it("respuesta HTTP no exitosa del ejecutor (401 BAD_SIGNATURE) no se confunde con UNREACHABLE", async () => {
    await failedRow();
    const transport: SignerExecutorTransport = { configured: true, call: vi.fn(async () => ({ ok: false, code: "BAD_SIGNATURE" })) };
    const r = await runSignerProvisioning({ organizationId: "org-a", environment: "TEST", mode: "INSPECT", userId: "u" }, deps({ transport }));
    expect(r.code).toBe("BAD_SIGNATURE");
    expect(db.runs.at(-1)?.error_message).toMatch(/^BAD_SIGNATURE: /);
  });
});
