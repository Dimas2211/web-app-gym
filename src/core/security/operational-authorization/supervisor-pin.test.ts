// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — supervisor-pin.test.ts
//
// Clave de Supervisor contra la DB EFECTIVA pasada por el caller:
// correcta/incorrecta, fail closed sin configuración, hash nunca
// expuesto, anti fuerza bruta y validación de formato.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// (19) Si algún camino tocara Prisma global, el test explota.
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get() { throw new Error("Prisma global NO debe usarse para la Clave de Supervisor"); } }),
}));

import {
  getSupervisorPinStatus,
  setSupervisorPin,
  validateNewSupervisorPin,
  verifySupervisorPin,
  getActivePinFingerprint,
  SUPERVISOR_PIN_MAX_FAILED_ATTEMPTS,
} from "./supervisor-pin";
import { createFakeSecurityDb, seedSupervisorPin, type FakeSecurityDb } from "./operational-authorization.test-fixtures";

let db: FakeSecurityDb;

beforeEach(() => {
  db = createFakeSecurityDb();
});

describe("verifySupervisorPin", () => {
  it("(1) clave correcta autoriza y devuelve solo la huella", async () => {
    const hash = await seedSupervisorPin(db, "tenant-A", "123456");
    const r = await verifySupervisorPin(db.client, "tenant-A", "123456");
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r)).not.toContain(hash);
  });

  it("(2) clave incorrecta falla", async () => {
    await seedSupervisorPin(db, "tenant-A", "123456");
    expect(await verifySupervisorPin(db.client, "tenant-A", "654321")).toEqual({ ok: false, code: "INVALID" });
  });

  it("(3) tenant sin configuración falla cerrado", async () => {
    expect(await verifySupervisorPin(db.client, "tenant-A", "123456")).toEqual({ ok: false, code: "NOT_CONFIGURED" });
  });

  it("(3) configuración existente pero sin hash falla cerrado", async () => {
    await seedSupervisorPin(db, "tenant-A", "123456");
    db.rows.get("tenant-A")!.supervisor_pin_hash = null;
    expect(await verifySupervisorPin(db.client, "tenant-A", "123456")).toEqual({ ok: false, code: "NOT_CONFIGURED" });
    expect(await getActivePinFingerprint(db.client, "tenant-A")).toBeNull();
  });

  it("clave vacía → REQUIRED sin consultar DB", async () => {
    expect(await verifySupervisorPin(db.client, "tenant-A", "")).toEqual({ ok: false, code: "REQUIRED" });
    expect(db.calls.findUnique).toBe(0);
  });

  it("(5) la clave del tenant A no sirve en tenant B", async () => {
    await seedSupervisorPin(db, "tenant-A", "123456");
    await seedSupervisorPin(db, "tenant-B", "999999");
    expect((await verifySupervisorPin(db.client, "tenant-B", "123456")).ok).toBe(false);
  });

  it("anti fuerza bruta: 5 fallos bloquean incluso la clave correcta; éxito posterior reinicia", async () => {
    await seedSupervisorPin(db, "tenant-A", "123456");
    const now = new Date("2026-10-05T10:00:00Z");
    for (let i = 1; i < SUPERVISOR_PIN_MAX_FAILED_ATTEMPTS; i++) {
      expect((await verifySupervisorPin(db.client, "tenant-A", "000000", now)).ok).toBe(false);
    }
    expect(await verifySupervisorPin(db.client, "tenant-A", "000000", now)).toEqual({ ok: false, code: "LOCKED" });
    expect(await verifySupervisorPin(db.client, "tenant-A", "123456", now)).toEqual({ ok: false, code: "LOCKED" });

    const later = new Date(now.getTime() + 6 * 60_000);
    expect((await verifySupervisorPin(db.client, "tenant-A", "123456", later)).ok).toBe(true);
    expect(db.rows.get("tenant-A")!.supervisor_pin_failed_attempts).toBe(0);
    expect(db.rows.get("tenant-A")!.supervisor_pin_locked_until).toBeNull();
  });
});

describe("getSupervisorPinStatus / setSupervisorPin", () => {
  it("(4) el estado nunca devuelve el hash", async () => {
    const hash = await seedSupervisorPin(db, "tenant-A", "123456");
    const status = await getSupervisorPinStatus(db.client, "tenant-A");
    expect(status.configured).toBe(true);
    expect(Object.keys(status).sort()).toEqual(["configured", "updatedAt"]);
    expect(JSON.stringify(status)).not.toContain(hash);
    expect(JSON.stringify(status)).not.toContain("123456");
  });

  it("sin configuración → configured=false", async () => {
    expect(await getSupervisorPinStatus(db.client, "tenant-A")).toEqual({ configured: false, updatedAt: null });
  });

  it("setSupervisorPin guarda SOLO hash bcrypt, nunca texto claro, y audita created_by/updated_by", async () => {
    await setSupervisorPin(db.client, "tenant-A", "admin-1", "clave-segura");
    const row = db.rows.get("tenant-A")!;
    expect(row.supervisor_pin_hash).not.toBe("clave-segura");
    expect(row.supervisor_pin_hash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare("clave-segura", row.supervisor_pin_hash!)).toBe(true);
    expect(JSON.stringify(row)).not.toContain("clave-segura");
    expect(row.created_by).toBe("admin-1");
    expect(row.updated_by).toBe("admin-1");
  });

  it("cambiar/restablecer reemplaza el hash, invalida la anterior y reinicia el bloqueo", async () => {
    await setSupervisorPin(db.client, "tenant-A", "admin-1", "primera1");
    const fp1 = await getActivePinFingerprint(db.client, "tenant-A");
    db.rows.get("tenant-A")!.supervisor_pin_locked_until = new Date(Date.now() + 60_000);

    await setSupervisorPin(db.client, "tenant-A", "admin-2", "segunda2");
    const fp2 = await getActivePinFingerprint(db.client, "tenant-A");

    expect(fp2).not.toBe(fp1);
    expect(db.rows.get("tenant-A")!.supervisor_pin_locked_until).toBeNull();
    expect(db.rows.get("tenant-A")!.updated_by).toBe("admin-2");
    expect((await verifySupervisorPin(db.client, "tenant-A", "primera1")).ok).toBe(false);
    expect((await verifySupervisorPin(db.client, "tenant-A", "segunda2")).ok).toBe(true);
  });
});

describe("validateNewSupervisorPin", () => {
  it("acepta 6-32 caracteres sin espacios con confirmación igual", () => {
    expect(validateNewSupervisorPin("123456", "123456")).toBeNull();
    expect(validateNewSupervisorPin("a".repeat(32), "a".repeat(32))).toBeNull();
  });

  it("rechaza corta, larga, con espacios, vacía o confirmación distinta", () => {
    expect(validateNewSupervisorPin("12345", "12345")).not.toBeNull();
    expect(validateNewSupervisorPin("a".repeat(33), "a".repeat(33))).not.toBeNull();
    expect(validateNewSupervisorPin("123 456", "123 456")).not.toBeNull();
    expect(validateNewSupervisorPin("", "")).not.toBeNull();
    expect(validateNewSupervisorPin("123456", "123457")).not.toBeNull();
  });
});
