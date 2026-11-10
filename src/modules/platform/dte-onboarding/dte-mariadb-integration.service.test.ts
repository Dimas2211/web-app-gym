// FISCAL-ONBOARDING — integración MariaDB por organización desde el
// onboarding: opcional, cifrada, sin destino compartido entre
// organizaciones, prueba sin INSERT y habilitación controlada.

import { randomBytes } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");

vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({ controlPlanePrisma: {} }));

import {
  getDteMariaDbIntegrationSummary,
  upsertDteMariaDbIntegration,
  testDteMariaDbIntegration,
  setDteMariaDbIntegrationFlags,
} from "./dte-mariadb-integration.service";
import { decryptJsonPayload } from "@/lib/security/encryption";

type Row = {
  id: string; organization_id: string; type: string; label: string; is_active: boolean; auto_delivery_enabled: boolean;
  auto_delivery_enabled_at: Date | null; encrypted_payload: string; last_tested_at: Date | null;
  last_test_status: "UNTESTED" | "SUCCESS" | "FAILED"; last_test_message: string | null;
};

function fakeDb() {
  const rows: Row[] = [];
  let n = 0;
  const db = {
    rows,
    platformExternalIntegration: {
      // Copia, como Prisma real (la fila leída no cambia si otra petición la actualiza).
      findUnique: vi.fn(async ({ where }: { where: { organization_id_type: { organization_id: string; type: string } } }) => {
        const r = rows.find((x) => x.organization_id === where.organization_id_type.organization_id && x.type === where.organization_id_type.type);
        return r ? { ...r } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: { type: string; NOT: { organization_id: string } } }) =>
        rows.filter((r) => r.type === where.type && r.organization_id !== where.NOT.organization_id)),
      create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        const r = { id: `int-${++n}`, last_tested_at: null, last_test_status: "UNTESTED", last_test_message: null, auto_delivery_enabled_at: null, ...data } as Row;
        rows.push(r);
        return r;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; encrypted_payload?: string }; data: Partial<Row> }) => {
        const hits = rows.filter((x) => x.id === where.id && (where.encrypted_payload === undefined || x.encrypted_payload === where.encrypted_payload));
        hits.forEach((r) => Object.assign(r, data));
        return { count: hits.length };
      }),
    },
  };
  return db;
}

const INPUT = { host: "mariadb.cliente-a.com", port: 3306, database: "facturacion", table: "dtes_a", invalidationTable: "inv_a", user: "ins_a", password: "S3cret-A" };

let db: ReturnType<typeof fakeDb>;
beforeEach(() => { db = fakeDb(); });

describe("dte-mariadb-integration.service", () => {
  it("sin integración -> NOT_CONFIGURED (no hereda nada de otra organización)", async () => {
    await upsertDteMariaDbIntegration("org-b", { ...INPUT, table: "dtes_b", invalidationTable: "", password: "pb" }, "admin", { db: db as never });
    const s = await getDteMariaDbIntegrationSummary("org-a", { db: db as never });
    expect(s).toMatchObject({ configured: false, is_active: false, host: null, table: null });
  });

  it("alta queda INACTIVA, cifrada, y el resumen nunca devuelve la contraseña", async () => {
    const r = await upsertDteMariaDbIntegration("org-a", INPUT, "admin", { db: db as never });
    expect(r).toMatchObject({ ok: true, created: true });
    expect(db.rows[0].is_active).toBe(false);
    expect(db.rows[0].encrypted_payload).not.toContain("S3cret-A");
    const s = await getDteMariaDbIntegrationSummary("org-a", { db: db as never });
    expect(s).toMatchObject({ configured: true, has_password: true, table: "dtes_a", invalidation_table: "inv_a" });
    expect(JSON.stringify(s)).not.toContain("S3cret-A");
  });

  it("contraseña en blanco conserva la guardada; cambio de destino reinicia prueba y desactiva automática", async () => {
    await upsertDteMariaDbIntegration("org-a", INPUT, "admin", { db: db as never });
    Object.assign(db.rows[0], { last_test_status: "SUCCESS", is_active: true, auto_delivery_enabled: true });
    await upsertDteMariaDbIntegration("org-a", { ...INPUT, password: "", table: "dtes_a2" }, "admin", { db: db as never });
    const payload = decryptJsonPayload<{ password: string; table: string }>(db.rows[0].encrypted_payload);
    expect(payload.password).toBe("S3cret-A");
    expect(payload.table).toBe("dtes_a2");
    expect(db.rows[0]).toMatchObject({ last_test_status: "UNTESTED", auto_delivery_enabled: false });
  });

  it("modificar el destino de una integración ACTIVA la desactiva (bloquea manual y automática) hasta nueva prueba SUCCESS; otras organizaciones intactas", async () => {
    await upsertDteMariaDbIntegration("org-a", INPUT, "admin", { db: db as never });
    await upsertDteMariaDbIntegration("org-b", { ...INPUT, host: "mariadb.cliente-b.com", table: "dtes_b", invalidationTable: "", password: "pb" }, "admin", { db: db as never });
    for (const r of db.rows) Object.assign(r, { last_test_status: "SUCCESS", is_active: true, auto_delivery_enabled: true, auto_delivery_enabled_at: new Date() });
    const orgB = { ...db.rows[1] };

    await upsertDteMariaDbIntegration("org-a", { ...INPUT, password: "", host: "otro-host.cliente-a.com" }, "admin", { db: db as never });
    expect(db.rows[0]).toMatchObject({ is_active: false, last_test_status: "UNTESTED", auto_delivery_enabled: false, auto_delivery_enabled_at: null });
    expect(db.rows[1]).toEqual(orgB);

    // Sin prueba SUCCESS no se puede rehabilitar.
    expect(await setDteMariaDbIntegrationFlags("org-a", { is_active: true }, "admin", { db: db as never })).toMatchObject({ ok: false });
    const adapter = { testConnectivity: vi.fn(async () => ({ ok: true, level: "INSERT_PLAN_OK" as const, message: "ok" })) };
    expect(await testDteMariaDbIntegration("org-a", { db: db as never, adapter })).toMatchObject({ ok: true });
    expect(await setDteMariaDbIntegrationFlags("org-a", { is_active: true }, "admin", { db: db as never })).toEqual({ ok: true });

    // Cambiar solo la etiqueta no invalida nada.
    await upsertDteMariaDbIntegration("org-a", { ...INPUT, password: "", host: "otro-host.cliente-a.com", label: "Nueva etiqueta" }, "admin", { db: db as never });
    expect(db.rows[0]).toMatchObject({ is_active: true, last_test_status: "SUCCESS" });
  });

  it("si el destino cambia DURANTE la prueba, el resultado no certifica la configuración nueva", async () => {
    await upsertDteMariaDbIntegration("org-a", INPUT, "admin", { db: db as never });
    const adapter = { testConnectivity: vi.fn(async () => {
      Object.assign(db.rows[0], { encrypted_payload: "otro-payload-cifrado" });
      return { ok: true, level: "INSERT_PLAN_OK" as const, message: "ok" };
    }) };
    expect(await testDteMariaDbIntegration("org-a", { db: db as never, adapter })).toMatchObject({ ok: false });
    expect(db.rows[0].last_test_status).toBe("UNTESTED");
  });

  it("rechaza un destino (host/puerto/base/tabla) que ya pertenece a otra organización", async () => {
    await upsertDteMariaDbIntegration("org-a", INPUT, "admin", { db: db as never });
    const r = await upsertDteMariaDbIntegration("org-b", { ...INPUT, host: "MARIADB.cliente-a.com", invalidationTable: "", password: "x" }, "admin", { db: db as never });
    expect(r).toMatchObject({ ok: false, code: "DESTINATION_IN_USE" });
    const r2 = await upsertDteMariaDbIntegration("org-b", { ...INPUT, table: "inv_a", invalidationTable: "", password: "x" }, "admin", { db: db as never });
    expect(r2).toMatchObject({ ok: false, code: "DESTINATION_IN_USE" });
  });

  it("valida identificadores SQL y host (sin inyección)", async () => {
    const r = await upsertDteMariaDbIntegration("org-a", { ...INPUT, table: "dtes`; DROP" }, "admin", { db: db as never });
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("habilitar exige prueba SUCCESS; automática exige activa y fija auto_delivery_enabled_at", async () => {
    await upsertDteMariaDbIntegration("org-a", INPUT, "admin", { db: db as never });
    expect(await setDteMariaDbIntegrationFlags("org-a", { is_active: true }, "admin", { db: db as never })).toMatchObject({ ok: false });

    const adapter = { testConnectivity: vi.fn(async () => ({ ok: true, level: "INSERT_PLAN_OK" as const, message: "ok" })) };
    expect(await testDteMariaDbIntegration("org-a", { db: db as never, adapter })).toMatchObject({ ok: true });
    expect(adapter.testConnectivity).toHaveBeenCalledTimes(2); // tabla DTE + tabla invalidaciones

    expect(await setDteMariaDbIntegrationFlags("org-a", { auto_delivery_enabled: true }, "admin", { db: db as never })).toMatchObject({ ok: false });
    expect(await setDteMariaDbIntegrationFlags("org-a", { is_active: true }, "admin", { db: db as never })).toEqual({ ok: true });
    expect(await setDteMariaDbIntegrationFlags("org-a", { auto_delivery_enabled: true }, "admin", { db: db as never })).toEqual({ ok: true });
    expect(db.rows[0].auto_delivery_enabled_at).toBeInstanceOf(Date);

    // Deshabilitar entrega apaga también la automática.
    await setDteMariaDbIntegrationFlags("org-a", { is_active: false }, "admin", { db: db as never });
    expect(db.rows[0]).toMatchObject({ is_active: false, auto_delivery_enabled: false, auto_delivery_enabled_at: null });
  });

  it("prueba fallida marca FAILED y desactiva la automática", async () => {
    await upsertDteMariaDbIntegration("org-a", INPUT, "admin", { db: db as never });
    Object.assign(db.rows[0], { auto_delivery_enabled: true });
    const adapter = { testConnectivity: vi.fn(async () => ({ ok: false, level: "FAILED" as const, message: "No se pudo conectar" })) };
    expect(await testDteMariaDbIntegration("org-a", { db: db as never, adapter })).toMatchObject({ ok: false });
    expect(db.rows[0]).toMatchObject({ last_test_status: "FAILED", auto_delivery_enabled: false });
  });
});
