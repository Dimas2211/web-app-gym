// ─────────────────────────────────────────────────────────────────
// commerce/dte/certification/harness — in-memory-prisma.test.ts
//
// Verifica que la base de certificación NO pueda producir falsos PASS:
// constraints reales, rollback real, atomicidad de batch, y fallo
// cerrado ante SQL/operadores que no entiende.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { InMemoryPrismaDb } from "./in-memory-prisma";

async function seedIssuer(db: InMemoryPrismaDb) {
  const tenant = randomUUID();
  const location = randomUUID();
  const issuer = await db.client.dteIssuerConfig.create({
    data: { tenant_id: tenant, location_id: location, environment: "TEST", nit: "00000000000001", name: "EMISOR CERT" },
    select: { id: true },
  });
  return { tenant, location, issuerId: issuer.id };
}

describe("InMemoryPrismaDb (base de certificación)", () => {
  it("aplica defaults del DMMF (uuid/now/enum) y devuelve Decimal como Prisma", async () => {
    const db = new InMemoryPrismaDb({ label: "t" });
    const { issuerId } = await seedIssuer(db);
    const row = await db.client.dteIssuerConfig.findUnique({ where: { id: issuerId } });
    expect(row).toMatchObject({ is_active: true, environment: "TEST" });
    expect(row!.created_at).toBeInstanceOf(Date);
    const rate = await db.client.taxRate.create({ data: { tenant_id: randomUUID(), name: "IVA", rate: 13 } });
    expect(Prisma.Decimal.isDecimal(rate.rate)).toBe(true);
  });

  it("unique compuesto → P2002 con target real", async () => {
    const db = new InMemoryPrismaDb({ label: "t" });
    const { tenant, location } = await seedIssuer(db);
    await expect(db.client.dteIssuerConfig.create({
      data: { tenant_id: tenant, location_id: location, environment: "TEST", nit: "00000000000002", name: "DUP" },
    })).rejects.toMatchObject({ code: "P2002", meta: { target: ["tenant_id", "location_id", "environment"] } });
  });

  it("FK inexistente → P2003", async () => {
    const db = new InMemoryPrismaDb({ label: "t" });
    await expect(db.client.dteCredential.create({
      data: { issuer_config_id: randomUUID(), credential_type: "MH_CREDENTIALS" },
    })).rejects.toMatchObject({ code: "P2003" });
  });

  it("update sin fila → P2025", async () => {
    const db = new InMemoryPrismaDb({ label: "t" });
    await expect(db.client.dteIssuerConfig.update({ where: { id: randomUUID() }, data: { name: "x" } }))
      .rejects.toMatchObject({ code: "P2025" });
  });

  it("$transaction interactivo revierte todo ante error", async () => {
    const db = new InMemoryPrismaDb({ label: "t" });
    const { issuerId } = await seedIssuer(db);
    await expect(db.client.$transaction(async (tx) => {
      await tx.dteIssuerConfig.update({ where: { id: issuerId }, data: { name: "CAMBIADO" } });
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(db.rows("DteIssuerConfig")[0].name).toBe("EMISOR CERT");
  });

  it("$transaction([...]) es atómico (operaciones lazy, como PrismaPromise)", async () => {
    const db = new InMemoryPrismaDb({ label: "t" });
    const { issuerId } = await seedIssuer(db);
    await expect(db.client.$transaction([
      db.client.dteIssuerConfig.update({ where: { id: issuerId }, data: { name: "CAMBIADO" } }),
      db.client.dteIssuerConfig.update({ where: { id: randomUUID() }, data: { name: "NO EXISTE" } }),
    ])).rejects.toMatchObject({ code: "P2025" });
    expect(db.rows("DteIssuerConfig")[0].name).toBe("EMISOR CERT");
  });

  it("filtros de relación, _count, increment y nested select", async () => {
    const db = new InMemoryPrismaDb({ label: "t" });
    const { tenant, location, issuerId } = await seedIssuer(db);
    const doc = await db.client.dteOutgoingDocument.create({
      data: { tenant_id: tenant, location_id: location, dte_type_code: "01", environment: "TEST", issuer_config_id: issuerId, retry_count: 0 },
    });
    await db.client.dteOutgoingDocument.update({ where: { id: doc.id }, data: { retry_count: { increment: 2 } } });
    const found = await db.client.dteIssuerConfig.findFirst({
      where: { outgoing_documents: { some: { dte_type_code: "01", retry_count: { gte: 2 } } } },
      select: { id: true, _count: { select: { outgoing_documents: true } } },
    });
    expect(found).toEqual({ id: issuerId, _count: { outgoing_documents: 1 } });
    const none = await db.client.dteIssuerConfig.findFirst({ where: { outgoing_documents: { some: { dte_type_code: "03" } } } });
    expect(none).toBeNull();
  });

  it("falla cerrado ante SQL crudo desconocido y claves de filtro no soportadas", async () => {
    const db = new InMemoryPrismaDb({ label: "t" });
    await expect(db.client.$queryRaw`SELECT 1`).rejects.toThrow(/SQL crudo no reconocido/);
    await expect(db.client.dteIssuerConfig.findMany({ where: { campo_inexistente: 1 } as never }))
      .rejects.toThrow(/no soportada/);
  });
});
