// ─────────────────────────────────────────────────────────────────
// platform — supabase-public-api-audit.ts
//
// SUPABASE-PUBLIC-API-HARDENING. Auditoría READ-ONLY de la exposición del
// schema `public` a la Supabase Data API (roles `anon`/`authenticated`).
//
// Zolvi no usa la Data API: todo acceso a datos es server-side vía Prisma
// (Runtime Database Router). Cualquier privilegio de anon/authenticated
// sobre `public` es una puerta alternativa que salta la autorización de
// Zolvi. La corrección vive en la migración
// `20261006000000_harden_supabase_public_data_api`; este módulo solo
// verifica (una única SELECT sobre catálogos `pg_*`, nunca escribe).
//
// Usado por: database-preflight.ts (checks PUBLIC_DATA_API_EXPOSURE /
// UNSAFE_DEFAULT_PRIVILEGES) y prisma/scripts/audit-supabase-public-api.ts.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";

/** Cualquier cliente capaz de ejecutar SQL crudo (PrismaClient o tx). */
export type RawQueryClient = Pick<PrismaClient, "$queryRawUnsafe">;

export type SupabaseApiFindingSeverity = "CRITICAL" | "WARNING" | "INFO";
export type SupabasePublicApiAuditStatus = "PASS" | "FAIL" | "NOT_APPLICABLE";

export type SupabaseApiFindingCode =
  | "PUBLIC_DATA_API_EXPOSURE"
  | "PUBLIC_SCHEMA_API_USAGE"
  | "UNSAFE_DEFAULT_PRIVILEGES"
  | "UNMANAGED_DEFAULT_PRIVILEGES"
  | "RESIDUAL_API_OBJECT_GRANTS"
  | "RLS_STATUS";

export interface SupabaseApiFinding {
  code:     SupabaseApiFindingCode;
  severity: SupabaseApiFindingSeverity;
  message:  string;
}

export interface SupabaseApiRoleSnapshot {
  role:                    string;
  schemaUsage:             boolean;
  schemaCreate:            boolean;
  tablesWithPrivileges:    number;
  directTableGrants:       number;
  sequencesWithPrivileges: number;
  directSequenceGrants:    number;
  executableFunctions:     number;
  directFunctionGrants:    number;
}

export interface SupabaseDefaultAclSnapshot {
  owner:                  string;
  scope:                  "PUBLIC_SCHEMA" | "GLOBAL";
  objectType:             "r" | "S" | "f";
  grantees:               string[];
  /**
   * El rol actual (migrador) es `owner` o miembro de él: los objetos que
   * crean las migraciones heredan esta ACL, y el migrador puede corregirla
   * (ALTER DEFAULT PRIVILEGES FOR ROLE owner). Si es false (p.ej.
   * supabase_admin), no la puede tocar y no afecta objetos de Prisma.
   */
  manageableByCurrentUser: boolean;
}

/** Resultado crudo de la consulta a catálogos. */
export interface SupabasePublicApiSnapshot {
  currentUser:              string;
  isSuperuser:              boolean;
  roles:                    { anon: boolean; authenticated: boolean; service_role: boolean; supabase_admin: boolean };
  schemaExists:             boolean;
  schemaOwner:              string | null;
  publicPseudoRoleHasUsage: boolean;
  apiRoles:                 SupabaseApiRoleSnapshot[];
  tables:                   { total: number; rlsEnabled: number };
  defaultAcls:              SupabaseDefaultAclSnapshot[];
}

export interface SupabasePublicApiAuditResult {
  status:   SupabasePublicApiAuditStatus;
  snapshot: SupabasePublicApiSnapshot;
  findings: SupabaseApiFinding[];
  summary: {
    anonRoleExists:                  boolean;
    authenticatedRoleExists:         boolean;
    anonSchemaUsage:                 boolean;
    authenticatedSchemaUsage:        boolean;
    tablesAccessibleByAnon:          number;
    tablesAccessibleByAuthenticated: number;
    dangerousObjectGrants:           number;
    dangerousDefaultAcls:            number;
    unmanagedDefaultAcls:            number;
    rlsEnabledTables:                number;
    totalTables:                     number;
  };
}

// Una sola SELECT sobre catálogos. Las funciones has_*_privilege incluyen
// privilegios heredados vía PUBLIC y membresías, es decir el acceso EFECTIVO.
const SNAPSHOT_SQL = `
WITH api AS (
  SELECT oid, rolname::text AS rolname
    FROM pg_catalog.pg_roles
   WHERE rolname IN ('anon', 'authenticated')
),
ns AS (
  SELECT oid, nspowner, nspacl FROM pg_catalog.pg_namespace WHERE nspname = 'public'
),
rels AS (
  SELECT c.oid, c.relkind, c.relowner, c.relacl, c.relrowsecurity
    FROM pg_catalog.pg_class c JOIN ns ON c.relnamespace = ns.oid
   WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
),
seqs AS (
  SELECT c.oid, c.relacl FROM pg_catalog.pg_class c JOIN ns ON c.relnamespace = ns.oid WHERE c.relkind = 'S'
),
procs AS (
  SELECT p.oid, p.proacl FROM pg_catalog.pg_proc p JOIN ns ON p.pronamespace = ns.oid
)
SELECT json_build_object(
  'currentUser', current_user::text,
  'isSuperuser', COALESCE((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user), false),
  'roles', json_build_object(
    'anon',           EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon'),
    'authenticated',  EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated'),
    'service_role',   EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role'),
    'supabase_admin', EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin')
  ),
  'schemaExists', EXISTS (SELECT 1 FROM ns),
  'schemaOwner', (SELECT pg_catalog.pg_get_userbyid(nspowner)::text FROM ns),
  'publicPseudoRoleHasUsage', COALESCE((
    SELECT bool_or(a.grantee = 0 AND a.privilege_type = 'USAGE')
      FROM ns CROSS JOIN LATERAL aclexplode(ns.nspacl) a
  ), false),
  'apiRoles', COALESCE((
    SELECT json_agg(json_build_object(
      'role',                    api.rolname,
      'schemaUsage',             has_schema_privilege(api.oid, ns.oid, 'USAGE'),
      'schemaCreate',            has_schema_privilege(api.oid, ns.oid, 'CREATE'),
      'tablesWithPrivileges',    (SELECT count(*) FROM rels r WHERE has_table_privilege(api.oid, r.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                                                              OR has_any_column_privilege(api.oid, r.oid, 'SELECT,INSERT,UPDATE,REFERENCES')),
      'directTableGrants',       (SELECT (SELECT count(*) FROM rels r CROSS JOIN LATERAL aclexplode(r.relacl) a WHERE a.grantee = api.oid)
                                       + (SELECT count(*) FROM rels r JOIN pg_catalog.pg_attribute att ON att.attrelid = r.oid
                                                CROSS JOIN LATERAL aclexplode(att.attacl) a WHERE a.grantee = api.oid)),
      'sequencesWithPrivileges', (SELECT count(*) FROM seqs s WHERE has_sequence_privilege(api.oid, s.oid, 'USAGE,SELECT,UPDATE')),
      'directSequenceGrants',    (SELECT count(*) FROM seqs s CROSS JOIN LATERAL aclexplode(s.relacl) a WHERE a.grantee = api.oid),
      'executableFunctions',     (SELECT count(*) FROM procs p WHERE has_function_privilege(api.oid, p.oid, 'EXECUTE')),
      'directFunctionGrants',    (SELECT count(*) FROM procs p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE a.grantee = api.oid)
    ) ORDER BY api.rolname)
      FROM api CROSS JOIN ns
  ), '[]'::json),
  'tables', (
    SELECT json_build_object(
      'total',      count(*) FILTER (WHERE relkind IN ('r', 'p')),
      'rlsEnabled', count(*) FILTER (WHERE relkind IN ('r', 'p') AND relrowsecurity)
    ) FROM rels
  ),
  'defaultAcls', COALESCE((
    SELECT json_agg(json_build_object(
      'owner',                   pg_catalog.pg_get_userbyid(d.defaclrole)::text,
      'scope',                   CASE WHEN d.defaclnamespace = 0 THEN 'GLOBAL' ELSE 'PUBLIC_SCHEMA' END,
      'objectType',              d.defaclobjtype::text,
      'grantees',                (SELECT json_agg(DISTINCT api.rolname) FROM aclexplode(d.defaclacl) a JOIN api ON api.oid = a.grantee),
      'manageableByCurrentUser', pg_catalog.pg_has_role(current_user, d.defaclrole, 'MEMBER')
    ) ORDER BY d.defaclrole, d.defaclnamespace, d.defaclobjtype)
      FROM pg_catalog.pg_default_acl d
     WHERE (d.defaclnamespace = (SELECT oid FROM ns) OR d.defaclnamespace = 0)
       AND d.defaclobjtype IN ('r', 'S', 'f')
       AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a JOIN api ON api.oid = a.grantee)
  ), '[]'::json)
)::text AS snapshot
`;

const OBJECT_TYPE_LABEL: Record<SupabaseDefaultAclSnapshot["objectType"], string> = {
  r: "tablas",
  S: "secuencias",
  f: "funciones",
};

function describeDefaultAcl(acl: SupabaseDefaultAclSnapshot): string {
  const where = acl.scope === "GLOBAL" ? "global" : "schema public";
  return `${acl.owner} → ${OBJECT_TYPE_LABEL[acl.objectType]} (${where}) a ${acl.grantees.join(", ")}`;
}

/** Evaluación pura del snapshot (sin I/O) — testeable sin base de datos. */
export function evaluateSupabasePublicApiSnapshot(
  snapshot: SupabasePublicApiSnapshot,
): SupabasePublicApiAuditResult {
  const findings: SupabaseApiFinding[] = [];
  const byRole = (role: string) => snapshot.apiRoles.find((r) => r.role === role);
  const anon = byRole("anon");
  const authenticated = byRole("authenticated");

  const dangerousObjectGrants = snapshot.apiRoles.reduce(
    (acc, r) => acc + r.directTableGrants + r.directSequenceGrants + r.directFunctionGrants,
    0,
  );
  const dangerousDefaultAcls = snapshot.defaultAcls.filter((d) => d.manageableByCurrentUser);
  const unmanagedDefaultAcls = snapshot.defaultAcls.filter((d) => !d.manageableByCurrentUser);

  const summary: SupabasePublicApiAuditResult["summary"] = {
    anonRoleExists:                  snapshot.roles.anon,
    authenticatedRoleExists:         snapshot.roles.authenticated,
    anonSchemaUsage:                 anon?.schemaUsage ?? false,
    authenticatedSchemaUsage:        authenticated?.schemaUsage ?? false,
    tablesAccessibleByAnon:          anon?.schemaUsage ? anon.tablesWithPrivileges : 0,
    tablesAccessibleByAuthenticated: authenticated?.schemaUsage ? authenticated.tablesWithPrivileges : 0,
    dangerousObjectGrants,
    dangerousDefaultAcls:            dangerousDefaultAcls.length,
    unmanagedDefaultAcls:            unmanagedDefaultAcls.length,
    rlsEnabledTables:                snapshot.tables.rlsEnabled,
    totalTables:                     snapshot.tables.total,
  };

  if (!snapshot.roles.anon && !snapshot.roles.authenticated) {
    return {
      status: "NOT_APPLICABLE",
      snapshot,
      summary,
      findings: [{
        code:     "RLS_STATUS",
        severity: "INFO",
        message:  "No existen roles anon/authenticated: la base no expone una Supabase Data API (PostgreSQL estándar).",
      }],
    };
  }

  const schemaGateOpen = snapshot.apiRoles.some((r) => r.schemaUsage || r.schemaCreate);

  for (const r of snapshot.apiRoles) {
    const reachable = r.schemaUsage
      ? r.tablesWithPrivileges + r.sequencesWithPrivileges + r.executableFunctions
      : 0;
    if (reachable > 0) {
      findings.push({
        code:     "PUBLIC_DATA_API_EXPOSURE",
        severity: "CRITICAL",
        message:  `El rol ${r.role} puede usar el schema public y tiene privilegios sobre ${r.tablesWithPrivileges} tabla(s), ${r.sequencesWithPrivileges} secuencia(s) y ${r.executableFunctions} función(es): accesibles vía Supabase Data API.`,
      });
    }
    if (r.schemaUsage || r.schemaCreate) {
      findings.push({
        code:     "PUBLIC_SCHEMA_API_USAGE",
        severity: "CRITICAL",
        message:  `El rol ${r.role} tiene ${[r.schemaUsage && "USAGE", r.schemaCreate && "CREATE"].filter(Boolean).join("/")} sobre el schema public${snapshot.publicPseudoRoleHasUsage ? " (PUBLIC también concede USAGE)" : ""}.`,
      });
    }
  }

  for (const acl of dangerousDefaultAcls) {
    findings.push({
      code:     "UNSAFE_DEFAULT_PRIVILEGES",
      severity: schemaGateOpen ? "CRITICAL" : "WARNING",
      message:  `Default privileges ${describeDefaultAcl(acl)}: objetos futuros creados por migraciones heredarían esos privilegios.`,
    });
  }

  for (const acl of unmanagedDefaultAcls) {
    findings.push({
      code:     "UNMANAGED_DEFAULT_PRIVILEGES",
      severity: schemaGateOpen ? "WARNING" : "INFO",
      message:  `Default privileges ${describeDefaultAcl(acl)} no administrables por ${snapshot.currentUser}${schemaGateOpen ? "" : "; neutralizados porque anon/authenticated no pueden usar el schema public"}.`,
    });
  }

  if (!schemaGateOpen && dangerousObjectGrants > 0) {
    findings.push({
      code:     "RESIDUAL_API_OBJECT_GRANTS",
      severity: "WARNING",
      message:  `Quedan ${dangerousObjectGrants} grant(s) directos a anon/authenticated sobre objetos de public (no alcanzables: el schema está cerrado).`,
    });
  }

  findings.push({
    code:     "RLS_STATUS",
    severity: "INFO",
    message:  `RLS habilitado en ${snapshot.tables.rlsEnabled}/${snapshot.tables.total} tablas de public (informativo: RLS no es la capa de autorización de Zolvi).`,
  });

  const status: SupabasePublicApiAuditStatus = findings.some((f) => f.severity === "CRITICAL") ? "FAIL" : "PASS";
  return { status, snapshot, summary, findings };
}

// Genera (NO ejecuta) los GRANT que reconstruyen exactamente el ACL actual
// de anon/authenticated/PUBLIC sobre `public`: schema y — solo para objetos
// y default ACLs que el migrador administra (los mismos que la migración
// revoca) — tablas, secuencias, funciones y default ACLs. Se ejecuta ANTES
// del hardening y su salida se guarda como artefacto de rollback.
const ACL_RESTORE_SQL = `
WITH api AS (
  SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated')
),
ns AS (SELECT oid, nspacl FROM pg_catalog.pg_namespace WHERE nspname = 'public'),
stmts AS (
  SELECT 1 AS ord, format('GRANT %s ON SCHEMA public TO %s%s;',
           a.privilege_type,
           CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_catalog.pg_get_userbyid(a.grantee)) END,
           CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END) AS stmt
    FROM ns CROSS JOIN LATERAL aclexplode(ns.nspacl) a
   WHERE a.grantee = 0 OR a.grantee IN (SELECT oid FROM api)
  UNION ALL
  SELECT 2, format('GRANT %s ON %s public.%I TO %I%s;',
           a.privilege_type,
           CASE WHEN c.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
           c.relname, pg_catalog.pg_get_userbyid(a.grantee),
           CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
    FROM pg_catalog.pg_class c JOIN ns ON c.relnamespace = ns.oid
    CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND a.grantee IN (SELECT oid FROM api)
     AND pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE')
  UNION ALL
  SELECT 2, format('GRANT %s (%I) ON TABLE public.%I TO %I%s;',
           a.privilege_type, att.attname, c.relname, pg_catalog.pg_get_userbyid(a.grantee),
           CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
    FROM pg_catalog.pg_class c JOIN ns ON c.relnamespace = ns.oid
    JOIN pg_catalog.pg_attribute att ON att.attrelid = c.oid
    CROSS JOIN LATERAL aclexplode(att.attacl) a
   WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND a.grantee IN (SELECT oid FROM api)
     AND pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE')
  UNION ALL
  SELECT 3, format('GRANT %s ON %s public.%I(%s) TO %I;',
           a.privilege_type,
           CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
           p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid), pg_catalog.pg_get_userbyid(a.grantee))
    FROM pg_catalog.pg_proc p JOIN ns ON p.pronamespace = ns.oid
    CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE a.grantee IN (SELECT oid FROM api)
     AND pg_catalog.pg_has_role(current_user, p.proowner, 'USAGE')
  UNION ALL
  SELECT 4, format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s GRANT %s ON %s TO %I;',
           pg_catalog.pg_get_userbyid(d.defaclrole),
           CASE WHEN d.defaclnamespace = 0 THEN '' ELSE ' IN SCHEMA public' END,
           a.privilege_type,
           CASE d.defaclobjtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' ELSE 'FUNCTIONS' END,
           pg_catalog.pg_get_userbyid(a.grantee))
    FROM pg_catalog.pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE (d.defaclnamespace = (SELECT oid FROM ns) OR d.defaclnamespace = 0)
     AND d.defaclobjtype IN ('r', 'S', 'f')
     AND a.grantee IN (SELECT oid FROM api)
     AND pg_catalog.pg_has_role(current_user, d.defaclrole, 'MEMBER')
)
SELECT stmt FROM stmts ORDER BY ord, stmt
`;

/**
 * Artefacto de rollback (solo lectura): sentencias GRANT que restauran el
 * ACL previo de anon/authenticated/PUBLIC. Generar y guardar ANTES de
 * aplicar el hardening. No restaura grants que el migrador no administra.
 */
export async function generateSupabaseApiAclRestoreSql(db: RawQueryClient): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<Array<{ stmt: string }>>(ACL_RESTORE_SQL);
  return rows.map((r) => r.stmt);
}

/**
 * Audita la exposición Data API del schema `public` en la base a la que
 * apunta `db`. Solo lectura (una SELECT sobre catálogos).
 */
export async function auditSupabasePublicApiSecurity(
  db: RawQueryClient,
): Promise<SupabasePublicApiAuditResult> {
  const rows = await db.$queryRawUnsafe<Array<{ snapshot: string }>>(SNAPSHOT_SQL);
  const snapshot = JSON.parse(rows[0].snapshot) as SupabasePublicApiSnapshot;
  for (const acl of snapshot.defaultAcls) acl.grantees ??= [];
  return evaluateSupabasePublicApiSnapshot(snapshot);
}
