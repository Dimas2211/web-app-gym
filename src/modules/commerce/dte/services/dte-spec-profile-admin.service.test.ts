// MH20 (Fase 5.1E) — verificaciones puras / sin base del servicio de perfil.
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { checkMh20SchemasAvailable, checkSpecProfilePersistence, setDteIssuerSpecProfile } from "./dte-spec-profile-admin.service";
import { MH20_PRODUCTION_ACTIVATION_BLOCKERS, openMh20ProductionBlockers } from "../spec/mh20-activation-blockers";

const dbWith = (rows: Array<{ table_name: string; column_name: string }>) =>
  ({ $queryRaw: vi.fn().mockResolvedValue(rows), dteIssuerConfig: { findFirst: vi.fn() } }) as unknown as PrismaClient;

describe("persistencia compatible", () => {
  it("sin M1 ni M1b → PERSISTENCE_INCOMPATIBLE y no se lee el emisor", async () => {
    const db = dbWith([]);
    const r = await setDteIssuerSpecProfile(
      { tenant_id: "t", location_id: "l", issuer_config_id: "i", target_profile: "MH_1_2", reason: "rollback local", actor_id: "a" }, db, {},
    );
    expect(r).toMatchObject({ ok: false, code: "PERSISTENCE_INCOMPATIBLE", details: ["M1: dte_issuer_configs.mh_spec_profile", "M1b: dte_spec_profile_audit_logs"] });
    expect((db as any).dteIssuerConfig.findFirst).not.toHaveBeenCalled();
  });
  it("solo M1 → falta M1b", async () => {
    expect(await checkSpecProfilePersistence(dbWith([{ table_name: "dte_issuer_configs", column_name: "mh_spec_profile" }])))
      .toEqual({ ok: false, missing: ["M1b: dte_spec_profile_audit_logs"] });
  });
});

describe("interruptor global", () => {
  it("MH_2_0 con interruptor apagado se rechaza antes de tocar la base", async () => {
    const db = dbWith([]);
    const r = await setDteIssuerSpecProfile(
      { tenant_id: "t", location_id: "l", issuer_config_id: "i", target_profile: "MH_2_0", reason: "motivo válido", actor_id: "a" }, db, {},
    );
    expect(r).toMatchObject({ ok: false, code: "GLOBAL_SWITCH_OFF" });
    expect((db as any).$queryRaw).not.toHaveBeenCalled();
  });
  it("el entorno real del proceso de pruebas mantiene el interruptor apagado", () => {
    expect(process.env.DTE_MH20_PROFILE_ENABLED).not.toBe("true");
  });
});

describe("schemas y bloqueos P0", () => {
  it("schemas 2.0 de 01/03/05/14 disponibles en el registro", () => {
    expect(checkMh20SchemasAvailable()).toEqual([]);
  });
  it("hay bloqueos P0 abiertos (PRODUCTION no activable)", () => {
    expect(openMh20ProductionBlockers().length).toBe(MH20_PRODUCTION_ACTIVATION_BLOCKERS.length);
    expect(openMh20ProductionBlockers([{ id: "x", title: "y", resolved: true }])).toEqual([]);
  });
});
