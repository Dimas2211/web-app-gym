// ─────────────────────────────────────────────────────────────────
// commerce/sales — cancel-confirmed-sale.test.ts
//
// Certifica cancelConfirmedSale (CONFIRMED → CANCELLED):
//   estado, reglas DTE, reglas de caja/pagos, RETURN_IN agrupado,
//   aislamiento tenant/location, atomicidad y concurrencia.
//
// No usa DB real: una DB en memoria modela los WHERE que usa el service
// y $transaction con semántica real mínima — transacciones serializadas
// (lock de fila) y rollback completo del estado si el callback lanza.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get() { throw new Error("Prisma global NO debe usarse"); } }),
}));

import { cancelConfirmedSale, evaluateSaleDteCancelGate, SALE_CANCEL_MESSAGES as MSG } from "./sale.service";

const T = "tenant-A";
const L = "loc-1";
const U = "user-1";

type Row = Record<string, unknown>;

interface State {
  sale: Row & { items: Row[]; payments: Row[] };
  dteDocs: Row[];
  productLocations: Row[];
  movements: Row[];
  cashSessions: Row[];
  cashMovements: Row[];
}

interface Options {
  status?: string;
  inventory_moved?: boolean;
  items?: Row[];
  payments?: Row[];
  cash_session_id?: string | null;
  dteDocs?: Row[];
  cashSessions?: Row[];
  failOn?: "inventoryMovement.create" | "cashMovement.create";
}

function makeState(o: Options = {}): State {
  return {
    sale: {
      id: "sale-1",
      tenant_id: T,
      location_id: L,
      status: o.status ?? "CONFIRMED",
      sale_code: "V-2026-10-0001",
      inventory_moved: o.inventory_moved ?? true,
      cash_session_id: o.cash_session_id ?? null,
      payment_status: "UNPAID",
      cancelled_at: null,
      cancelled_by: null,
      updated_by: null,
      items: o.items ?? [
        { product_id: "p1", quantity: 2, is_stockable_snapshot: true },
        { product_id: "p1", quantity: 3, is_stockable_snapshot: true }, // repetido → agrupado 5
        { product_id: "p2", quantity: 1, is_stockable_snapshot: true },
        { product_id: "svc", quantity: 4, is_stockable_snapshot: false }, // servicio, no stockable
      ],
      payments: o.payments ?? [],
    },
    dteDocs: (o.dteDocs ?? []).map((d) => ({ tenant_id: T, sale_id: "sale-1", ...d })),
    productLocations: [
      { id: "pl-1", tenant_id: T, location_id: L, product_id: "p1", current_stock: 10 },
      { id: "pl-2", tenant_id: T, location_id: L, product_id: "p2", current_stock: 0 },
    ],
    movements: [
      { movement_type: "SALE_OUT", product_id: "p1", quantity: 5, reference_id: "sale-1" },
      { movement_type: "SALE_OUT", product_id: "p2", quantity: 1, reference_id: "sale-1" },
    ],
    cashSessions: o.cashSessions ?? [],
    cashMovements: [],
  };
}

function match(row: Row, where: Row): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (v && typeof v === "object" && "in" in (v as Row)) {
      if (!((v as { in: unknown[] }).in).includes(row[k])) return false;
    } else if (v && typeof v === "object" && "gte" in (v as Row)) {
      if (!(Number(row[k]) >= Number((v as { gte: number }).gte))) return false;
    } else if (row[k] !== v) {
      return false;
    }
  }
  return true;
}

function createFakeDb(o: Options = {}) {
  let state = makeState(o);
  const calls = { transaction: 0, writesOutsideTx: 0 };
  let inTx = false;
  let txChain: Promise<unknown> = Promise.resolve();

  const guardWrite = () => {
    if (!inTx) calls.writesOutsideTx++;
  };

  const client = {
    sale: {
      findFirst: async ({ where }: { where: Row }) => {
        const { items, payments, ...head } = state.sale;
        if (!match(head, where)) return null;
        return {
          ...head,
          items: items.map((i) => ({ ...i })),
          payments: payments.map((p) => ({ ...p })),
          dte_documents: state.dteDocs.filter((d) => d.tenant_id === where.tenant_id).map((d) => ({ dte_status: d.dte_status })),
        };
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        guardWrite();
        const { items: _i, payments: _p, ...head } = state.sale;
        if (!match(head, where)) return { count: 0 };
        Object.assign(state.sale, data);
        return { count: 1 };
      },
    },
    dteOutgoingDocument: {
      findMany: async ({ where }: { where: Row }) => state.dteDocs.filter((d) => match(d, where)).map((d) => ({ dte_status: d.dte_status })),
    },
    cashSession: {
      findMany: async ({ where }: { where: Row }) => state.cashSessions.filter((s) => match(s, where)).map((s) => ({ ...s })),
      findFirst: async ({ where }: { where: Row }) => {
        const s = state.cashSessions.find((x) => match(x, where));
        return s ? { ...s } : null;
      },
      updateMany: async ({ where, data }: { where: Row; data: { expected_cash_amount: { decrement: number } } }) => {
        guardWrite();
        const s = state.cashSessions.find((x) => match(x, where));
        if (!s) return { count: 0 };
        s.expected_cash_amount = Number(s.expected_cash_amount) - data.expected_cash_amount.decrement;
        return { count: 1 };
      },
    },
    cashMovement: {
      create: async ({ data }: { data: Row }) => {
        guardWrite();
        if (o.failOn === "cashMovement.create") throw new Error("DB failure");
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
      updateMany: async ({ where, data }: { where: Row; data: { current_stock: { increment: number } } }) => {
        guardWrite();
        const pl = state.productLocations.find((x) => match(x, where));
        if (!pl) return { count: 0 };
        pl.current_stock = Number(pl.current_stock) + data.current_stock.increment;
        return { count: 1 };
      },
    },
    inventoryMovement: {
      create: async ({ data }: { data: Row }) => {
        guardWrite();
        if (o.failOn === "inventoryMovement.create") throw new Error("DB failure");
        state.movements.push({ ...data });
        return data;
      },
    },
    // Transacciones serializadas (lock de fila) + rollback total si lanza.
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => {
      calls.transaction++;
      const run = txChain.then(async () => {
        const snapshot = structuredClone(state);
        inTx = true;
        try {
          return await fn(client);
        } catch (e) {
          state = snapshot;
          throw e;
        } finally {
          inTx = false;
        }
      });
      txChain = run.catch(() => {});
      return run;
    },
  };

  return { db: client as never, get state() { return state; }, calls };
}

const run = (fake: ReturnType<typeof createFakeDb>, tenant = T, location = L) =>
  cancelConfirmedSale("sale-1", tenant, location, U, fake.db);

const returnIns = (s: State) => s.movements.filter((m) => m.movement_type === "RETURN_IN");
const stock = (s: State, product: string) => s.productLocations.find((pl) => pl.product_id === product)!.current_stock;

// ─────────────────────────────────────────────────────────────────

describe("cancelConfirmedSale — estado", () => {
  it("(1/16) CONFIRMED sin DTE → CANCELLED con cancelled_at/cancelled_by/updated_by", async () => {
    const fake = createFakeDb();
    expect(await run(fake)).toEqual({ ok: true });
    expect(fake.state.sale.status).toBe("CANCELLED");
    expect(fake.state.sale.cancelled_at).toBeInstanceOf(Date);
    expect(fake.state.sale.cancelled_by).toBe(U);
    expect(fake.state.sale.updated_by).toBe(U);
    expect(fake.state.sale.sale_code).toBe("V-2026-10-0001"); // correlativo intacto
    expect(fake.state.sale.items).toHaveLength(4); // líneas conservadas
    expect(fake.calls.writesOutsideTx).toBe(0);
  });

  it("(3) DRAFT no puede usar cancelConfirmedSale", async () => {
    const fake = createFakeDb({ status: "DRAFT", inventory_moved: false });
    expect(await run(fake)).toEqual({ ok: false, error: MSG.IS_DRAFT });
    expect(fake.state.sale.status).toBe("DRAFT");
    expect(fake.calls.transaction).toBe(0);
  });

  it("(4) CANCELLED no se puede volver a anular", async () => {
    const fake = createFakeDb({ status: "CANCELLED" });
    expect(await run(fake)).toEqual({ ok: false, error: MSG.ALREADY_CANCELLED });
    expect(returnIns(fake.state)).toHaveLength(0);
    expect(fake.calls.transaction).toBe(0);
  });

  it("(10) cross-tenant: venta de otro tenant no es visible ni mutable", async () => {
    const fake = createFakeDb();
    expect(await run(fake, "tenant-B")).toEqual({ ok: false, error: MSG.NOT_FOUND });
    expect(fake.state.sale.status).toBe("CONFIRMED");
    expect(fake.calls.transaction).toBe(0);
  });

  it("(11) cross-location: venta de otra location no es visible ni mutable", async () => {
    const fake = createFakeDb();
    expect(await run(fake, T, "loc-2")).toEqual({ ok: false, error: MSG.NOT_FOUND });
    expect(fake.state.sale.status).toBe("CONFIRMED");
    expect(stock(fake.state, "p1")).toBe(10);
  });
});

describe("cancelConfirmedSale — inventario", () => {
  it("(5/6/7/8) RETURN_IN agrupado por producto, sin no-stockables, SALE_OUT intacto", async () => {
    const fake = createFakeDb();
    expect(await run(fake)).toEqual({ ok: true });

    const ins = returnIns(fake.state);
    expect(ins).toHaveLength(2);
    expect(ins.find((m) => m.product_id === "p1")).toMatchObject({
      quantity: 5, stock_before: 10, resulting_stock: 15, product_location_id: "pl-1",
      reference_entity: "sale", reference_id: "sale-1", reference_code: "V-2026-10-0001",
      performed_by: U, tenant_id: T, location_id: L,
    });
    expect(ins.find((m) => m.product_id === "p2")).toMatchObject({ quantity: 1, stock_before: 0, resulting_stock: 1 });
    expect(ins.some((m) => m.product_id === "svc")).toBe(false);

    expect(stock(fake.state, "p1")).toBe(15);
    expect(stock(fake.state, "p2")).toBe(1);
    expect(fake.state.movements.filter((m) => m.movement_type === "SALE_OUT")).toHaveLength(2);
  });

  it("inventory_moved=false → CANCELLED sin RETURN_IN ni cambio de stock", async () => {
    const fake = createFakeDb({ inventory_moved: false });
    expect(await run(fake)).toEqual({ ok: true });
    expect(fake.state.sale.status).toBe("CANCELLED");
    expect(returnIns(fake.state)).toHaveLength(0);
    expect(stock(fake.state, "p1")).toBe(10);
  });

  it("(9) atomicidad: si falla un RETURN_IN no queda ni CANCELLED ni stock devuelto", async () => {
    const fake = createFakeDb({ failOn: "inventoryMovement.create" });
    expect(await run(fake)).toEqual({ ok: false, error: MSG.UNEXPECTED });
    expect(fake.state.sale.status).toBe("CONFIRMED");
    expect(fake.state.sale.cancelled_at).toBeNull();
    expect(stock(fake.state, "p1")).toBe(10);
    expect(returnIns(fake.state)).toHaveLength(0);
  });

  it("(21) dos anulaciones concurrentes → una sola reversa", async () => {
    const fake = createFakeDb();
    const [a, b] = await Promise.all([run(fake), run(fake)]);
    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: MSG.CONFLICT });
    expect(returnIns(fake.state)).toHaveLength(2); // p1 + p2, una sola vez
    expect(stock(fake.state, "p1")).toBe(15);
    expect(stock(fake.state, "p2")).toBe(1);
  });
});

describe("cancelConfirmedSale — DTE", () => {
  it("(13) DTE ACCEPTED bloquea con mensaje de invalidación previa", async () => {
    const fake = createFakeDb({ dteDocs: [{ dte_status: "ACCEPTED" }] });
    expect(await run(fake)).toEqual({ ok: false, error: MSG.DTE_ACCEPTED });
    expect(MSG.DTE_ACCEPTED).toBe(
      "La venta tiene un DTE aceptado por Hacienda. Debes invalidar el DTE antes de anular la venta.",
    );
    expect(fake.state.sale.status).toBe("CONFIRMED");
    expect(fake.calls.transaction).toBe(0);
  });

  it("(14) DTE INVALIDATED permite anular", async () => {
    const fake = createFakeDb({ dteDocs: [{ dte_status: "INVALIDATED" }] });
    expect(await run(fake)).toEqual({ ok: true });
    expect(fake.state.sale.status).toBe("CANCELLED");
  });

  it.each(["PENDING_GENERATION", "GENERATED", "SCHEMA_VALIDATED", "SIGNED", "SENT", "CONTINGENCY_PENDING", "INVALIDATION_PENDING", "REJECTED"])(
    "(15) DTE en estado %s bloquea (fail closed)",
    async (dte_status) => {
      const fake = createFakeDb({ dteDocs: [{ dte_status }] });
      expect(await run(fake)).toEqual({ ok: false, error: MSG.DTE_IN_PROGRESS });
      expect(fake.state.sale.status).toBe("CONFIRMED");
    },
  );

  it("gate: estado activo pesa más que ACCEPTED; OBSERVED exige invalidar; NOT_REQUIRED permite", () => {
    expect(evaluateSaleDteCancelGate([])).toBeNull();
    expect(evaluateSaleDteCancelGate([{ dte_status: "NOT_REQUIRED" }])).toBeNull();
    expect(evaluateSaleDteCancelGate([{ dte_status: "OBSERVED" }])).toBe(MSG.DTE_ACCEPTED);
    expect(evaluateSaleDteCancelGate([{ dte_status: "ACCEPTED" }, { dte_status: "SIGNED" }])).toBe(MSG.DTE_IN_PROGRESS);
    expect(evaluateSaleDteCancelGate([{ dte_status: "INVALIDATED" }, { dte_status: "ACCEPTED" }])).toBe(MSG.DTE_ACCEPTED);
    expect(evaluateSaleDteCancelGate([{ dte_status: "ESTADO_DESCONOCIDO" }])).toBe(MSG.DTE_IN_PROGRESS);
  });

  it("DTE de OTRO tenant con el mismo sale_id no cuenta (scope tenant en el WHERE)", async () => {
    const fake = createFakeDb({ dteDocs: [{ dte_status: "ACCEPTED", tenant_id: "tenant-B" }] });
    expect(await run(fake)).toEqual({ ok: true });
  });
});

describe("cancelConfirmedSale — pagos y caja", () => {
  const OPEN = { id: "cs-1", tenant_id: T, location_id: L, status: "OPEN", expected_cash_amount: 100, cash_register_id: "reg-1" };

  it("(17/18) sin caja: SalePayment se conserva, payment_status REFUNDED, sin tocar CashSession", async () => {
    const fake = createFakeDb({
      payments: [{ amount: 25, payment_method_code: "02", mh_payment_form_code: "02", cash_session_id: null }],
      cashSessions: [{ ...OPEN }],
    });
    expect(await run(fake)).toEqual({ ok: true });
    expect(fake.state.sale.payments).toHaveLength(1);
    expect(fake.state.sale.payment_status).toBe("REFUNDED");
    expect(fake.state.cashSessions[0].expected_cash_amount).toBe(100);
    expect(fake.state.cashMovements).toHaveLength(0);
  });

  it("sin ningún pago: payment_status se conserva (UNPAID)", async () => {
    const fake = createFakeDb();
    expect(await run(fake)).toEqual({ ok: true });
    expect(fake.state.sale.payment_status).toBe("UNPAID");
  });

  it("(19) caja OPEN + efectivo → REFUND_OUT, expected decrementado, REFUNDED", async () => {
    const fake = createFakeDb({
      cash_session_id: "cs-1",
      payments: [{ amount: 40, payment_method_code: "01", mh_payment_form_code: "01", cash_session_id: "cs-1" }],
      cashSessions: [{ ...OPEN }],
    });
    expect(await run(fake)).toEqual({ ok: true });
    expect(fake.state.cashSessions[0].expected_cash_amount).toBe(60);
    expect(fake.state.cashMovements).toEqual([
      expect.objectContaining({
        movement_type: "REFUND_OUT", direction: "OUT", amount: 40, cash_session_id: "cs-1",
        cash_register_id: "reg-1", tenant_id: T, location_id: L, performed_by: U, reference: "V-2026-10-0001",
      }),
    ]);
    expect(fake.state.sale.payments).toHaveLength(1);
    expect(fake.state.sale.payment_status).toBe("REFUNDED");
  });

  it("caja OPEN + pago NO efectivo → sin REFUND_OUT, expected intacto, REFUNDED", async () => {
    const fake = createFakeDb({
      cash_session_id: "cs-1",
      payments: [{ amount: 40, payment_method_code: "02", mh_payment_form_code: "02", cash_session_id: "cs-1" }],
      cashSessions: [{ ...OPEN }],
    });
    expect(await run(fake)).toEqual({ ok: true });
    expect(fake.state.cashSessions[0].expected_cash_amount).toBe(100);
    expect(fake.state.cashMovements).toHaveLength(0);
    expect(fake.state.sale.payment_status).toBe("REFUNDED");
  });

  it("(20) caja CLOSED → bloquea sin modificar venta/inventario/caja", async () => {
    const fake = createFakeDb({
      cash_session_id: "cs-1",
      payments: [{ amount: 40, payment_method_code: "01", mh_payment_form_code: "01", cash_session_id: "cs-1" }],
      cashSessions: [{ ...OPEN, status: "CLOSED" }],
    });
    expect(await run(fake)).toEqual({ ok: false, error: MSG.CASH_CLOSED });
    expect(fake.state.sale.status).toBe("CONFIRMED");
    expect(fake.state.sale.payment_status).toBe("UNPAID");
    expect(stock(fake.state, "p1")).toBe(10);
    expect(fake.state.cashSessions[0].expected_cash_amount).toBe(100);
    expect(fake.state.cashMovements).toHaveLength(0);
    expect(fake.calls.transaction).toBe(0);
  });

  it("caja de otro tenant/location (no visible en el scope) → bloquea fail closed", async () => {
    const fake = createFakeDb({
      cash_session_id: "cs-1",
      cashSessions: [{ ...OPEN, tenant_id: "tenant-B" }],
    });
    expect(await run(fake)).toEqual({ ok: false, error: MSG.CASH_CLOSED });
    expect(fake.state.sale.status).toBe("CONFIRMED");
  });

  it("caja con efectivo esperado insuficiente → rollback total", async () => {
    const fake = createFakeDb({
      cash_session_id: "cs-1",
      payments: [{ amount: 40, payment_method_code: "01", mh_payment_form_code: "01", cash_session_id: "cs-1" }],
      cashSessions: [{ ...OPEN, expected_cash_amount: 10 }],
    });
    expect(await run(fake)).toEqual({ ok: false, error: MSG.CASH_INSUFFICIENT });
    expect(fake.state.sale.status).toBe("CONFIRMED");
    expect(stock(fake.state, "p1")).toBe(10);
    expect(returnIns(fake.state)).toHaveLength(0);
    expect(fake.state.cashSessions[0].expected_cash_amount).toBe(10);
  });

  it("(9) fallo al registrar REFUND_OUT revierte estado, stock y caja", async () => {
    const fake = createFakeDb({
      cash_session_id: "cs-1",
      payments: [{ amount: 40, payment_method_code: "01", mh_payment_form_code: "01", cash_session_id: "cs-1" }],
      cashSessions: [{ ...OPEN }],
      failOn: "cashMovement.create",
    });
    expect(await run(fake)).toEqual({ ok: false, error: MSG.UNEXPECTED });
    expect(fake.state.sale.status).toBe("CONFIRMED");
    expect(stock(fake.state, "p1")).toBe(10);
    expect(fake.state.cashSessions[0].expected_cash_amount).toBe(100);
  });
});
