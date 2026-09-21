// ─────────────────────────────────────────────────────────────────
// commerce/dte — resolve-external-dte-destination.test.ts
//
// FASE VI-E7 — certifica el resolver de destino MariaDB externo por
// ORGANIZACIÓN (Control Plane, PlatformExternalIntegration). Cubre:
//   - Round-trip real de cifrado (encryptJsonPayload/decryptJsonPayload,
//     AES-256-GCM, sin mockear @/lib/security/encryption) — nunca texto
//     plano en el "encrypted_payload" simulado.
//   - Organización con integración activa -> CONFIGURED (payload
//     descifrado correctamente).
//   - Organización con integración inactiva -> DISABLED (fail closed).
//   - Organización resuelta SIN integración -> NOT_CONFIGURED, incluso
//     con allowLegacyEnvFallback:true (el fallback legado es exclusivo
//     del caso "sin PlatformOrganization en absoluto").
//   - organizationId null + allowLegacyEnvFallback:true + env completo ->
//     CONFIGURED vía legado (source: PLATFORM_NATIVE_LEGACY_ENV).
//   - organizationId null + allowLegacyEnvFallback:false (RUNTIME_CLIENT)
//     -> NOT_CONFIGURED, JAMÁS cae al env aunque esté completo.
//   - Aislamiento cruzado: Organización A y B tienen integraciones
//     DISTINTAS — resolver(A) nunca retorna el host/database de B y
//     viceversa (prueba de aislamiento de DESTINO).
// No hace llamadas reales a MariaDB/red — todo el acceso a Prisma está
// mockeado; solo el cifrado es real (Node `crypto` puro, sin I/O).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomBytes } from "crypto";

// Key de test — 32 bytes en base64, generada localmente, nunca un secreto real.
process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const { findUniqueMock } = vi.hoisted(() => ({ findUniqueMock: vi.fn() }));

vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({
  controlPlanePrisma: {
    platformExternalIntegration: { findUnique: findUniqueMock },
  },
}));

import { encryptJsonPayload } from "@/lib/security/encryption";
import {
  resolveExternalDteMariaDbDestination,
  type ExternalDteMariaDbIntegrationPayload,
} from "./resolve-external-dte-destination";

const ORG_A_PAYLOAD: ExternalDteMariaDbIntegrationPayload = {
  host: "mariadb-org-a.internal", port: 3306, user: "org_a_user", password: "org-a-secret",
  database: "org_a_db", table: "dte_fe", invalidationTable: "dte_inv", timeoutMs: 10_000,
};

const ORG_B_PAYLOAD: ExternalDteMariaDbIntegrationPayload = {
  host: "mariadb-org-b.internal", port: 3306, user: "org_b_user", password: "org-b-secret",
  database: "org_b_db", table: "dte_fe_b", invalidationTable: "dte_inv_b", timeoutMs: 10_000,
};

function activeRow(payload: ExternalDteMariaDbIntegrationPayload) {
  return { is_active: true, encrypted_payload: encryptJsonPayload(payload) };
}

beforeEach(() => {
  findUniqueMock.mockReset();
  delete process.env["EXTERNAL_DTE_MARIADB_HOST"];
  delete process.env["EXTERNAL_DTE_MARIADB_USER"];
  delete process.env["EXTERNAL_DTE_MARIADB_PASSWORD"];
  delete process.env["EXTERNAL_DTE_MARIADB_DATABASE"];
  delete process.env["EXTERNAL_DTE_MARIADB_TABLE"];
  delete process.env["EXTERNAL_DTE_MARIADB_ENABLED"];
});

describe("resolveExternalDteMariaDbDestination — FASE VI-E7", () => {
  it("round-trip de cifrado real — el payload descifrado es exactamente el original, nunca texto plano expuesto", async () => {
    const row = activeRow(ORG_A_PAYLOAD);
    // El "encrypted_payload" NUNCA debe contener el host/user/password en claro.
    expect(row.encrypted_payload).not.toContain("mariadb-org-a.internal");
    expect(row.encrypted_payload).not.toContain("org-a-secret");

    findUniqueMock.mockResolvedValue(row);

    const result = await resolveExternalDteMariaDbDestination({ organizationId: "org-a", allowLegacyEnvFallback: false });

    expect(result).toMatchObject({ status: "CONFIGURED", source: "ORGANIZATION" });
    if (result.status === "CONFIGURED") {
      expect(result.config).toMatchObject({ ...ORG_A_PAYLOAD, enabled: true });
    }
  });

  it("integración inactiva -> DISABLED (fail closed, nunca entrega)", async () => {
    findUniqueMock.mockResolvedValue({ is_active: false, encrypted_payload: encryptJsonPayload(ORG_A_PAYLOAD) });

    const result = await resolveExternalDteMariaDbDestination({ organizationId: "org-a", allowLegacyEnvFallback: false });

    expect(result).toEqual({ status: "DISABLED" });
  });

  it("organización resuelta sin integración -> NOT_CONFIGURED, incluso con allowLegacyEnvFallback:true", async () => {
    findUniqueMock.mockResolvedValue(null);
    process.env["EXTERNAL_DTE_MARIADB_ENABLED"]  = "true";
    process.env["EXTERNAL_DTE_MARIADB_HOST"]     = "legacy-host";
    process.env["EXTERNAL_DTE_MARIADB_USER"]     = "legacy-user";
    process.env["EXTERNAL_DTE_MARIADB_PASSWORD"] = "legacy-pass";
    process.env["EXTERNAL_DTE_MARIADB_DATABASE"] = "legacy-db";
    process.env["EXTERNAL_DTE_MARIADB_TABLE"]    = "legacy-table";

    const result = await resolveExternalDteMariaDbDestination({ organizationId: "org-a", allowLegacyEnvFallback: true });

    expect(result).toEqual({ status: "NOT_CONFIGURED" });
  });

  it("organizationId null + allowLegacyEnvFallback:true + env completo -> CONFIGURED vía legado (standalone/self-hosted)", async () => {
    process.env["EXTERNAL_DTE_MARIADB_ENABLED"]  = "true";
    process.env["EXTERNAL_DTE_MARIADB_HOST"]     = "legacy-host";
    process.env["EXTERNAL_DTE_MARIADB_USER"]     = "legacy-user";
    process.env["EXTERNAL_DTE_MARIADB_PASSWORD"] = "legacy-pass";
    process.env["EXTERNAL_DTE_MARIADB_DATABASE"] = "legacy-db";
    process.env["EXTERNAL_DTE_MARIADB_TABLE"]    = "legacy-table";

    const result = await resolveExternalDteMariaDbDestination({ organizationId: null, allowLegacyEnvFallback: true });

    expect(result).toMatchObject({ status: "CONFIGURED", source: "PLATFORM_NATIVE_LEGACY_ENV" });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("organizationId null + allowLegacyEnvFallback:false (RUNTIME_CLIENT) -> NOT_CONFIGURED aunque el env esté completo", async () => {
    process.env["EXTERNAL_DTE_MARIADB_ENABLED"]  = "true";
    process.env["EXTERNAL_DTE_MARIADB_HOST"]     = "legacy-host";
    process.env["EXTERNAL_DTE_MARIADB_USER"]     = "legacy-user";
    process.env["EXTERNAL_DTE_MARIADB_PASSWORD"] = "legacy-pass";
    process.env["EXTERNAL_DTE_MARIADB_DATABASE"] = "legacy-db";
    process.env["EXTERNAL_DTE_MARIADB_TABLE"]    = "legacy-table";

    const result = await resolveExternalDteMariaDbDestination({ organizationId: null, allowLegacyEnvFallback: false });

    expect(result).toEqual({ status: "NOT_CONFIGURED" });
  });

  it("AISLAMIENTO DE DESTINO — Organización A y B tienen integraciones distintas: resolver(A) nunca retorna el destino de B", async () => {
    findUniqueMock.mockImplementation(async ({ where }: { where: { organization_id_type: { organization_id: string; type: string } } }) => {
      const orgId = where.organization_id_type.organization_id;
      if (orgId === "org-a") return activeRow(ORG_A_PAYLOAD);
      if (orgId === "org-b") return activeRow(ORG_B_PAYLOAD);
      return null;
    });

    const resultA = await resolveExternalDteMariaDbDestination({ organizationId: "org-a", allowLegacyEnvFallback: false });
    const resultB = await resolveExternalDteMariaDbDestination({ organizationId: "org-b", allowLegacyEnvFallback: false });

    expect(resultA.status).toBe("CONFIGURED");
    expect(resultB.status).toBe("CONFIGURED");
    if (resultA.status === "CONFIGURED" && resultB.status === "CONFIGURED") {
      expect(resultA.config.host).toBe("mariadb-org-a.internal");
      expect(resultB.config.host).toBe("mariadb-org-b.internal");
      expect(resultA.config.host).not.toBe(resultB.config.host);
      expect(resultA.config.database).not.toBe(resultB.config.database);
      // Nunca debe existir cruce: el resultado de A no contiene ningún valor de B.
      expect(JSON.stringify(resultA.config)).not.toContain("org-b");
      expect(JSON.stringify(resultB.config)).not.toContain("org-a");
    }
  });
});
