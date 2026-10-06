// ─────────────────────────────────────────────────────────────────
// commerce/sales — confirm-sale-payment-status.test.ts
//
// Certifica la transición de Sale.payment_status en confirmSale:
// si la primera confirmación crea el SalePayment por el total, la venta
// queda PAID en la MISMA transacción; si no se crea pago (sin forma de
// pago, total <= 0 o path de recuperación CONFIRMED + !inventory_moved),
// payment_status no cambia. Flujo completo: PAID → REFUNDED al anular.
//
// DB en memoria con transacciones serializadas y rollback (mismo enfoque
// que cancel-confirmed-sale.test.ts).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get() { throw new Error("Prisma global NO debe usarse"); } }),
}));

import { confirmSale, cancelConfirmedSale } from "./sale.service";

const T = "tenant-A";
const L = "loc-1";
const U = "user-1";

type Row = Record<string, unknown>;

interface Options {
  status?: string;
  inventory_moved?: boolean;
  payment_method_code?: string | null;
  total_amount?: number;
  payment_status?: string;
  cashOpen?: boolean;
}

function match(row: Row, where: Row): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (v && typeof v === "object" && "in" in (v as Row)) {
      if (!(v as { in: unknown[] }).in.includes(row[k])) return false;
    } else if (v && typeof v === "object" && "gte" in (v as Row)) {
      if (!(Number(row[k]) >= Number((v as { gte: number }).gte))) return false;
    } else if (row[k] !== v) {
      return false;
    }
  }
  return true;
}

function applyData(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in (v as Row)) row[k] = Number(row[k]) + Number((v as Row).increment);
    else if (v && typeof v === "object" && "decrement" in (v as Row)) row[k] = Number(row[k]) - Number((v as Row).decrement);
    else row[k] = v;
  }
}

function createFakeDb(o: Options = {}) {
  let state = {
    sale: {
      id: "sale-1",
      tenant_id: T,
      location_id: L,
      status: o.status ?? "DRAFT",
      sale_code: "V-2026-10-0001",
      total_amount: o.total_amount ?? 1800,
      payment_method_code: o.payment_method_code === undefined ? "01" : o.payment_method_code,
      primary_dte_type_code: "01",
      customer_id: null,
      inventory_moved: o.inventory_moved ?? false,
      cash_session_id: null as string | null,
      payment_status: o.payment_status ?? "UNPAID",
    } as Row,
    items: [
      { id: "i1", product_id: "p1", product_name_snapshot: "Prod", quantity: 2, unit_price: 900, line_total: 1800, is_stockable_snapshot: true },
    ] as Row[],
    payments: [] as Row[],
    productLocations: [{ id: "pl-1", tenant_id: T, location_id: L, product_id: "p1", is_active: true, current_stock: 10 }] as Row[],
    movements: [] as Row[],
    cashSessions: (o.cashOpen
      ? [{ id: "cs-1", tenant_id: T, location_id: L, status: "OPEN", cash_register_id: "reg-1", opened_at: new Date(), opening_amount: 50, expected_cash_amount: 50 }]
      : []) as Row[],
    cashMovements: [] as Row[],
  };
  let txChain: Promise<unknown> = Promise.resolve();

  const client = {
    sale: {
      findFirst: async ({ where }: { where: Row }) => {
        if (!match(state.sale, where)) return null;
        return {
          ...state.sale,
          items: state.items.map((i) => ({ ...i })),
          payments: state.payments.map((p) => ({ ...p })),
          dte_documents: [],
        };
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        if (!match(state.sale, where)) return { count: 0 };
        applyData(state.sale, data);
        return { count: 1 };
      },
    },
    saleExportDetails: { findUnique: async () => null },
    salePayment: {
      create: async ({ data }: { data: Row }) => {
        state.payments.push({ ...data, amount: Number(data.amount) });
        return data;
      },
    },
    dteOutgoingDocument: { findMany: async () => [] },
    cashSession: {
      findFirst: async ({ where }: { where: Row }) => {
        const s = state.cashSessions.find((x) => match(x, where));
        return s ? { ...s } : null;
      },
      findMany: async ({ where }: { where: Row }) => state.cashSessions.filter((s) => match(s, where)).map((s) => ({ ...s })),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const s = state.cashSessions.find((x) => match(x, where));
        if (!s) return { count: 0 };
        applyData(s, data);
        return { count: 1 };
      },
    },
    cashMovement: {
      create: async ({ data }: { data: Row }) => {
        state.cashMovements.push({ ...data });
        return data;
      },
    },
    productLocation: {
      findMany: async ({ where }: { where: Row }) => state.productLocations.filter((pl) => match(pl, where)).map((pl) => ({ ...pl })),
      findFirst: async ({ where }: { where: Row }) => {
        const pl = state.productLocations.find((x) => match(x, where));
        return pl ? { ...pl } : null;
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const pl = state.productLocations.find((x) => match(x, where));
        if (!pl) return { count: 0 };
        applyData(pl, data);
        return { count: 1 };
      },
    },
    inventoryMovement: {
      create: async ({ data }: { data: Row }) => {
        state.movements.push({ ...data });
        return data;
      },
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => {
      const run = txChain.then(async () => {
        const snapshot = structuredClone(state);
        try {
          return await fn(client);
        } catch (e) {
          state = snapshot;
          throw e;
        }
      });
      txChain = run.catch(() => {});
      return run;
    },
  };

  return { db: client as never, get state() { return state; } };
}

const confirm = (fake: ReturnType<typeof createFakeDb>) => confirmSale("sale-1", T, L, U, fake.db);

describe("confirmSale — payment_status", () => {
  it("(1) DRAFT + forma de pago + total > 0 → CONFIRMED, un SalePayment, PAID", async () => {
    const fake = createFakeDb();
    expect(await confirm(fake)).toEqual({ ok: true });
    expect(fake.state.sale.status).toBe("CONFIRMED");
    expect(fake.state.sale.payment_status).toBe("PAID");
    expect(fake.state.payments).toHaveLength(1);
    expect(fake.state.payments[0]).toMatchObject({ amount: 1800, payment_method_code: "01" });
  });

  it("(2) efectivo con caja OPEN → expected_cash_amount incrementa y PAID", async () => {
    const fake = createFakeDb({ cashOpen: true });
    expect(await confirm(fake)).toEqual({ ok: true });
    expect(fake.state.cashSessions[0].expected_cash_amount).toBe(1850);
    expect(fake.state.sale.cash_session_id).toBe("cs-1");
    expect(fake.state.sale.payment_status).toBe("PAID");
  });

  it("(3) pago no efectivo con caja OPEN → caja intacta y PAID", async () => {
    const fake = createFakeDb({ cashOpen: true, payment_method_code: "02" });
    expect(await confirm(fake)).toEqual({ ok: true });
    expect(fake.state.cashSessions[0].expected_cash_amount).toBe(50);
    expect(fake.state.payments).toHaveLength(1);
    expect(fake.state.sale.payment_status).toBe("PAID");
  });

  it("(4) sin payment_method_code → sin SalePayment, no fuerza PAID", async () => {
    const fake = createFakeDb({ payment_method_code: null });
    expect(await confirm(fake)).toEqual({ ok: true });
    expect(fake.state.sale.status).toBe("CONFIRMED");
    expect(fake.state.payments).toHaveLength(0);
    expect(fake.state.sale.payment_status).toBe("UNPAID");
  });

  it("(5) total = 0 → sin SalePayment, no fuerza PAID", async () => {
    const fake = createFakeDb({ total_amount: 0 });
    expect(await confirm(fake)).toEqual({ ok: true });
    expect(fake.state.payments).toHaveLength(0);
    expect(fake.state.sale.payment_status).toBe("UNPAID");
  });

  it("(6) recuperación CONFIRMED + inventory_moved=false → sin pago duplicado ni cambio de payment_status", async () => {
    const fake = createFakeDb({ status: "CONFIRMED", inventory_moved: false, payment_status: "UNPAID" });
    expect(await confirm(fake)).toEqual({ ok: true });
    expect(fake.state.sale.inventory_moved).toBe(true);
    expect(fake.state.payments).toHaveLength(0);
    expect(fake.state.sale.payment_status).toBe("UNPAID");
  });

  it("(7) flujo completo: confirmSale con pago → PAID; cancelConfirmedSale → REFUNDED", async () => {
    const fake = createFakeDb({ cashOpen: true });
    expect(await confirm(fake)).toEqual({ ok: true });
    expect(fake.state.sale.payment_status).toBe("PAID");
    expect(fake.state.productLocations[0].current_stock).toBe(8);

    expect(await cancelConfirmedSale("sale-1", T, L, U, fake.db)).toEqual({ ok: true });
    expect(fake.state.sale.status).toBe("CANCELLED");
    expect(fake.state.sale.payment_status).toBe("REFUNDED");
    expect(fake.state.payments).toHaveLength(1);
    expect(fake.state.productLocations[0].current_stock).toBe(10);
    expect(fake.state.cashSessions[0].expected_cash_amount).toBe(50);
    expect(fake.state.cashMovements).toEqual([expect.objectContaining({ movement_type: "REFUND_OUT", amount: 1800 })]);
  });
});
