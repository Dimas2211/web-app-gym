// ─────────────────────────────────────────────────────────────────
// platform/lib/provisioning — provision-runtime-tenant.test.ts
//
// SHARED-PILOT-3B — criterio de aceptación #34: "Puedo crear un
// RuntimeTenant nuevo de tipo Commerce, crear su Location y su
// administrador, autenticar a ese administrador como RUNTIME_CLIENT
// y operar con tenant_id/location_id, sin que exista una sola fila
// Gym para ese tenant." Y simultáneamente MODE GYM sigue soportado.
//
// SHARED-PILOT-4B — idempotencia por receipt: atomicidad
// tenant+location+admin+receipt, replay con los mismos IDs, fail
// closed ante slug ajeno / modo distinto / receipt inconsistente, y
// serialización de requests concurrentes con la misma key.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  provisionRuntimeTenant,
  RuntimeProvisioningConflictError,
  type ProvisionRuntimeTenantInput,
} from "./provision-runtime-tenant";
import { createRuntimeDb, type InMemoryDb } from "./provisioning-test-harness";

const ADMIN = { email: "admin@example.com", password: "synthetic-pass-123", first_name: "A", last_name: "Admin" };

const COMMERCE: ProvisionRuntimeTenantInput = {
  mode: "COMMERCE_ONLY",
  idempotencyKey: "key-commerce-1",
  tenantName: "Comercio Uno",
  tenantSlug: "comercio-uno",
  locationName: "Sede Central",
  admin: ADMIN,
};

const GYM: ProvisionRuntimeTenantInput = {
  mode: "GYM",
  idempotencyKey: "key-gym-1",
  tenantName: "Gimnasio Uno",
  tenantSlug: "gimnasio-uno",
  gymName: "Gimnasio Uno",
  gymSlug: "gimnasio-uno",
  locationName: "Sede Central",
  admin: ADMIN,
};

const asClient = (db: InMemoryDb) => db.client as unknown as PrismaClient;

function counts(db: InMemoryDb) {
  return {
    tenants:   db.count("runtimeTenant"),
    gyms:      db.count("gym"),
    locations: db.count("branch"),
    admins:    db.count("user"),
    receipts:  db.count("runtimeProvisioningReceipt"),
  };
}

describe("provisionRuntimeTenant — MODE COMMERCE_ONLY", () => {
  it("crea RuntimeTenant + Location + Admin + Receipt SIN crear ninguna fila Gym", async () => {
    const db = createRuntimeDb();

    const result = await provisionRuntimeTenant(asClient(db), COMMERCE);

    expect(counts(db)).toEqual({ tenants: 1, gyms: 0, locations: 1, admins: 1, receipts: 1 });
    expect(result.gymId).toBeNull();
    expect(result.replayed).toBe(false);

    const [location] = db.tables.branch;
    expect(location).toMatchObject({ tenant_id: result.tenantId, gym_id: null, name: "Sede Central", status: "active" });

    const [admin] = db.tables.user;
    expect(admin).toMatchObject({ tenant_id: result.tenantId, gym_id: null, role: "super_admin", location_id: result.locationId });
    expect(await bcrypt.compare(ADMIN.password, admin.password_hash as string)).toBe(true);

    const [receipt] = db.tables.runtimeProvisioningReceipt;
    expect(receipt).toMatchObject({
      idempotency_key: "key-commerce-1",
      mode: "COMMERCE_ONLY",
      tenant_id: result.tenantId,
      gym_id: null,
      location_id: result.locationId,
      admin_user_id: result.adminUserId,
    });
    // El receipt nunca guarda password/hash.
    expect(JSON.stringify(receipt)).not.toContain(ADMIN.password);
    expect(JSON.stringify(receipt)).not.toContain("password");
  });
});

describe("provisionRuntimeTenant — MODE GYM", () => {
  it("crea RuntimeTenant + Gym + Location + Admin, todos vinculados por tenant_id/gym_id", async () => {
    const db = createRuntimeDb();

    const result = await provisionRuntimeTenant(asClient(db), GYM);

    expect(counts(db)).toEqual({ tenants: 1, gyms: 1, locations: 1, admins: 1, receipts: 1 });
    expect(db.tables.gym[0]).toMatchObject({ id: result.gymId, tenant_id: result.tenantId, slug: "gimnasio-uno" });
    expect(db.tables.branch[0]).toMatchObject({ tenant_id: result.tenantId, gym_id: result.gymId });
    expect(db.tables.user[0]).toMatchObject({ tenant_id: result.tenantId, gym_id: result.gymId });
    expect(db.tables.runtimeProvisioningReceipt[0]).toMatchObject({ mode: "GYM", gym_id: result.gymId });
  });
});

describe("provisionRuntimeTenant — idempotencia por receipt (SHARED-PILOT-4B)", () => {
  it("misma key después de commit → mismos IDs, 0 filas nuevas", async () => {
    const db = createRuntimeDb();
    const first = await provisionRuntimeTenant(asClient(db), COMMERCE);
    const before = counts(db);

    const second = await provisionRuntimeTenant(asClient(db), COMMERCE);

    expect(second).toEqual({ ...first, replayed: true });
    expect(counts(db)).toEqual(before);
  });

  it("replay no depende del input: aunque el retry traiga otro slug/email, devuelve el receipt de la key", async () => {
    const db = createRuntimeDb();
    const first = await provisionRuntimeTenant(asClient(db), COMMERCE);

    const second = await provisionRuntimeTenant(asClient(db), {
      ...COMMERCE,
      tenantSlug: "otro-slug",
      admin: { ...ADMIN, email: "otro@example.com" },
    });

    expect(second.tenantId).toBe(first.tenantId);
    expect(counts(db)).toEqual({ tenants: 1, gyms: 0, locations: 1, admins: 1, receipts: 1 });
  });

  it("falla dentro de la transacción (admin) → rollback completo, sin tenant/location/receipt parcial; retry con la misma key crea todo", async () => {
    const db = createRuntimeDb();
    db.failNext("user", "create");

    await expect(provisionRuntimeTenant(asClient(db), COMMERCE)).rejects.toThrow(/injected failure/);
    expect(counts(db)).toEqual({ tenants: 0, gyms: 0, locations: 0, admins: 0, receipts: 0 });

    const retry = await provisionRuntimeTenant(asClient(db), COMMERCE);
    expect(retry.replayed).toBe(false);
    expect(counts(db)).toEqual({ tenants: 1, gyms: 0, locations: 1, admins: 1, receipts: 1 });
  });

  it("falla al escribir el receipt (último paso) → tampoco quedan tenant/location/admin", async () => {
    const db = createRuntimeDb();
    db.failNext("runtimeProvisioningReceipt", "create");

    await expect(provisionRuntimeTenant(asClient(db), GYM)).rejects.toThrow();
    expect(counts(db)).toEqual({ tenants: 0, gyms: 0, locations: 0, admins: 0, receipts: 0 });
  });

  it("slug de tenant ya tomado por OTRO tenant (sin receipt de esta key) → fail closed, nunca lo adopta", async () => {
    const db = createRuntimeDb();
    const foreign = db.seed("runtimeTenant", { name: "Ajeno", slug: "comercio-uno", status: "active" });

    const err = await provisionRuntimeTenant(asClient(db), COMMERCE).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RuntimeProvisioningConflictError);
    expect((err as RuntimeProvisioningConflictError).reason).toBe("TENANT_SLUG_TAKEN");
    expect(counts(db)).toEqual({ tenants: 1, gyms: 0, locations: 0, admins: 0, receipts: 0 });
    expect(db.tables.runtimeTenant[0].id).toBe(foreign.id);
  });

  it("slug de tenant tomado por la operación de OTRA key → fail closed (foreign receipt takeover imposible)", async () => {
    const db = createRuntimeDb();
    await provisionRuntimeTenant(asClient(db), { ...COMMERCE, idempotencyKey: "key-de-otra-organizacion" });

    const err = await provisionRuntimeTenant(asClient(db), COMMERCE).catch((e: unknown) => e);

    expect((err as RuntimeProvisioningConflictError).reason).toBe("TENANT_SLUG_TAKEN");
    expect(db.count("runtimeProvisioningReceipt", { idempotency_key: COMMERCE.idempotencyKey })).toBe(0);
    expect(counts(db).tenants).toBe(1);
  });

  it("slug de gym ajeno → fail closed", async () => {
    const db = createRuntimeDb();
    const other = db.seed("runtimeTenant", { name: "Otro", slug: "otro", status: "active" });
    db.seed("gym", { tenant_id: other.id, name: "G", slug: "gimnasio-uno", status: "active" });

    const err = await provisionRuntimeTenant(asClient(db), GYM).catch((e: unknown) => e);

    expect((err as RuntimeProvisioningConflictError).reason).toBe("GYM_SLUG_TAKEN");
    expect(counts(db)).toEqual({ tenants: 1, gyms: 1, locations: 0, admins: 0, receipts: 0 });
  });

  it("mismo email admin en OTRO tenant → válido (unique es tenant_id+email)", async () => {
    const db = createRuntimeDb();
    await provisionRuntimeTenant(asClient(db), COMMERCE);

    const second = await provisionRuntimeTenant(asClient(db), {
      ...COMMERCE,
      idempotencyKey: "key-commerce-2",
      tenantSlug: "comercio-dos",
    });

    expect(second.replayed).toBe(false);
    expect(db.count("user", { email: ADMIN.email })).toBe(2);
  });

  it("violación unique dentro de la transacción (carrera contra otra operación) → UNIQUE_CONFLICT + rollback", async () => {
    const db = createRuntimeDb();
    db.failNext(
      "user",
      "create",
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );

    const err = await provisionRuntimeTenant(asClient(db), COMMERCE).catch((e: unknown) => e);

    expect((err as RuntimeProvisioningConflictError).reason).toBe("UNIQUE_CONFLICT");
    expect(counts(db)).toEqual({ tenants: 0, gyms: 0, locations: 0, admins: 0, receipts: 0 });
  });

  it("receipt existente con modo distinto → fail closed, no crea nada", async () => {
    const db = createRuntimeDb();
    await provisionRuntimeTenant(asClient(db), COMMERCE);

    const err = await provisionRuntimeTenant(asClient(db), {
      ...GYM,
      idempotencyKey: COMMERCE.idempotencyKey,
    }).catch((e: unknown) => e);

    expect((err as RuntimeProvisioningConflictError).reason).toBe("RECEIPT_MODE_MISMATCH");
    expect(counts(db)).toEqual({ tenants: 1, gyms: 0, locations: 1, admins: 1, receipts: 1 });
  });

  it("receipt cuyo admin no pertenece al tenant del receipt → fail closed (RECEIPT_RESOURCES_MISSING)", async () => {
    const db = createRuntimeDb();
    await provisionRuntimeTenant(asClient(db), COMMERCE);
    const other = db.seed("runtimeTenant", { name: "Otro", slug: "otro", status: "active" });
    db.tables.user[0].tenant_id = other.id; // corrupción deliberada

    const err = await provisionRuntimeTenant(asClient(db), COMMERCE).catch((e: unknown) => e);

    expect((err as RuntimeProvisioningConflictError).reason).toBe("RECEIPT_RESOURCES_MISSING");
  });

  it("replayOnly sin receipt → RECEIPT_NOT_FOUND, no crea tenant", async () => {
    const db = createRuntimeDb();

    const err = await provisionRuntimeTenant(asClient(db), { ...COMMERCE, replayOnly: true }).catch((e: unknown) => e);

    expect((err as RuntimeProvisioningConflictError).reason).toBe("RECEIPT_NOT_FOUND");
    expect(counts(db)).toEqual({ tenants: 0, gyms: 0, locations: 0, admins: 0, receipts: 0 });
  });

  it("replayOnly con receipt → devuelve los mismos IDs", async () => {
    const db = createRuntimeDb();
    const first = await provisionRuntimeTenant(asClient(db), COMMERCE);

    const again = await provisionRuntimeTenant(asClient(db), { ...COMMERCE, replayOnly: true });

    expect(again.tenantId).toBe(first.tenantId);
  });

  it("dos llamadas concurrentes con la misma key → exactamente 1 set de filas, ambas devuelven los mismos IDs", async () => {
    const db = createRuntimeDb();

    const [a, b] = await Promise.all([
      provisionRuntimeTenant(asClient(db), COMMERCE),
      provisionRuntimeTenant(asClient(db), COMMERCE),
    ]);

    expect(counts(db)).toEqual({ tenants: 1, gyms: 0, locations: 1, admins: 1, receipts: 1 });
    expect(a.tenantId).toBe(b.tenantId);
    expect(a.locationId).toBe(b.locationId);
    expect(a.adminUserId).toBe(b.adminUserId);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
  });
});
