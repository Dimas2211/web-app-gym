import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  auditSupabasePublicApiSecurity,
  evaluateSupabasePublicApiSnapshot,
  type SupabaseApiRoleSnapshot,
  type SupabaseDefaultAclSnapshot,
  type SupabasePublicApiSnapshot,
} from "./supabase-public-api-audit";
import { buildPublicApiSecurityChecks } from "./database-preflight";

// Snapshots modelados sobre el estado real auditado (read-only, 2026-10-06).

function apiRole(role: string, overrides: Partial<SupabaseApiRoleSnapshot> = {}): SupabaseApiRoleSnapshot {
  return {
    role,
    schemaUsage:             false,
    schemaCreate:            false,
    tablesWithPrivileges:    0,
    directTableGrants:       0,
    sequencesWithPrivileges: 0,
    directSequenceGrants:    0,
    executableFunctions:     0,
    directFunctionGrants:    0,
    ...overrides,
  };
}

function defaultAcl(
  owner: string,
  objectType: SupabaseDefaultAclSnapshot["objectType"],
  manageable: boolean,
): SupabaseDefaultAclSnapshot {
  return {
    owner,
    scope: "PUBLIC_SCHEMA",
    objectType,
    grantees: ["anon", "authenticated"],
    manageableByCurrentUser: manageable,
  };
}

const SUPABASE_ROLES = { anon: true, authenticated: true, service_role: true, supabase_admin: true };

const supabaseAdminDefaults = (["r", "S", "f"] as const).map((t) => defaultAcl("supabase_admin", t, false));

/** trustme-runtime antes del hardening (82 tablas expuestas, default ACLs postgres + supabase_admin). */
const trustmeBefore: SupabasePublicApiSnapshot = {
  currentUser:              "postgres",
  isSuperuser:              false,
  roles:                    SUPABASE_ROLES,
  schemaExists:             true,
  schemaOwner:              "pg_database_owner",
  publicPseudoRoleHasUsage: true,
  apiRoles: [
    apiRole("anon",          { schemaUsage: true, tablesWithPrivileges: 82, directTableGrants: 82 * 7 }),
    apiRole("authenticated", { schemaUsage: true, tablesWithPrivileges: 82, directTableGrants: 82 * 7 }),
  ],
  tables:      { total: 82, rlsEnabled: 0 },
  defaultAcls: [
    ...(["r", "S", "f"] as const).map((t) => defaultAcl("postgres", t, true)),
    ...supabaseAdminDefaults,
  ],
};

/** trustme-runtime después del hardening esperado. */
const trustmeAfter: SupabasePublicApiSnapshot = {
  ...trustmeBefore,
  publicPseudoRoleHasUsage: false,
  apiRoles:    [apiRole("anon"), apiRole("authenticated")],
  defaultAcls: supabaseAdminDefaults,
};

/** Control Plane: roles Supabase existen pero sin USAGE ni default ACLs. */
const controlPlane: SupabasePublicApiSnapshot = {
  ...trustmeAfter,
  schemaOwner: "postgres",
  defaultAcls: [],
};

/** PostgreSQL local estándar: sin roles Supabase. */
const localPostgres: SupabasePublicApiSnapshot = {
  currentUser:              "SoporteGym",
  isSuperuser:              true,
  roles:                    { anon: false, authenticated: false, service_role: false, supabase_admin: false },
  schemaExists:             true,
  schemaOwner:              "pg_database_owner",
  publicPseudoRoleHasUsage: true,
  apiRoles:                 [],
  tables:                   { total: 82, rlsEnabled: 0 },
  defaultAcls:              [],
};

describe("evaluateSupabasePublicApiSnapshot", () => {
  it("trustme antes del hardening → FAIL con exposición y default privileges CRITICAL", () => {
    const result = evaluateSupabasePublicApiSnapshot(trustmeBefore);
    expect(result.status).toBe("FAIL");
    expect(result.summary.tablesAccessibleByAnon).toBe(82);
    expect(result.summary.tablesAccessibleByAuthenticated).toBe(82);
    expect(result.summary.dangerousDefaultAcls).toBe(3);
    expect(result.summary.unmanagedDefaultAcls).toBe(3);
    const critical = result.findings.filter((f) => f.severity === "CRITICAL").map((f) => f.code);
    expect(critical).toContain("PUBLIC_DATA_API_EXPOSURE");
    expect(critical).toContain("PUBLIC_SCHEMA_API_USAGE");
    expect(critical).toContain("UNSAFE_DEFAULT_PRIVILEGES");
    // Con el schema abierto, las default ACLs de supabase_admin son WARNING.
    expect(result.findings.find((f) => f.code === "UNMANAGED_DEFAULT_PRIVILEGES")?.severity).toBe("WARNING");
  });

  it("trustme después del hardening → PASS; supabase_admin queda como INFO neutralizado", () => {
    const result = evaluateSupabasePublicApiSnapshot(trustmeAfter);
    expect(result.status).toBe("PASS");
    expect(result.summary.anonSchemaUsage).toBe(false);
    expect(result.summary.authenticatedSchemaUsage).toBe(false);
    expect(result.findings.filter((f) => f.severity !== "INFO")).toEqual([]);
    expect(result.findings.find((f) => f.code === "UNMANAGED_DEFAULT_PRIVILEGES")?.severity).toBe("INFO");
  });

  it("Control Plane de referencia → PASS", () => {
    expect(evaluateSupabasePublicApiSnapshot(controlPlane).status).toBe("PASS");
  });

  it("PostgreSQL local sin roles Supabase → NOT_APPLICABLE aunque PUBLIC tenga USAGE", () => {
    const result = evaluateSupabasePublicApiSnapshot(localPostgres);
    expect(result.status).toBe("NOT_APPLICABLE");
    expect(result.findings.every((f) => f.severity === "INFO")).toBe(true);
  });

  it("schema abierto sin tablas expuestas sigue siendo FAIL (una tabla futura quedaría expuesta)", () => {
    const result = evaluateSupabasePublicApiSnapshot({
      ...controlPlane,
      apiRoles: [apiRole("anon", { schemaUsage: true }), apiRole("authenticated")],
    });
    expect(result.status).toBe("FAIL");
    expect(result.findings.map((f) => f.code)).toContain("PUBLIC_SCHEMA_API_USAGE");
    expect(result.findings.map((f) => f.code)).not.toContain("PUBLIC_DATA_API_EXPOSURE");
  });

  it("solo funciones ejecutables con schema abierto (EXECUTE vía PUBLIC) cuenta como exposición", () => {
    const result = evaluateSupabasePublicApiSnapshot({
      ...controlPlane,
      apiRoles: [apiRole("anon", { schemaUsage: true, executableFunctions: 2 }), apiRole("authenticated")],
    });
    expect(result.findings.map((f) => f.code)).toContain("PUBLIC_DATA_API_EXPOSURE");
  });

  it("grants residuales con schema cerrado → WARNING, no FAIL", () => {
    const result = evaluateSupabasePublicApiSnapshot({
      ...controlPlane,
      apiRoles: [apiRole("anon", { tablesWithPrivileges: 1, directTableGrants: 1 }), apiRole("authenticated")],
    });
    expect(result.status).toBe("PASS");
    expect(result.summary.tablesAccessibleByAnon).toBe(0);
    expect(result.findings.find((f) => f.code === "RESIDUAL_API_OBJECT_GRANTS")?.severity).toBe("WARNING");
  });

  it("default ACL del migrador con schema cerrado → WARNING (defensa en profundidad)", () => {
    const result = evaluateSupabasePublicApiSnapshot({
      ...controlPlane,
      defaultAcls: [defaultAcl("postgres", "r", true)],
    });
    expect(result.status).toBe("PASS");
    expect(result.findings.find((f) => f.code === "UNSAFE_DEFAULT_PRIVILEGES")?.severity).toBe("WARNING");
  });
});

describe("auditSupabasePublicApiSecurity", () => {
  it("ejecuta una sola consulta de catálogos y evalúa el snapshot", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([
      { snapshot: JSON.stringify({ ...trustmeAfter, defaultAcls: [{ ...supabaseAdminDefaults[0], grantees: null }] }) },
    ]);
    const result = await auditSupabasePublicApiSecurity({ $queryRawUnsafe: queryRawUnsafe } as never);
    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    // Una única sentencia de lectura: CTE + SELECT, sin ';' ni DDL/DCL.
    const sql = String(queryRawUnsafe.mock.calls[0][0]);
    expect(sql.trim()).toMatch(/^WITH\b/);
    expect(sql).not.toContain(";");
    // ('CREATE'/'UPDATE' sí aparecen como literales de privilegio en has_*_privilege.)
    expect(sql).not.toMatch(/\b(GRANT|REVOKE|ALTER|DROP|INSERT INTO|DELETE FROM|CREATE (TABLE|ROLE|FUNCTION))\b/);
    expect(result.status).toBe("PASS");
    expect(result.snapshot.defaultAcls[0].grantees).toEqual([]);
  });
});

describe("buildPublicApiSecurityChecks (Preflight)", () => {
  it("trustme antes → ambos checks FAIL BLOCKER", () => {
    const checks = buildPublicApiSecurityChecks(evaluateSupabasePublicApiSnapshot(trustmeBefore));
    expect(checks.map((c) => [c.code, c.status, c.severity])).toEqual([
      ["PUBLIC_DATA_API_EXPOSURE", "FAIL", "BLOCKER"],
      ["UNSAFE_DEFAULT_PRIVILEGES", "FAIL", "BLOCKER"],
    ]);
  });

  it("trustme después / Control Plane → ambos PASS", () => {
    for (const snapshot of [trustmeAfter, controlPlane]) {
      const checks = buildPublicApiSecurityChecks(evaluateSupabasePublicApiSnapshot(snapshot));
      expect(checks.map((c) => c.status)).toEqual(["PASS", "PASS"]);
    }
  });

  it("local sin roles Supabase → PASS con mensaje 'No aplica'", () => {
    const checks = buildPublicApiSecurityChecks(evaluateSupabasePublicApiSnapshot(localPostgres));
    expect(checks.map((c) => c.status)).toEqual(["PASS", "PASS"]);
    expect(checks[0].message).toMatch(/No aplica/);
  });
});
