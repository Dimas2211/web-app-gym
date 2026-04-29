/**
 * prisma/seed-purchases-demo.ts
 *
 * Seed completo de demostración para commerce/purchases.
 * Ejecuta en orden: unidades → categorías → proveedores → productos → compras.
 *
 * Idempotente: puede correrse múltiples veces sin duplicar datos.
 * USO EXCLUSIVO: base local de desarrollo.
 *
 * Uso: npm run db:seed:purchases
 */

import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { resolveTestLocation } from "./seed-inventory-test-helpers";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════════
// 1. UNIDADES DE MEDIDA (globales — sin tenant)
// ══════════════════════════════════════════════════════════════════

const UNITS = [
  { symbol: "UND", name: "Unidad"     },
  { symbol: "KG",  name: "Kilogramo"  },
  { symbol: "LT",  name: "Litro"      },
  { symbol: "CJA", name: "Caja"       },
];

// ══════════════════════════════════════════════════════════════════
// 2. CATEGORÍAS DE PRODUCTO (por tenant)
// ══════════════════════════════════════════════════════════════════

const CATEGORIES = [
  { code: "EQUIP", name: "Equipamiento deportivo"  },
  { code: "NUTRI", name: "Nutrición y suplementos" },
  { code: "SUMIN", name: "Suministros generales"   },
];

// ══════════════════════════════════════════════════════════════════
// 3. PROVEEDORES DEMO (5 — por tenant)
// ══════════════════════════════════════════════════════════════════

const SUPPLIERS = [
  {
    supplier_code: "DIST-FIT-01",
    name:          "Distribuidora Fitness S.A.",
    taxpayer_type: "SMALL_TAXPAYER" as const,
    nrc:           "123456-7",
    nit:           "0614-020180-101-1",
    phone:         "2222-1001",
    email:         "ventas@distfitness.com.sv",
  },
  {
    supplier_code: "NUTRI-PRO-01",
    name:          "NutriPro El Salvador",
    taxpayer_type: "SMALL_TAXPAYER" as const,
    nrc:           "234567-8",
    nit:           "0614-150392-201-3",
    phone:         "2222-2002",
    email:         "pedidos@nutripro.com.sv",
  },
  {
    supplier_code: "MEDS-01",
    name:          "MedSport Centroamérica",
    taxpayer_type: "LARGE_TAXPAYER" as const,
    nrc:           "345678-9",
    nit:           "0614-010175-301-5",
    phone:         "2333-3003",
    email:         "comercial@medsport.com",
  },
  {
    supplier_code: "OFIC-MAX-01",
    name:          "OficinaMax",
    taxpayer_type: "NON_TAXPAYER" as const,
    nrc:           null,
    nit:           null,
    phone:         "2444-4004",
    email:         "contacto@oficinamax.com.sv",
  },
  {
    supplier_code: "LIMP-TOT-01",
    name:          "LimpiezaTotal S.A. de C.V.",
    taxpayer_type: "SMALL_TAXPAYER" as const,
    nrc:           "456789-0",
    nit:           "0614-220285-501-2",
    phone:         "2555-5005",
    email:         "ventas@limpiezatotal.com.sv",
  },
];

// ══════════════════════════════════════════════════════════════════
// 4. PRODUCTOS DEMO (10 — por tenant, necesitan category_id y unit_id)
// ══════════════════════════════════════════════════════════════════

// Definidos como función que recibe los IDs resueltos en runtime
interface ProductSeed {
  product_code:  string;
  name:          string;
  description:   string;
  product_type:  "PRODUCT" | "SERVICE";
  is_stockable:  boolean;
  allow_purchase: boolean;
  allow_sale:    boolean;
  categoryCode:  string;
  unitSymbol:    string;
  supplierCode:  string;
  cost_price:    number;
  sale_price:    number;
}

const PRODUCTS: ProductSeed[] = [
  {
    product_code:  "P001",
    name:          "Mancuerna hexagonal 10 kg",
    description:   "Par de mancuernas hexagonales de hierro fundido, 10 kg c/u.",
    product_type:  "PRODUCT",
    is_stockable:  true,
    allow_purchase: true,
    allow_sale:    true,
    categoryCode:  "EQUIP",
    unitSymbol:    "UND",
    supplierCode:  "DIST-FIT-01",
    cost_price:    28.00,
    sale_price:    45.00,
  },
  {
    product_code:  "P002",
    name:          "Cuerda de salto profesional",
    description:   "Cuerda de acero trenzado con mangos ergonómicos antideslizantes.",
    product_type:  "PRODUCT",
    is_stockable:  true,
    allow_purchase: true,
    allow_sale:    true,
    categoryCode:  "EQUIP",
    unitSymbol:    "UND",
    supplierCode:  "DIST-FIT-01",
    cost_price:    8.50,
    sale_price:    14.00,
  },
  {
    product_code:  "P003",
    name:          "Proteína Whey Vainilla 1 kg",
    description:   "Concentrado de proteína de suero, sabor vainilla, 25g proteína/servicio.",
    product_type:  "PRODUCT",
    is_stockable:  true,
    allow_purchase: true,
    allow_sale:    true,
    categoryCode:  "NUTRI",
    unitSymbol:    "KG",
    supplierCode:  "NUTRI-PRO-01",
    cost_price:    22.00,
    sale_price:    35.00,
  },
  {
    product_code:  "P004",
    name:          "Pre-workout energizante 300 g",
    description:   "Fórmula con cafeína, beta-alanina y citrulina. Sabor frutas tropicales.",
    product_type:  "PRODUCT",
    is_stockable:  true,
    allow_purchase: true,
    allow_sale:    true,
    categoryCode:  "NUTRI",
    unitSymbol:    "UND",
    supplierCode:  "NUTRI-PRO-01",
    cost_price:    15.00,
    sale_price:    25.00,
  },
  {
    product_code:  "P005",
    name:          "Venda elástica 6 cm × 5 m",
    description:   "Venda cohesiva elástica, latex-free, para muñecas y tobillos.",
    product_type:  "PRODUCT",
    is_stockable:  true,
    allow_purchase: true,
    allow_sale:    true,
    categoryCode:  "SUMIN",
    unitSymbol:    "UND",
    supplierCode:  "MEDS-01",
    cost_price:    1.80,
    sale_price:    3.00,
  },
  {
    product_code:  "P006",
    name:          "Botiquín primeros auxilios básico",
    description:   "Kit estándar con antisépticos, gasas, esparadrapo y vendas.",
    product_type:  "PRODUCT",
    is_stockable:  true,
    allow_purchase: true,
    allow_sale:    false,
    categoryCode:  "SUMIN",
    unitSymbol:    "UND",
    supplierCode:  "MEDS-01",
    cost_price:    12.00,
    sale_price:    0,
  },
  {
    product_code:  "P007",
    name:          "Resma papel bond A4 (500 hojas)",
    description:   "Papel bond blanco 75 g/m², tamaño A4, 500 hojas por resma.",
    product_type:  "PRODUCT",
    is_stockable:  true,
    allow_purchase: true,
    allow_sale:    false,
    categoryCode:  "SUMIN",
    unitSymbol:    "UND",
    supplierCode:  "OFIC-MAX-01",
    cost_price:    4.50,
    sale_price:    0,
  },
  {
    product_code:  "P008",
    name:          "Bolígrafos azules (caja × 12)",
    description:   "Bolígrafos de tinta azul de secado rápido, caja de 12 unidades.",
    product_type:  "PRODUCT",
    is_stockable:  true,
    allow_purchase: true,
    allow_sale:    false,
    categoryCode:  "SUMIN",
    unitSymbol:    "CJA",
    supplierCode:  "OFIC-MAX-01",
    cost_price:    3.20,
    sale_price:    0,
  },
  {
    product_code:  "P009",
    name:          "Desinfectante multiusos 1 L",
    description:   "Solución desinfectante concentrada de amplio espectro, apto para pisos y superficies.",
    product_type:  "PRODUCT",
    is_stockable:  true,
    allow_purchase: true,
    allow_sale:    false,
    categoryCode:  "SUMIN",
    unitSymbol:    "LT",
    supplierCode:  "LIMP-TOT-01",
    cost_price:    2.80,
    sale_price:    0,
  },
  {
    product_code:  "P010",
    name:          "Toalla microfibra 60 × 120 cm",
    description:   "Toalla deportiva de microfibra, absorción rápida, incluye bolsa de malla.",
    product_type:  "PRODUCT",
    is_stockable:  true,
    allow_purchase: true,
    allow_sale:    true,
    categoryCode:  "SUMIN",
    unitSymbol:    "UND",
    supplierCode:  "LIMP-TOT-01",
    cost_price:    5.50,
    sale_price:    9.00,
  },
];

// ══════════════════════════════════════════════════════════════════
// 5. COMPRAS DEMO (10 — por location, 2 meses)
// ══════════════════════════════════════════════════════════════════

interface PurchaseItemSeed {
  productCode: string;
  quantity:    number;
  unit_cost:   number;
  tax_amount:  number;
}

interface PurchaseSeed {
  year:          number;
  month:         number;
  day:           number;
  code:          string;
  status:        "DRAFT" | "CONFIRMED" | "CANCELLED";
  supplierCode:  string;
  notes?:        string;
  items:         PurchaseItemSeed[];
}

const PURCHASES: PurchaseSeed[] = [
  // ── Marzo 2026 ────────────────────────────────────────────────
  {
    year: 2026, month: 3, day: 3, code: "1",
    status: "CONFIRMED", supplierCode: "DIST-FIT-01",
    items: [
      { productCode: "P001", quantity: 10, unit_cost: 27.00, tax_amount: 35.10 },
      { productCode: "P002", quantity:  5, unit_cost:  8.50, tax_amount:  5.53 },
    ],
  },
  {
    year: 2026, month: 3, day: 8, code: "2",
    status: "CONFIRMED", supplierCode: "NUTRI-PRO-01",
    items: [
      { productCode: "P003", quantity: 20, unit_cost: 22.00, tax_amount: 57.20 },
      { productCode: "P004", quantity: 10, unit_cost: 15.00, tax_amount: 19.50 },
    ],
  },
  {
    year: 2026, month: 3, day: 15, code: "3",
    status: "DRAFT", supplierCode: "MEDS-01",
    notes: "Pendiente de aprobación por encargado de bodega.",
    items: [
      { productCode: "P005", quantity: 30, unit_cost: 1.80, tax_amount:  7.02 },
      { productCode: "P006", quantity:  3, unit_cost: 12.00, tax_amount:  4.68 },
    ],
  },
  {
    year: 2026, month: 3, day: 20, code: "4",
    status: "DRAFT", supplierCode: "OFIC-MAX-01",
    notes: "Reabastecimiento trimestral de oficina.",
    items: [
      { productCode: "P007", quantity: 5, unit_cost: 4.50, tax_amount: 2.93 },
      { productCode: "P008", quantity: 4, unit_cost: 3.20, tax_amount: 1.66 },
    ],
  },
  {
    year: 2026, month: 3, day: 28, code: "5",
    status: "CANCELLED", supplierCode: "LIMP-TOT-01",
    notes: "Proveedor no entregó en fecha acordada. Anulada.",
    items: [
      { productCode: "P009", quantity: 15, unit_cost: 2.80, tax_amount: 5.46 },
      { productCode: "P010", quantity: 10, unit_cost: 5.50, tax_amount: 7.15 },
    ],
  },

  // ── Abril 2026 ────────────────────────────────────────────────
  {
    year: 2026, month: 4, day: 2, code: "1",
    status: "CONFIRMED", supplierCode: "DIST-FIT-01",
    items: [
      { productCode: "P001", quantity: 8, unit_cost: 27.50, tax_amount: 28.60 },
      { productCode: "P002", quantity: 6, unit_cost:  8.50, tax_amount:  6.63 },
    ],
  },
  {
    year: 2026, month: 4, day: 7, code: "2",
    status: "CONFIRMED", supplierCode: "NUTRI-PRO-01",
    items: [
      { productCode: "P003", quantity: 15, unit_cost: 22.00, tax_amount: 42.90 },
      { productCode: "P004", quantity:  8, unit_cost: 15.00, tax_amount: 15.60 },
    ],
  },
  {
    year: 2026, month: 4, day: 10, code: "3",
    status: "DRAFT", supplierCode: "MEDS-01",
    items: [
      { productCode: "P005", quantity: 20, unit_cost: 1.80, tax_amount:  4.68 },
    ],
  },
  {
    year: 2026, month: 4, day: 15, code: "4",
    status: "DRAFT", supplierCode: "OFIC-MAX-01",
    notes: "En revisión con contador.",
    items: [
      { productCode: "P007", quantity: 10, unit_cost: 4.50, tax_amount: 5.85 },
      { productCode: "P008", quantity:  5, unit_cost: 3.20, tax_amount: 2.08 },
    ],
  },
  {
    year: 2026, month: 4, day: 18, code: "5",
    status: "DRAFT", supplierCode: "LIMP-TOT-01",
    items: [
      { productCode: "P009", quantity: 12, unit_cost: 2.80, tax_amount: 4.37 },
      { productCode: "P010", quantity:  6, unit_cost: 5.50, tax_amount: 4.29 },
    ],
  },
];

// ══════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n🏪 Seed completo de commerce/purchases\n");

  const { tenantId, locationId, locationName } = await resolveTestLocation(prisma);
  console.log(`  Location: ${locationName}\n`);

  // ── Resolver usuario de auditoría (primer super_admin del tenant) ─
  const sysUser = await prisma.user.findFirst({
    where:   { gym_id: tenantId, role: "super_admin", status: "active" },
    select:  { id: true },
    orderBy: { created_at: "asc" },
  });
  const createdBy = sysUser?.id ?? null;

  // ── 1. Unidades de medida ──────────────────────────────────────
  console.log("📐 Unidades de medida...");
  const unitMap = new Map<string, string>(); // symbol → id

  for (const u of UNITS) {
    const unit = await prisma.unitOfMeasure.upsert({
      where:  { symbol: u.symbol },
      update: { name: u.name },
      create: { symbol: u.symbol, name: u.name, status: "active" },
      select: { id: true, symbol: true },
    });
    unitMap.set(unit.symbol, unit.id);
    console.log(`  ✅ ${u.symbol} — ${u.name}`);
  }

  // ── 2. Categorías de producto ──────────────────────────────────
  console.log("\n📂 Categorías de producto...");
  const categoryMap = new Map<string, string>(); // code → id

  for (const c of CATEGORIES) {
    const cat = await prisma.productCategory.upsert({
      where:  { tenant_id_code: { tenant_id: tenantId, code: c.code } },
      update: { name: c.name },
      create: { tenant_id: tenantId, code: c.code, name: c.name, status: "active" },
      select: { id: true, code: true },
    });
    categoryMap.set(cat.code, cat.id);
    console.log(`  ✅ ${c.code} — ${c.name}`);
  }

  // ── 3. Proveedores ─────────────────────────────────────────────
  console.log("\n🏭 Proveedores...");
  const supplierMap = new Map<string, string>(); // supplier_code → id

  for (const s of SUPPLIERS) {
    const supplier = await prisma.supplier.upsert({
      where:  { tenant_id_supplier_code: { tenant_id: tenantId, supplier_code: s.supplier_code } },
      update: {
        name:          s.name,
        taxpayer_type: s.taxpayer_type,
        nrc:           s.nrc,
        nit:           s.nit,
        phone:         s.phone,
        email:         s.email,
        status:        "active",
      },
      create: {
        tenant_id:     tenantId,
        supplier_code: s.supplier_code,
        name:          s.name,
        taxpayer_type: s.taxpayer_type,
        nrc:           s.nrc ?? null,
        nit:           s.nit ?? null,
        phone:         s.phone,
        email:         s.email,
        status:        "active",
        created_by:    createdBy,
        updated_by:    createdBy,
      },
      select: { id: true, supplier_code: true },
    });
    supplierMap.set(supplier.supplier_code, supplier.id);
    console.log(`  ✅ ${s.supplier_code} — ${s.name}`);
  }

  // ── 4. Productos ───────────────────────────────────────────────
  console.log("\n📦 Productos...");
  const productMap = new Map<string, string>(); // product_code → id

  for (const p of PRODUCTS) {
    const category_id = categoryMap.get(p.categoryCode);
    const unit_id     = unitMap.get(p.unitSymbol);
    const supplier_id = supplierMap.get(p.supplierCode);

    if (!category_id || !unit_id) {
      console.error(`✗ Faltan referencias para producto ${p.product_code}`);
      process.exit(1);
    }

    const product = await prisma.product.upsert({
      where:  { tenant_id_product_code: { tenant_id: tenantId, product_code: p.product_code } },
      update: {
        name:           p.name,
        description:    p.description,
        status:         "ACTIVE",
        allow_purchase: p.allow_purchase,
        allow_sale:     p.allow_sale,
        is_stockable:   p.is_stockable,
        cost_price:     p.cost_price > 0 ? new Prisma.Decimal(p.cost_price) : null,
        sale_price:     p.sale_price > 0 ? new Prisma.Decimal(p.sale_price) : null,
        supplier_id:    supplier_id ?? null,
      },
      create: {
        tenant_id:      tenantId,
        product_code:   p.product_code,
        name:           p.name,
        description:    p.description,
        product_type:   p.product_type,
        status:         "ACTIVE",
        is_stockable:   p.is_stockable,
        allow_purchase: p.allow_purchase,
        allow_sale:     p.allow_sale,
        category_id,
        unit_id,
        supplier_id:    supplier_id ?? null,
        cost_price:     p.cost_price > 0 ? new Prisma.Decimal(p.cost_price) : null,
        sale_price:     p.sale_price > 0 ? new Prisma.Decimal(p.sale_price) : null,
        created_by:     createdBy,
        updated_by:     createdBy,
      },
      select: { id: true, product_code: true },
    });
    productMap.set(product.product_code, product.id);
    console.log(`  ✅ ${p.product_code} — ${p.name}`);
  }

  // ── 5. Compras ─────────────────────────────────────────────────
  console.log("\n🛒 Compras demo...");
  let created = 0;
  let skipped = 0;

  for (const p of PURCHASES) {
    const supplier_id = supplierMap.get(p.supplierCode);
    if (!supplier_id) {
      console.error(`✗ Proveedor no encontrado: ${p.supplierCode}`);
      process.exit(1);
    }

    // Verificar si ya existe
    const existing = await prisma.purchase.findUnique({
      where: {
        location_id_purchase_year_purchase_month_purchase_code: {
          location_id:    locationId,
          purchase_year:  p.year,
          purchase_month: p.month,
          purchase_code:  p.code,
        },
      },
      select: { id: true },
    });

    if (existing) {
      const monthStr = String(p.month).padStart(2, "0");
      console.log(`  ⏭  ${p.year}-${monthStr} #${p.code.padStart(2)} — ya existe`);
      skipped++;
      continue;
    }

    // Calcular totales desde líneas
    const lineItems = p.items.map((item) => {
      const product_id   = productMap.get(item.productCode);
      if (!product_id) throw new Error(`Producto no encontrado: ${item.productCode}`);
      const line_subtotal = item.quantity * item.unit_cost;
      const line_total    = line_subtotal + item.tax_amount;
      return { product_id, ...item, line_subtotal, line_total };
    });

    const subtotal     = lineItems.reduce((s, i) => s + i.line_subtotal, 0);
    const tax_amount   = lineItems.reduce((s, i) => s + i.tax_amount,    0);
    const total_amount = subtotal + tax_amount;

    const date = new Date(
      `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T12:00:00`,
    );

    const purchase = await prisma.purchase.create({
      data: {
        tenant_id:      tenantId,
        location_id:    locationId,
        supplier_id,
        purchase_code:  p.code,
        purchase_year:  p.year,
        purchase_month: p.month,
        purchase_date:  date,
        status:         p.status,
        notes:          p.notes ?? null,
        subtotal:       new Prisma.Decimal(subtotal),
        tax_amount:     new Prisma.Decimal(tax_amount),
        total_amount:   new Prisma.Decimal(total_amount),
        confirmed_at:   p.status === "CONFIRMED" ? date : null,
        cancelled_at:   p.status === "CANCELLED" ? date : null,
        created_by:     createdBy,
        updated_by:     createdBy,
      },
      select: { id: true },
    });

    // Crear líneas
    for (const item of lineItems) {
      await prisma.purchaseItem.create({
        data: {
          purchase_id:   purchase.id,
          product_id:    item.product_id,
          quantity:      item.quantity,
          unit_cost:     item.unit_cost,
          tax_amount:    new Prisma.Decimal(item.tax_amount),
          line_subtotal: new Prisma.Decimal(item.line_subtotal),
          line_total:    new Prisma.Decimal(item.line_total),
        },
      });
    }

    const statusLabel  = { DRAFT: "Borrador", CONFIRMED: "Confirmada", CANCELLED: "Anulada" }[p.status];
    const supplierName = SUPPLIERS.find((s) => s.supplier_code === p.supplierCode)!.name;
    const monthStr     = String(p.month).padStart(2, "0");
    console.log(
      `  ✅ ${p.year}-${monthStr} #${p.code.padStart(2)} — ${supplierName} — $${total_amount.toFixed(2)} — ${statusLabel} — ${lineItems.length} línea(s)`,
    );
    created++;
  }

  console.log(`\n  Resultado compras: ${created} creadas, ${skipped} omitidas\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
