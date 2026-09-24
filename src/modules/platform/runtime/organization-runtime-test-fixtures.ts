// ─────────────────────────────────────────────────────────────────
// platform/runtime — organization-runtime-test-fixtures.ts
//
// SHARED-OPS-PARITY-1 — SOLO TESTS. Control Plane sintético para probar
// resoluciones organization-scoped con el Runtime Router REAL:
//   - 1 Shared Runtime Target PRODUCTION con 2 organizaciones (A, B);
//   - 1 organización Dedicated con su perfil;
//   - 1 organización sin tenant.
// Uso: vi.mock("@/lib/db/prisma", () => ({ prisma: buildFakeControlPlane() })).
// ─────────────────────────────────────────────────────────────────

export const SHARED_TARGET_ID = "target-shared-01";
export const ORG_A = { id: "org-a", code: "commerce-pilot-0001", name: "Zolvi Commerce Pilot", tenant_id: "TENANT_A", shared_runtime_target_id: SHARED_TARGET_ID };
export const ORG_B = { id: "org-b", code: "other-shared-0002", name: "Otra Shared", tenant_id: "TENANT_B", shared_runtime_target_id: SHARED_TARGET_ID };
export const ORG_D = { id: "org-d", code: "trustme", name: "TrustMe", tenant_id: "TENANT_D", shared_runtime_target_id: null };
export const ORG_NO_TENANT = { id: "org-n", code: "pending", name: "Pendiente", tenant_id: null, shared_runtime_target_id: SHARED_TARGET_ID };
export const DEDICATED_PROFILE_ID = "profile-dedicated-d";

const TARGET_ROW = {
  id: SHARED_TARGET_ID, label: "Zolvi Shared 01", environment: "PRODUCTION", provider: "SUPABASE",
  db_host: "shared-host", db_port: 5432, db_name: "shared-db", db_user: "shared-user",
  encrypted_password: "enc-shared", ssl_mode: "REQUIRE", is_active: true,
  last_test_status: "SUCCESS", last_tested_at: new Date("2026-09-01T00:00:00Z"), updated_at: new Date(),
};

const DEDICATED_ROW = {
  id: DEDICATED_PROFILE_ID, label: "TRUST ME", environment: "SANDBOX", provider: "POSTGRESQL",
  db_host: "dedicated-host", db_port: 5432, db_name: "trustme-db", db_user: "tm-user",
  encrypted_password: "enc-d", ssl_mode: "REQUIRE", is_active: true, organization_id: ORG_D.id,
  last_test_status: "SUCCESS", last_tested_at: null, updated_at: new Date(),
};

export function buildFakeControlPlane() {
  const orgs = [ORG_A, ORG_B, ORG_D, ORG_NO_TENANT];
  return {
    platformOrganization: {
      findUnique: async ({ where }: { where: { id?: string; tenant_id?: string } }) =>
        orgs.find((o) => (where.id ? o.id === where.id : o.tenant_id === where.tenant_id)) ?? null,
    },
    platformSharedRuntimeTarget: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === TARGET_ROW.id ? { ...TARGET_ROW } : null,
    },
    platformDatabaseProfile: {
      findMany: async ({ where }: { where: { organization_id: string } }) =>
        where.organization_id === DEDICATED_ROW.organization_id ? [{ ...DEDICATED_ROW }] : [],
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === DEDICATED_ROW.id
          ? { ...DEDICATED_ROW, organization: { id: ORG_D.id, name: ORG_D.name, tenant_id: ORG_D.tenant_id } }
          : null,
    },
  };
}
