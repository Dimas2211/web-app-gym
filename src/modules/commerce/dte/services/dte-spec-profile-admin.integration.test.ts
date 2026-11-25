// MH20 (Fase 5.1E) — administración del perfil normativo contra una base
// PostgreSQL DESECHABLE (mismas guardas que dte-catalog-version.integration).
// Requiere migraciones aplicadas (incluida M1b). Crea sus propias filas con
// tenant/location ficticios y no toca nada fuera de ellos.

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setDteIssuerSpecProfile, type SetDteSpecProfileInput } from "./dte-spec-profile-admin.service";
import { seedDteCatalogItemsMh20 } from "../../../../../prisma/seeds/seed.dte-catalog-items-mh20";
import { MUNICIPALITIES } from "../../../../../prisma/importers/generated/municipalities.data";

const URL_ENV = process.env.MH20_SCRATCH_DATABASE_URL ?? "";
const RUN = (() => {
  try {
    const u = new URL(URL_ENV);
    return ["localhost", "127.0.0.1"].includes(u.hostname) && /_scratch_/.test(u.pathname);
  } catch {
    return false;
  }
})();

const ON  = { DTE_MH20_PROFILE_ENABLED: "true" } as const;
const OFF = {} as const;

describe.skipIf(!RUN)("setDteIssuerSpecProfile — base desechable", () => {
  let db: PrismaClient;
  const T = `t-${randomUUID()}`;
  const L = `l-${randomUUID()}`;
  const T_OTHER = `t-${randomUUID()}`;
  let testIssuer: string;
  let prodIssuer: string;
  let cabanasIssuer: string;
  let otherTenantIssuer: string;

  const base = (issuer: string, target: string, extra: Partial<SetDteSpecProfileInput> = {}): SetDteSpecProfileInput => ({
    tenant_id: T, location_id: L, issuer_config_id: issuer, target_profile: target,
    reason: "Prueba local Fase 5.1E", actor_id: "platform-admin-1", actor_scope: "PLATFORM", ...extra,
  });

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: URL_ENV } } });
    for (const key of ["05|11", "06|19", ...MUNICIPALITIES.filter((m) => m.dept_code === "09").map((m) => `${m.dept_code}|${m.code}`)]) {
      const m = MUNICIPALITIES.find((x) => `${x.dept_code}|${x.code}` === key)!;
      const exists = await db.municipality.findFirst({ where: { dept_code: m.dept_code, code: m.code } });
      if (!exists) await db.municipality.create({ data: { ...m } as never });
    }
    await seedDteCatalogItemsMh20(db);
    const mk = async (tenant_id: string, environment: "TEST" | "PRODUCTION", dept: string, muni: string, location_id = L) =>
      (await db.dteIssuerConfig.create({
        data: { tenant_id, location_id, environment, nit: "06140101011011", name: "Emisor ficticio", dept_code: dept, municipality_code: muni },
        select: { id: true },
      })).id;
    testIssuer        = await mk(T, "TEST", "05", "11");
    prodIssuer        = await mk(T, "PRODUCTION", "05", "11");
    cabanasIssuer     = await mk(T, "TEST", "09", MUNICIPALITIES.find((m) => m.dept_code === "09")!.code, `l-cab-${randomUUID()}`);
    otherTenantIssuer = await mk(T_OTHER, "TEST", "05", "11");
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("interruptor global OFF: MH_2_0 rechazado y nada se escribe", async () => {
    const r = await setDteIssuerSpecProfile(base(testIssuer, "MH_2_0"), db, OFF);
    expect(r).toMatchObject({ ok: false, code: "GLOBAL_SWITCH_OFF" });
    expect(await db.dteSpecProfileAuditLog.count({ where: { issuer_config_id: testIssuer } })).toBe(0);
    expect((await db.dteIssuerConfig.findUnique({ where: { id: testIssuer } }))?.mh_spec_profile).toBeNull();
  });

  it("aislamiento: emisor de otro tenant → NOT_FOUND", async () => {
    const r = await setDteIssuerSpecProfile(base(otherTenantIssuer, "MH_2_0"), db, ON);
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect((await db.dteIssuerConfig.findUnique({ where: { id: otherTenantIssuer } }))?.mh_spec_profile).toBeNull();
  });

  it("motivo obligatorio y perfil desconocido rechazados", async () => {
    expect(await setDteIssuerSpecProfile(base(testIssuer, "MH_2_0", { reason: "corto" }), db, ON)).toMatchObject({ code: "INVALID_INPUT" });
    expect(await setDteIssuerSpecProfile(base(testIssuer, "MH_9_9"), db, ON)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("catálogos 2.0 incompletos → CATALOGS_MISSING", async () => {
    const row = await db.dteCatalogItem.findFirstOrThrow({ where: { catalog_code: "CAT-017", version: "2.0", item_code: "11" } });
    await db.dteCatalogItem.update({ where: { id: row.id }, data: { is_active: false } });
    try {
      const r = await setDteIssuerSpecProfile(base(testIssuer, "MH_2_0"), db, ON);
      expect(r).toMatchObject({ ok: false, code: "CATALOGS_MISSING" });
    } finally {
      await db.dteCatalogItem.update({ where: { id: row.id }, data: { is_active: true } });
    }
  });

  // Fase 6.1 (consultas §13): Cabañas resuelto documentalmente; ya no es
  // TERRITORY_INVALID por CAT-INC-001 (cambio de expectativa justificado).
  it("territorio Cabañas (CAT-013 v1.1) → ya no se rechaza por territorio", async () => {
    const cab = await db.dteIssuerConfig.findUniqueOrThrow({ where: { id: cabanasIssuer } });
    const r = await setDteIssuerSpecProfile({ ...base(cabanasIssuer, "MH_2_0"), location_id: cab.location_id }, db, ON);
    if (!r.ok) expect(r.code).not.toBe("TERRITORY_INVALID");
  });

  it("PRODUCTION: MH_2_0 rechazado por bloqueos P0", async () => {
    const r = await setDteIssuerSpecProfile(base(prodIssuer, "MH_2_0"), db, ON);
    expect(r).toMatchObject({ ok: false, code: "PRODUCTION_BLOCKED" });
    if (!r.ok) expect(r.details?.some((d) => d.startsWith("MH20-094"))).toBe(true);
    expect((await db.dteIssuerConfig.findUnique({ where: { id: prodIssuer } }))?.mh_spec_profile).toBeNull();
  });

  it("TEST: MH_2_0 permitido con interruptor ON; auditoría con actor, valor anterior y nuevo", async () => {
    const r = await setDteIssuerSpecProfile(base(testIssuer, "MH_2_0"), db, ON);
    expect(r).toMatchObject({ ok: true, changed: true, previous_profile: "MH_1_2", new_profile: "MH_2_0", environment: "TEST" });
    expect((await db.dteIssuerConfig.findUnique({ where: { id: testIssuer } }))?.mh_spec_profile).toBe("MH_2_0");
    const logs = await db.dteSpecProfileAuditLog.findMany({ where: { issuer_config_id: testIssuer } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      tenant_id: T, location_id: L, environment: "TEST", previous_profile: null, new_profile: "MH_2_0",
      changed_by: "platform-admin-1", changed_by_scope: "PLATFORM", reason: "Prueba local Fase 5.1E",
    });
    expect(logs[0].created_at).toBeInstanceOf(Date);
  });

  it("separación TEST/PROD: PRODUCTION del mismo emisor sigue sin perfil", async () => {
    expect((await db.dteIssuerConfig.findUnique({ where: { id: prodIssuer } }))?.mh_spec_profile).toBeNull();
  });

  it("idempotente: mismo perfil → changed=false sin nueva auditoría", async () => {
    const r = await setDteIssuerSpecProfile(base(testIssuer, "MH_2_0"), db, ON);
    expect(r).toMatchObject({ ok: true, changed: false });
    expect(await db.dteSpecProfileAuditLog.count({ where: { issuer_config_id: testIssuer } })).toBe(1);
  });

  it("rollback a MH_1_2 permitido aun con interruptor OFF y auditado", async () => {
    const r = await setDteIssuerSpecProfile(base(testIssuer, "MH_1_2", { reason: "Rollback de prueba local" }), db, OFF);
    expect(r).toMatchObject({ ok: true, changed: true, previous_profile: "MH_2_0", new_profile: "MH_1_2" });
    const last = await db.dteSpecProfileAuditLog.findFirstOrThrow({ where: { issuer_config_id: testIssuer }, orderBy: { created_at: "desc" } });
    expect(last).toMatchObject({ previous_profile: "MH_2_0", new_profile: "MH_1_2" });
  });

  it("CHECK de M1b rechaza valores fuera de dominio y motivos vacíos", async () => {
    await expect(db.dteSpecProfileAuditLog.create({
      data: { tenant_id: T, location_id: L, issuer_config_id: testIssuer, environment: "TEST", new_profile: "MH_9_9", changed_by: "x", reason: "motivo suficiente" },
    })).rejects.toThrow();
    await expect(db.dteSpecProfileAuditLog.create({
      data: { tenant_id: T, location_id: L, issuer_config_id: testIssuer, environment: "TEST", new_profile: "MH_2_0", changed_by: "x", reason: "   " },
    })).rejects.toThrow();
  });
});
