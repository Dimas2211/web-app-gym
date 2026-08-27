// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase.service.fse-tax.test.ts
//
// Prueba local (fake Prisma en memoria, sin DB real, sin correlativos,
// sin firma, sin transmisión, sin MariaDB) de los bugs corregidos:
//
//   1. Purchase FSE persistía el 13% de IVA de Product como tax_amount.
//      -> addPurchaseItem/updatePurchaseItem fuerzan tax_amount=0 para
//         document_type=FSE, SIN IMPORTAR lo que envíe el cliente.
//   2. Cambio de document_type gravado<->FSE debe recalcular las líneas
//      existentes (resyncLineTaxesForFseTransition), sin tocar
//      Product.tax_rate.
//   3. confirmPurchase() exige payment_nature definida para FSE.
//   4. updatePurchasePaymentNature() persiste el snapshot fiscal exacto.
//
// Fake Prisma: implementa solo los métodos que purchase.service.ts
// realmente usa, con maps en memoria. $transaction ejecuta el callback
// contra el mismo objeto (no hay atomicidad real — no hace falta para
// esta prueba). No importa @/lib/db/prisma real.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Estado en memoria ────────────────────────────────────────────

interface FakePurchase {
  id: string;
  tenant_id: string;
  location_id: string;
  status: string;
  document_type: string | null;
  payment_nature: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  retention_1pct_applies: boolean;
  retention_1pct_amount: number;
  income_tax_withholding_applies: boolean;
  income_tax_withholding_rate: number | null;
  income_tax_withholding_amount: number;
  income_tax_withholding_base: number;
  supplier_id: string;
  confirmed_at: Date | null;
  purchase_date: Date;
}

interface FakeItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  tax_amount: number;
  line_subtotal: number;
  line_total: number;
}

interface FakeProduct {
  id: string;
  tenant_id: string;
  allow_purchase: boolean;
  status: string;
  is_stockable: boolean;
  tax_rate_pct: number; // simula TaxRate.rate — NUNCA modificado por el test
}

interface FakeSupplier {
  id: string;
  tenant_id: string;
  status: string;
  person_type: string;
}

let purchases: Map<string, FakePurchase>;
let items: Map<string, FakeItem>;
let products: Map<string, FakeProduct>;
let suppliers: Map<string, FakeSupplier>;
let idSeq = 0;
function nextId(prefix: string) { return `${prefix}-${++idSeq}`; }

function itemWithProductJoin(item: FakeItem) {
  const product = products.get(item.product_id)!;
  return {
    ...item,
    product: { tax_rate: { rate: product.tax_rate_pct } },
  };
}

// Prisma.Decimal (real o el fake definido abajo) trae .value; desenrédalo
// a number plano antes de guardarlo en el store en memoria.
function unwrap(v: unknown): unknown {
  if (v != null && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return Number((v as { value: number }).value);
  }
  return v;
}
function unwrapData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[k] = unwrap(v);
  return out;
}

const fakeDb = {
  purchase: {
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
      const p = purchases.get(where.id);
      if (!p) return null;
      // Relación dte_documents: nunca hay DTE creado en estas pruebas —
      // ver reglas "NO TOCAR" (cero DTE, cero firma, cero transmisión).
      const purchaseItems = [...items.values()].filter((i) => i.purchase_id === p.id);
      return {
        ...p,
        dte_documents: [],
        supplier: suppliers.get(p.supplier_id),
        items: purchaseItems.map((i) => ({
          ...i,
          product: { ...products.get(i.product_id), is_stockable: products.get(i.product_id)!.is_stockable, allow_purchase: true, status: "ACTIVE" },
        })),
      };
    }),
    create: vi.fn(async ({ data }: { data: Partial<FakePurchase> }) => {
      const id = nextId("purchase");
      const row: FakePurchase = {
        id, tenant_id: data.tenant_id!, location_id: data.location_id!,
        status: "DRAFT", document_type: data.document_type ?? null,
        payment_nature: null, subtotal: 0, tax_amount: 0, total_amount: 0,
        retention_1pct_applies: false, retention_1pct_amount: 0,
        income_tax_withholding_applies: false, income_tax_withholding_rate: null,
        income_tax_withholding_amount: 0, income_tax_withholding_base: 0,
        supplier_id: data.supplier_id!, confirmed_at: null,
        purchase_date: new Date("2026-08-25"),
      };
      purchases.set(id, row);
      return { id: row.id, purchase_code: "1" };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const p = purchases.get(where.id)!;
      Object.assign(p, unwrapData(data));
    }),
  },
  purchaseItem: {
    create: vi.fn(async ({ data }: { data: Partial<FakeItem> }) => {
      const id = nextId("item");
      const row: FakeItem = {
        id,
        purchase_id: data.purchase_id!, product_id: data.product_id!,
        quantity: Number(data.quantity), unit_cost: Number(data.unit_cost),
        tax_amount: Number(unwrap(data.tax_amount)), line_subtotal: Number(unwrap(data.line_subtotal)),
        line_total: Number(unwrap(data.line_total)),
      };
      items.set(id, row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const it = items.get(where.id)!;
      Object.assign(it, unwrapData(data));
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: string; purchase_id: string } }) => {
      const it = items.get(where.id);
      if (!it || it.purchase_id !== where.purchase_id) return null;
      return { ...it };
    }),
    findMany: vi.fn(async ({ where }: { where: { purchase_id: string } }) => {
      return [...items.values()]
        .filter((i) => i.purchase_id === where.purchase_id)
        .map(itemWithProductJoin);
    }),
  },
  product: {
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
      const p = products.get(where.id);
      if (!p) return null;
      return { id: p.id };
    }),
  },
  supplier: {
    findFirst: vi.fn(async ({ where }: { where: { id?: string; tenant_id?: string } }) => {
      const s = where.id ? suppliers.get(where.id) : [...suppliers.values()][0];
      if (!s) return null;
      return { ...s };
    }),
  },
  tenantFiscalConfig: {
    findFirst: vi.fn(async () => null), // sin config de retención 1% en estas pruebas
  },
  $transaction: vi.fn(async (fn: (tx: typeof fakeDb) => Promise<unknown>) => fn(fakeDb)),
};

vi.mock("@/lib/db/prisma", () => ({ prisma: fakeDb }));
vi.mock("@prisma/client", () => ({
  Prisma: {
    Decimal: class { value: number; constructor(v: number) { this.value = v; } valueOf() { return this.value; } toString() { return String(this.value); } },
    PrismaClientKnownRequestError: class extends Error {},
  },
}));

// Importado DESPUÉS de los mocks — purchase.service.ts usa `Prisma.Decimal`
// solo como wrapper; nuestro fake lo desenreda con Number(...) donde hace falta.
const {
  addPurchaseItem, updatePurchaseHeader,
  createPurchase, confirmPurchase, updatePurchasePaymentNature,
} = await import("./purchase.service");

// ── Fixtures ──────────────────────────────────────────────────────

const TENANT = "tenant-1";
const LOCATION = "location-1";
const USER = "user-1";

function seedSupplier(person_type: string) {
  const id = nextId("supplier");
  suppliers.set(id, { id, tenant_id: TENANT, status: "active", person_type });
  return id;
}

function seedProduct(opts: { is_stockable: boolean; tax_rate_pct: number }) {
  const id = nextId("product");
  products.set(id, { id, tenant_id: TENANT, allow_purchase: true, status: "ACTIVE", ...opts });
  return id;
}

async function seedFsePurchaseWithItem(supplierId: string, productId: string, qty: number, unitCost: number, clientSentTax: number) {
  const created = await createPurchase(TENANT, LOCATION, USER, {
    supplier_id: supplierId, purchase_date: "2026-08-25", purchase_code: String(++idSeq), document_type: "FSE",
    document_series: "1", document_number: "1", payment_condition: "CON", cancellation_type: "EFE",
  } as never);
  if (!created.ok) throw new Error(created.error);
  await addPurchaseItem(created.id, TENANT, LOCATION, USER, {
    product_id: productId, quantity: qty, unit_cost: unitCost, tax_amount: clientSentTax,
  });
  return created.id;
}

beforeEach(() => {
  purchases = new Map();
  items = new Map();
  products = new Map();
  suppliers = new Map();
  idSeq = 0;
  vi.clearAllMocks();
});

// ── Caso A ──────────────────────────────────────────────────────

describe("Caso A — FSE + Product.tax_rate 13% + costo 333.33", () => {
  it("subtotal=333.33, tax=0, total=333.33 aunque el cliente envíe tax_amount=43.33", async () => {
    const supplierId = seedSupplier("NATURAL_PERSON");
    const productId  = seedProduct({ is_stockable: false, tax_rate_pct: 13 });
    const purchaseId = await seedFsePurchaseWithItem(supplierId, productId, 1, 333.33, 43.33);

    const purchase = purchases.get(purchaseId)!;
    expect(purchase.subtotal).toBe(333.33);
    expect(purchase.tax_amount).toBe(0);
    expect(purchase.total_amount).toBe(333.33);

    const item = [...items.values()][0];
    expect(item.tax_amount).toBe(0);
    expect(item.line_total).toBe(333.33);

    // Product.tax_rate nunca se toca — sigue siendo 13% en el catálogo.
    expect(products.get(productId)!.tax_rate_pct).toBe(13);
  });
});

// ── Caso E — gravado → FSE ────────────────────────────────────────

describe("Caso E — documento gravado → FSE recalcula impuesto a 0", () => {
  it("línea con IVA 43.33 pasa a tax_amount=0 al cambiar document_type a FSE", async () => {
    const supplierId = seedSupplier("NATURAL_PERSON");
    const productId  = seedProduct({ is_stockable: false, tax_rate_pct: 13 });

    const created = await createPurchase(TENANT, LOCATION, USER, {
      supplier_id: supplierId, purchase_date: "2026-08-25", purchase_code: String(++idSeq), document_type: "CCF",
      document_series: "1", document_number: "1", payment_condition: "CON", cancellation_type: "EFE",
    } as never);
    if (!created.ok) throw new Error(created.error);
    await addPurchaseItem(created.id, TENANT, LOCATION, USER, {
      product_id: productId, quantity: 1, unit_cost: 333.33, tax_amount: 43.33,
    });
    expect([...items.values()][0].tax_amount).toBe(43.33); // gravado: se respeta el IVA enviado

    const res = await updatePurchaseHeader(created.id, TENANT, LOCATION, USER, { document_type: "FSE" });
    expect(res.ok).toBe(true);

    const item = [...items.values()][0];
    expect(item.tax_amount).toBe(0);
    expect(item.line_total).toBe(333.33);
    const purchase = purchases.get(created.id)!;
    expect(purchase.tax_amount).toBe(0);
    expect(purchase.total_amount).toBe(333.33);
  });
});

// ── Caso F — FSE → gravado ────────────────────────────────────────

describe("Caso F — FSE → documento gravado restaura el IVA normal", () => {
  it("línea sin IVA (FSE) recupera tax_amount desde Product.tax_rate al volver a CCF", async () => {
    const supplierId = seedSupplier("NATURAL_PERSON");
    const productId  = seedProduct({ is_stockable: false, tax_rate_pct: 13 });
    const purchaseId = await seedFsePurchaseWithItem(supplierId, productId, 1, 333.33, 0);

    expect([...items.values()][0].tax_amount).toBe(0);

    const res = await updatePurchaseHeader(purchaseId, TENANT, LOCATION, USER, { document_type: "CCF" });
    expect(res.ok).toBe(true);

    const item = [...items.values()][0];
    expect(item.tax_amount).toBe(43.33); // 333.33 * 13% = 43.3329 → 43.33
    expect(item.line_total).toBe(376.66);

    // Product.tax_rate se LEE, nunca se escribe.
    expect(products.get(productId)!.tax_rate_pct).toBe(13);
  });
});

// ── Caso G ──────────────────────────────────────────────────────

describe("Caso G — Product.tax_rate nunca se modifica", () => {
  it("ningún flujo (A/E/F) escribe en el catálogo de productos", async () => {
    // product.update no está implementado en el fake — si algún flujo lo
    // llamara, el test fallaría con "product.update is not a function".
    expect((fakeDb.product as Record<string, unknown>).update).toBeUndefined();
  });
});

// ── Casos B/D/H — SERVICES + persona natural, persistencia y confirmación ──

describe("Casos B/D/H — SERVICES + NATURAL_PERSON, confirmación server-side", () => {
  it("confirmPurchase bloquea sin payment_nature definida (regla 1 del bloque)", async () => {
    const supplierId = seedSupplier("NATURAL_PERSON");
    const productId  = seedProduct({ is_stockable: false, tax_rate_pct: 13 });
    const purchaseId = await seedFsePurchaseWithItem(supplierId, productId, 1, 333.33, 0);

    const res = await confirmPurchase(purchaseId, TENANT, LOCATION, USER);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Naturaleza del pago/i);
    expect(purchases.get(purchaseId)!.status).toBe("DRAFT");
  });

  it("tras definir SERVICES, persiste base=333.33/rate=10/amount=33.33 y permite confirmar", async () => {
    const supplierId = seedSupplier("NATURAL_PERSON");
    const productId  = seedProduct({ is_stockable: false, tax_rate_pct: 13 });
    const purchaseId = await seedFsePurchaseWithItem(supplierId, productId, 1, 333.33, 0);

    const natureRes = await updatePurchasePaymentNature(purchaseId, TENANT, LOCATION, USER, {
      payment_nature: "SERVICES", manual_base: null,
    });
    expect(natureRes.ok).toBe(true);

    const afterNature = purchases.get(purchaseId)!;
    expect(afterNature.payment_nature).toBe("SERVICES");
    expect(afterNature.income_tax_withholding_applies).toBe(true);
    expect(afterNature.income_tax_withholding_base).toBe(333.33);
    expect(afterNature.income_tax_withholding_rate).toBe(10);
    expect(afterNature.income_tax_withholding_amount).toBe(33.33);

    const confirmRes = await confirmPurchase(purchaseId, TENANT, LOCATION, USER);
    expect(confirmRes.ok).toBe(true);

    const confirmed = purchases.get(purchaseId)!;
    expect(confirmed.status).toBe("CONFIRMED");
    // El snapshot fiscal persiste exactamente igual tras confirmar — el
    // builder FSE (generate-fse-json.service.ts, no tocado) consumirá esto.
    expect(confirmed.subtotal).toBe(333.33);
    expect(confirmed.tax_amount).toBe(0);
    expect(confirmed.total_amount).toBe(333.33);
    expect(confirmed.income_tax_withholding_amount).toBe(33.33);
    expect(confirmed.payment_nature).toBe("SERVICES"); // sigue persistido — no vuelve a "Sin definir"

    const netoFiscal = confirmed.subtotal
      - (confirmed.retention_1pct_applies ? confirmed.retention_1pct_amount : 0)
      - (confirmed.income_tax_withholding_applies ? confirmed.income_tax_withholding_amount : 0);
    expect(netoFiscal).toBe(300);
  });
});
