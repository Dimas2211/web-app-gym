// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — test fixtures
//
// Solo para tests: TenantSecurityConfig en memoria (simula la Runtime
// DB de un tenant) y cookie jar compatible con next/headers.cookies().
// ─────────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

export const TEST_AUTH_SECRET = "test-secret-operational-authorization-0123456789";

interface SecurityRow {
  id: string;
  tenant_id: string;
  supervisor_pin_hash: string | null;
  supervisor_pin_updated_at: Date | null;
  supervisor_pin_failed_attempts: number;
  supervisor_pin_locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

function project(row: SecurityRow, select?: Record<string, boolean>): Record<string, unknown> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [k, on] of Object.entries(select)) if (on) out[k] = row[k as keyof SecurityRow];
  return out;
}

export interface FakeSecurityDb {
  rows: Map<string, SecurityRow>;
  client: PrismaClient;
  calls: { findUnique: number; upsert: number; update: number };
}

/** Runtime DB falsa con solo `tenantSecurityConfig`. */
export function createFakeSecurityDb(): FakeSecurityDb {
  const rows = new Map<string, SecurityRow>();
  const calls = { findUnique: 0, upsert: 0, update: 0 };
  let seq = 0;

  const tenantSecurityConfig = {
    async findUnique(args: { where: { tenant_id: string }; select?: Record<string, boolean> }) {
      calls.findUnique++;
      const row = rows.get(args.where.tenant_id);
      return row ? project(row, args.select) : null;
    },
    async upsert(args: {
      where: { tenant_id: string };
      create: Partial<SecurityRow>;
      update: Partial<SecurityRow>;
      select?: Record<string, boolean>;
    }) {
      calls.upsert++;
      const now = new Date();
      const existing = rows.get(args.where.tenant_id);
      const row: SecurityRow = existing
        ? { ...existing, ...args.update, updated_at: now }
        : {
            id: `cfg-${++seq}`,
            tenant_id: args.where.tenant_id,
            supervisor_pin_hash: null,
            supervisor_pin_updated_at: null,
            supervisor_pin_failed_attempts: 0,
            supervisor_pin_locked_until: null,
            created_at: now,
            updated_at: now,
            created_by: null,
            updated_by: null,
            ...args.create,
          };
      rows.set(args.where.tenant_id, row);
      return project(row, args.select);
    },
    async update(args: { where: { tenant_id: string }; data: Partial<SecurityRow>; select?: Record<string, boolean> }) {
      calls.update++;
      const existing = rows.get(args.where.tenant_id);
      if (!existing) throw new Error("Record not found");
      const row = { ...existing, ...args.data, updated_at: new Date() };
      rows.set(args.where.tenant_id, row);
      return project(row, args.select);
    },
  };

  return { rows, calls, client: { tenantSecurityConfig } as unknown as PrismaClient };
}

/** Siembra un tenant con la clave dada (hash bcrypt de coste bajo para tests). */
export async function seedSupervisorPin(db: FakeSecurityDb, tenantId: string, pin: string): Promise<string> {
  const hash = await bcrypt.hash(pin, 4);
  db.rows.set(tenantId, {
    id: `cfg-seed-${tenantId}`,
    tenant_id: tenantId,
    supervisor_pin_hash: hash,
    supervisor_pin_updated_at: new Date(),
    supervisor_pin_failed_attempts: 0,
    supervisor_pin_locked_until: null,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: null,
    updated_by: null,
  });
  return hash;
}

export type CookieJar = Map<string, { value: string; options?: Record<string, unknown> }>;

/** Implementación mínima de ReadonlyRequestCookies/ResponseCookies sobre un Map. */
export function cookieStoreFrom(jar: CookieJar) {
  return {
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    getAll: () => [...jar.entries()].map(([name, c]) => ({ name, value: c.value })),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      jar.set(name, { value, options });
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  };
}
