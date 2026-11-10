// FISCAL-ONBOARDING — estado del onboarding: READY_TEST nunca se
// confunde con READY_PROD; MariaDB NOT_CONFIGURED no bloquea; el caso
// MetaTraining (TEST operativo, PROD sin emisor/BD dedicada/MH) queda
// bloqueado en PRODUCTION.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({ controlPlanePrisma: {} }));

import { getFiscalOnboardingStatus, type OnboardingStatusDeps, type RuntimeFiscalFacts } from "./fiscal-onboarding-status.service";
import type { SignerProvisioningSummary } from "./signer-provisioning.service";
import type { DteMariaDbIntegrationSummary } from "./dte-mariadb-integration.service";

const NO_SIGNER = (env: "TEST" | "PRODUCTION"): SignerProvisioningSummary => ({
  exists: false, id: null, environment: env, slug: null, hostname: null, port: null, container_name: null, cpanel_user: null,
  signer_nit: null, issuer_config_id: null, status: "NOT_CONFIGURED", template_version: null, api_key_fingerprint: null,
  credential_registered_at: null, mh_authorization_confirmed_at: null, mh_authorization_reference: null, last_error: null,
  resource_id: null, signer_url: null, executor_configured: false, recent_runs: [],
});

const NO_MARIADB: DteMariaDbIntegrationSummary = {
  configured: false, integration_id: null, label: null, is_active: false, auto_delivery_enabled: false, host: null, port: null,
  database: null, table: null, invalidation_table: null, user: null, has_password: false, payload_readable: false,
  last_tested_at: null, last_test_status: "UNTESTED", last_test_message: null,
} as DteMariaDbIntegrationSummary;

const OWN_CRED = {
  configured: true, is_active: true, has_api_user: true, has_api_password: true, has_signer_url: true, has_signer_nit: true,
  updated_at: new Date(), has_signer_api_key: true, has_signer_private_key_password: true, signer_api_key_fingerprint: "abc",
  secret_collisions: [], signer_host: "firmador-metatraining-test.getzolvi.com",
};

const TEST_FACTS: RuntimeFiscalFacts = {
  ok: true,
  issuer: { id: "iss-test", location_id: "loc", nit: "06140000000000", name: "MetaTraining", is_active: true, missing_fiscal: [] },
  credential: OWN_CRED, effectiveSignerSource: "ISSUER_CREDENTIAL", acceptedCount: 3, preflight: null,
};

function deps(over: Partial<OnboardingStatusDeps> & { facts?: Partial<Record<"TEST" | "PRODUCTION", RuntimeFiscalFacts>>; dedicated?: boolean } = {}): OnboardingStatusDeps {
  return {
    getOrganization: async () => ({ tenant_id: "tenant-mt", has_dedicated_profile: over.dedicated ?? false, shared_runtime_target_id: null }),
    getSigner: async (_o, env) => NO_SIGNER(env),
    getMariaDb: async () => NO_MARIADB,
    countJobs: async () => ({ pending: 0, uncertain: 0, failed: 0 }),
    readRuntimeFacts: async ({ environment }) => over.facts?.[environment] ?? { ok: true, issuer: null, credential: null, effectiveSignerSource: null, acceptedCount: 0, preflight: null },
    ...over,
  };
}

describe("getFiscalOnboardingStatus", () => {
  it("MetaTraining TEST: firmador propio + DTE aceptados + MariaDB NOT_CONFIGURED -> READY_TEST (no READY_PROD)", async () => {
    const s = await getFiscalOnboardingStatus("org-mt", "TEST", {}, deps({ facts: { TEST: TEST_FACTS } }));
    expect(s.state).toBe("READY_TEST");
    expect(s.readyTest).toBe(true);
    expect(s.readyProd).toBe(false);
    expect(s.steps.find((x) => x.code === "MARIADB")?.status).toBe("optional");
    expect(s.steps.find((x) => x.code === "DEDICATED_DB")?.status).toBe("warning");
    expect(s.blockers).toEqual([]);
  });

  it("MetaTraining PRODUCTION hoy: sin emisor PROD, sin BD dedicada, sin atestación MH -> bloqueado, no activable", async () => {
    const s = await getFiscalOnboardingStatus("org-mt", "PRODUCTION", { probe: true }, deps({ facts: { TEST: TEST_FACTS } }));
    expect(s.readyProd).toBe(false);
    expect(s.canActivate).toBe(false);
    expect(s.state).not.toBe("READY_PROD");
    const blocked = s.steps.filter((x) => x.status === "blocked").map((x) => x.code);
    expect(blocked).toEqual(expect.arrayContaining(["DEDICATED_DB", "ISSUER_CONFIG", "MH_CREDENTIALS", "MH_PROD_AUTHORIZATION"]));
  });

  it("firmador efectivo GLOBAL_ENV (de otro cliente) nunca cuenta como firmador propio", async () => {
    const s = await getFiscalOnboardingStatus("org-x", "TEST", {}, deps({
      facts: { TEST: { ...TEST_FACTS, effectiveSignerSource: "GLOBAL_ENV", credential: { ...OWN_CRED, has_signer_url: false, has_signer_api_key: false } } },
    }));
    expect(s.steps.find((x) => x.code === "SIGNER_CREDENTIAL")?.status).toBe("blocked");
    expect(s.readyTest).toBe(false);
  });

  it("secretos confundidos (signerApiKey = apiPassword) bloquean", async () => {
    const s = await getFiscalOnboardingStatus("org-x", "TEST", {}, deps({
      facts: { TEST: { ...TEST_FACTS, credential: { ...OWN_CRED, secret_collisions: [{ a: "signerApiKey", b: "apiPassword", blocking: true }] } } },
    }));
    expect(s.steps.find((x) => x.code === "SIGNER_CREDENTIAL")?.detail).toContain("secretos confundidos");
    expect(s.readyTest).toBe(false);
  });

  it("PRODUCTION completo (BD dedicada, preflight OK, atestación MH) -> READY_PROD; preflight BLOCKED lo impide", async () => {
    const prodFacts: RuntimeFiscalFacts = {
      ...TEST_FACTS, issuer: { ...TEST_FACTS.issuer!, id: "iss-prod" },
      credential: { ...OWN_CRED, signer_host: "firmador-cliente-prod.getzolvi.com" },
      preflight: { status: "READY", checks: [{ code: "SIGNER_REACHABLE", label: "Firmador", status: "ok" }], issuer_config_id: "iss-prod" } as never,
    };
    const signer = async (): Promise<SignerProvisioningSummary> => ({
      ...NO_SIGNER("PRODUCTION"), exists: true, hostname: "firmador-cliente-prod.getzolvi.com", status: "SIGNER_READY",
      mh_authorization_confirmed_at: new Date(), mh_authorization_reference: "MH-REF-1",
    });
    const ok = await getFiscalOnboardingStatus("org-c", "PRODUCTION", { probe: true }, deps({ dedicated: true, getSigner: signer, facts: { PRODUCTION: prodFacts } }));
    expect(ok).toMatchObject({ state: "READY_PROD", readyProd: true, readyTest: false, canActivate: true });

    const pfBlocked = await getFiscalOnboardingStatus("org-c", "PRODUCTION", { probe: true }, deps({
      dedicated: true, getSigner: signer,
      facts: { PRODUCTION: { ...prodFacts, preflight: { status: "BLOCKED", checks: [{ code: "SIGNER_NIT_MATCH", label: "NIT", status: "blocked" }], issuer_config_id: "iss-prod" } as never } },
    }));
    expect(pfBlocked.readyProd).toBe(false);
    expect(pfBlocked.canActivate).toBe(false);

    // Health check del firmador fallido (preflight WARNING) no basta para READY_PROD.
    const unreachable = await getFiscalOnboardingStatus("org-c", "PRODUCTION", { probe: true }, deps({
      dedicated: true, getSigner: signer,
      facts: { PRODUCTION: { ...prodFacts, preflight: { status: "WARNING", checks: [{ code: "SIGNER_REACHABLE", label: "Firmador", status: "warning", detail: "timeout" }], issuer_config_id: "iss-prod" } as never } },
    }));
    expect(unreachable.readyProd).toBe(false);
    expect(unreachable.steps.find((x) => x.code === "PROD_PREFLIGHT")?.status).toBe("blocked");

    // Firmador administrado solo con APPLY (INFRA_READY, sin VERIFY) no es READY_PROD.
    const notVerified = await getFiscalOnboardingStatus("org-c", "PRODUCTION", { probe: true }, deps({
      dedicated: true, facts: { PRODUCTION: prodFacts },
      getSigner: async () => ({ ...(await signer()), status: "INFRA_READY" }),
    }));
    expect(notVerified.readyProd).toBe(false);
    expect(notVerified.steps.find((x) => x.code === "SIGNER_CREDENTIAL")?.detail).toContain("VERIFY");
  });

  it("firmador administrado: solo cuentan DTE TEST aceptados desde el registro de su credencial", async () => {
    const registeredAt = new Date("2026-11-10T00:00:00Z");
    const seen: Array<Date | null | undefined> = [];
    const s = await getFiscalOnboardingStatus("org-mt", "TEST", {}, deps({
      getSigner: async (_o, env) => ({ ...NO_SIGNER(env), exists: true, hostname: OWN_CRED.signer_host, status: "SIGNER_READY", credential_registered_at: registeredAt }),
      readRuntimeFacts: async ({ acceptedSince }) => { seen.push(acceptedSince); return { ...TEST_FACTS, acceptedCount: 0, acceptedSince }; },
    }));
    expect(seen).toEqual([registeredAt]);
    expect(s.steps.find((x) => x.code === "MH_TEST_ACCEPTED")?.status).toBe("pending");
    expect(s.readyTest).toBe(false);
  });

  it("MariaDB habilitada con prueba fallida bloquea; entregas inciertas solo advierten", async () => {
    const failing = await getFiscalOnboardingStatus("org-mt", "TEST", {}, deps({
      facts: { TEST: TEST_FACTS }, getMariaDb: async () => ({ ...NO_MARIADB, configured: true, is_active: true, last_test_status: "FAILED" }),
    }));
    expect(failing.steps.find((x) => x.code === "MARIADB")?.status).toBe("blocked");
    const uncertain = await getFiscalOnboardingStatus("org-mt", "TEST", {}, deps({
      facts: { TEST: TEST_FACTS }, getMariaDb: async () => ({ ...NO_MARIADB, configured: true, is_active: true, last_test_status: "SUCCESS" }),
      countJobs: async () => ({ pending: 0, uncertain: 1, failed: 0 }),
    }));
    expect(uncertain.steps.find((x) => x.code === "MARIADB")?.status).toBe("warning");
    expect(uncertain.readyTest).toBe(true);
  });
});
