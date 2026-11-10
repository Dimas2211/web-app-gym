/**
 * prisma/seed-sales-demo.ts
 *
 * Ventas CONFIRMADAS de demostración para ver reportes comerciales y el
 * "Resumen de hoy". Reparte ~3 ventas diarias en los últimos 90 días
 * (incluido hoy, hora de El Salvador) sobre los productos del seed de
 * compras, más dos servicios demo.
 *
 * - Solo escribe sales / sale_items (y los 2 servicios si faltan). NO mueve
 *   inventario ni caja ni genera DTE: son datos de visualización.
 * - Idempotente: si ya existen ventas marcadas DEMO_SALES_SEED, no hace nada.
 * - USO EXCLUSIVO: base local de desarrollo.
 *
 * - Barrera: aborta antes de crear el cliente si NODE_ENV=production, si
 *   corre en Vercel o si DATABASE_URL / DIRECT_URL no apuntan a un host local
 *   (ver local-only-database-guard.ts).
 *
 * Requisito: npm run db:seed:demo && npm run db:seed:purchases
 * Uso: npx tsx prisma/seed-sales-demo.ts
 */
import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { resolveTestLocation } from "./seed-inventory-test-helpers";
import { assertLocalOnlyDatabase } from "./local-only-database-guard";

// Antes de crear el PrismaClient y de la primera consulta/escritura.
assertLocalOnlyDatabase(process.env, "seed-sales-demo");

const prisma = new PrismaClient();

const DEMO_MARK = "DEMO_SALES_SEED";
const DAYS_BACK = 90;
const TAX_RATE = 13;

const DEMO_SERVICES = [
  { product_code: "S001", name: "Clase personalizada (sesión)", sale_price: 15 },
  { product_code: "S002", name: "Evaluación física", sale_price: 20 },
];

// PRNG determinista: mismas ventas en cada base nueva.
let seed = 20261109;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

const round2 = (n: number) => Math.round(n * 100) / 100;

function todayInElSalvador(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/El_Salvador",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${iso}T00:00:00.000Z`);
}

async function main() {
  console.log("\n🧾 Ventas demo (solo local)\n");
  const { tenantId, locationId, locationName } = await resolveTestLocation(prisma);
  console.log(`  Location: ${locationName}\n`);

  const existing = await prisma.sale.count({
    where: { tenant_id: tenantId, location_id: locationId, notes: DEMO_MARK },
  });
  if (existing > 0) {
    console.log(`  Ya existen ${existing} ventas demo. Nada que hacer.`);
    return;
  }

  const sysUser = await prisma.user.findFirst({
    where: { gym_id: tenantId, role: "super_admin", status: "active" },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  const userId = sysUser?.id ?? null;

  // Servicios demo (reutilizan categoría y unidad de un producto existente).
  const template = await prisma.product.findFirst({
    where: { tenant_id: tenantId },
    select: { category_id: true, unit_id: true },
  });
  if (!template) {
    console.error("✗ No hay productos. Ejecuta primero: npm run db:seed:purchases");
    process.exit(1);
  }
  for (const s of DEMO_SERVICES) {
    const found = await prisma.product.findFirst({
      where: { tenant_id: tenantId, product_code: s.product_code },
      select: { id: true },
    });
    if (!found) {
      await prisma.product.create({
        data: {
          tenant_id: tenantId,
          product_code: s.product_code,
          name: s.name,
          product_type: "SERVICE",
          status: "ACTIVE",
          is_stockable: false,
          allow_purchase: false,
          allow_sale: true,
          category_id: template.category_id,
          unit_id: template.unit_id,
          sale_price: new Prisma.Decimal(s.sale_price),
          created_by: userId,
        },
      });
    }
  }

  const products = await prisma.product.findMany({
    where: { tenant_id: tenantId, allow_sale: true, sale_price: { not: null } },
    select: { id: true, product_code: true, name: true, product_type: true, is_stockable: true, sale_price: true },
  });
  console.log(`  Productos vendibles: ${products.length}`);

  // Siguiente correlativo libre por (año, mes).
  const seqByMonth = new Map<string, number>();
  const nextSeq = async (year: number, month: number) => {
    const key = `${year}-${month}`;
    if (!seqByMonth.has(key)) {
      const max = await prisma.sale.aggregate({
        where: { tenant_id: tenantId, location_id: locationId, sale_year: year, sale_month: month },
        _max: { sale_sequence: true },
      });
      seqByMonth.set(key, max._max.sale_sequence ?? 0);
    }
    const n = seqByMonth.get(key)! + 1;
    seqByMonth.set(key, n);
    return n;
  };

  const today = todayInElSalvador();
  let created = 0;
  let grandTotal = 0;

  for (let daysAgo = DAYS_BACK; daysAgo >= 0; daysAgo--) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    const weekend = [0, 6].includes(date.getUTCDay());
    const salesToday = Math.max(1, Math.round((weekend ? 4 : 2.5) + rand() * 2 - 1));

    for (let i = 0; i < salesToday; i++) {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const seq = await nextSeq(year, month);
      const lineCount = 1 + Math.floor(rand() * 3);

      const lines = Array.from({ length: lineCount }, (_, idx) => {
        const p = pick(products);
        const quantity = p.product_type === "SERVICE" ? 1 : 1 + Math.floor(rand() * 3);
        const unitPrice = Number(p.sale_price);
        const subtotal = round2(quantity * unitPrice);
        const tax = round2((subtotal * TAX_RATE) / 100);
        return { p, idx, quantity, unitPrice, subtotal, tax, total: round2(subtotal + tax) };
      });
      const subtotal = round2(lines.reduce((a, l) => a + l.subtotal, 0));
      const tax = round2(lines.reduce((a, l) => a + l.tax, 0));
      const total = round2(subtotal + tax);
      const confirmedAt = new Date(date.getTime() + (14 + i) * 3600_000); // ~8:00 a.m. SV en adelante

      await prisma.sale.create({
        data: {
          tenant_id: tenantId,
          location_id: locationId,
          sale_code: `VTA-${year}-${String(month).padStart(2, "0")}-${String(seq).padStart(4, "0")}`,
          sale_year: year,
          sale_month: month,
          sale_sequence: seq,
          sale_date: date,
          status: "CONFIRMED",
          payment_status: "PAID",
          primary_dte_type_code: "01",
          subtotal: new Prisma.Decimal(subtotal),
          tax_amount: new Prisma.Decimal(tax),
          total_amount: new Prisma.Decimal(total),
          notes: DEMO_MARK,
          confirmed_at: confirmedAt,
          confirmed_by: userId,
          created_by: userId,
          created_at: confirmedAt,
          items: {
            create: lines.map((l) => ({
              product_id: l.p.id,
              line_number: l.idx + 1,
              product_code_snapshot: l.p.product_code,
              product_name_snapshot: l.p.name,
              product_type_snapshot: l.p.product_type,
              is_stockable_snapshot: l.p.is_stockable,
              quantity: new Prisma.Decimal(l.quantity),
              unit_price: new Prisma.Decimal(l.unitPrice),
              tax_rate_snapshot: new Prisma.Decimal(TAX_RATE),
              tax_amount: new Prisma.Decimal(l.tax),
              line_subtotal: new Prisma.Decimal(l.subtotal),
              line_total: new Prisma.Decimal(l.total),
            })),
          },
        },
      });
      created++;
      grandTotal += total;
    }
  }

  console.log(`  ✅ ${created} ventas confirmadas creadas — total $${grandTotal.toFixed(2)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
