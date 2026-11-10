/**
 * prisma/showcase/seed-showcase-commerce.ts
 *
 * Empresa de vitrina para las capturas Commerce de la landing:
 * "Ferretería El Roble" — 3 sucursales, catálogo ferretero, ~95 días de
 * operación coherente (compras → inventario → ventas → caja → DTE).
 *
 * - Escribe solo en una base local `zolvi_showcase*` (ver showcase-shared.ts).
 * - Datos ficticios: NIT/NRC/DUI, correos y teléfonos inventados.
 * - Los DTE son registros de visualización: no se firman ni transmiten, no hay
 *   DteCredential en esta base. Nunca usar esta base fuera de local.
 * - El inventario se construye con movimientos (INITIAL_LOAD, PURCHASE_IN,
 *   SALE_OUT) cronológicos; current_stock = saldo del último movimiento.
 * - No es idempotente por diseño: si el tenant ya existe, aborta. Para
 *   regenerar: npm run showcase:setup (recrea la base).
 *
 * Uso: ver package.json → "showcase:seed:commerce".
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma, type UserRole, type DteOutgoingStatus } from "@prisma/client";
import { ensureCommerceTenantBaseline } from "../../src/modules/platform/lib/provisioning/ensure-commerce-tenant-baseline";
import {
  assertShowcaseDatabase,
  createRandom,
  round2,
  todayInElSalvador,
  addDays,
  atLocalTime,
  currentLocalHour,
  DEMO_PASSWORD,
} from "./showcase-shared";

assertShowcaseDatabase("seed-showcase-commerce");

const prisma = new PrismaClient();
const R = createRandom(20261110);
const D = (n: number) => new Prisma.Decimal(n);

const TENANT = { name: "Ferretería El Roble", slug: "ferreteria-el-roble" };
const DAYS_BACK = 95;
const TAX = 13;

const BRANCHES = [
  { key: "MAT", name: "Casa Matriz — San Salvador", address: "Calle Arce y 19 Av. Norte, San Salvador", phone: "2221-4580", weight: 1.0, estab: "M001" },
  { key: "STT", name: "Sucursal Santa Tecla", address: "4a Calle Poniente #12, Santa Tecla, La Libertad", phone: "2288-3175", weight: 0.72, estab: "S001" },
  { key: "SMG", name: "Sucursal San Miguel", address: "Av. Roosevelt Sur #305, San Miguel", phone: "2661-9042", weight: 0.55, estab: "S002" },
] as const;
type BranchKey = (typeof BRANCHES)[number]["key"];

const USERS: { email: string; first: string; last: string; role: UserRole; branch?: BranchKey }[] = [
  { email: "gerencia@elroble.demo", first: "Andrea", last: "Martínez", role: "super_admin" },
  { email: "admin.matriz@elroble.demo", first: "Carlos", last: "Rivas", role: "branch_admin", branch: "MAT" },
  { email: "admin.tecla@elroble.demo", first: "Gabriela", last: "Portillo", role: "branch_admin", branch: "STT" },
  { email: "admin.sanmiguel@elroble.demo", first: "José", last: "Ventura", role: "branch_admin", branch: "SMG" },
  { email: "caja.matriz@elroble.demo", first: "Karla", last: "Henríquez", role: "reception", branch: "MAT" },
  { email: "caja.tecla@elroble.demo", first: "Luis", last: "Alvarado", role: "reception", branch: "STT" },
  { email: "caja.sanmiguel@elroble.demo", first: "Daniela", last: "Romero", role: "reception", branch: "SMG" },
];

const CATEGORIES = [
  { code: "HER", name: "Herramientas" },
  { code: "CON", name: "Construcción" },
  { code: "ELE", name: "Electricidad" },
  { code: "PLO", name: "Plomería" },
  { code: "PIN", name: "Pinturas" },
  { code: "FIJ", name: "Tornillería y fijación" },
  { code: "JAR", name: "Jardinería" },
  { code: "SER", name: "Servicios" },
];

const SUPPLIERS = [
  { code: "PRV-001", name: "Distribuidora Centroamericana de Herramientas", legal: "Distribuidora Centroamericana de Herramientas, S.A. de C.V.", type: "LARGE_TAXPAYER", nit: "0614-210898-103-5", nrc: "104528-3", activity: "Venta al por mayor de artículos de ferretería", contact: "Roberto Mejía", phone: "2260-7781", email: "ventas@dicenher.demo", cats: ["HER", "JAR", "FIJ"] },
  { code: "PRV-002", name: "Cementos y Agregados del Pacífico", legal: "Cementos y Agregados del Pacífico, S.A. de C.V.", type: "LARGE_TAXPAYER", nit: "0614-030305-101-8", nrc: "158230-1", activity: "Venta al por mayor de materiales de construcción", contact: "Marta Guevara", phone: "2207-4410", email: "pedidos@cemapac.demo", cats: ["CON"] },
  { code: "PRV-003", name: "Eléctrica Industrial Salvadoreña", legal: "Eléctrica Industrial Salvadoreña, S.A. de C.V.", type: "SMALL_TAXPAYER", nit: "0614-160710-102-4", nrc: "201457-9", activity: "Venta al por mayor de material eléctrico", contact: "Héctor Lemus", phone: "2273-1956", email: "ventas@elindsa.demo", cats: ["ELE"] },
  { code: "PRV-004", name: "Pinturas Volcán", legal: "Pinturas Volcán, S.A. de C.V.", type: "SMALL_TAXPAYER", nit: "0511-120612-101-0", nrc: "214806-5", activity: "Fabricación de pinturas y barnices", contact: "Sonia Arévalo", phone: "2229-5032", email: "distribucion@pinturasvolcan.demo", cats: ["PIN"] },
  { code: "PRV-005", name: "Tubos y Conexiones de Oriente", legal: "Tubos y Conexiones de Oriente, S.A. de C.V.", type: "SMALL_TAXPAYER", nit: "1217-250514-101-6", nrc: "229930-4", activity: "Venta al por mayor de artículos de plomería", contact: "Óscar Granados", phone: "2669-2184", email: "ventas@tubcoriente.demo", cats: ["PLO"] },
] as const;

type ProductSeed = {
  code: string; name: string; cat: string; brand?: string; unit: string;
  cost: number; price: number; service?: boolean;
  /** popularidad relativa en ventas */ pop: number;
  /** cantidad típica por línea [min, max] */ qty: [number, number];
  /** stock objetivo por sucursal (Casa Matriz; otras escalan por peso) */ target: number;
};

const PRODUCTS: ProductSeed[] = [
  // Herramientas
  { code: "HER-001", name: "Martillo de uña 16 oz mango de fibra", cat: "HER", brand: "Truper", unit: "und", cost: 5.2, price: 8.95, pop: 5, qty: [1, 2], target: 40 },
  { code: "HER-002", name: "Desarmador de cruz #2 x 6\"", cat: "HER", brand: "Stanley", unit: "und", cost: 1.9, price: 3.5, pop: 5, qty: [1, 3], target: 60 },
  { code: "HER-003", name: "Juego de llaves combinadas 12 piezas", cat: "HER", brand: "Truper", unit: "und", cost: 18.5, price: 29.9, pop: 2, qty: [1, 1], target: 15 },
  { code: "HER-004", name: "Cinta métrica 8 m", cat: "HER", brand: "Stanley", unit: "und", cost: 6.1, price: 10.5, pop: 4, qty: [1, 2], target: 35 },
  { code: "HER-005", name: "Taladro percutor 1/2\" 650 W", cat: "HER", brand: "Truper", unit: "und", cost: 38, price: 62, pop: 1.5, qty: [1, 1], target: 10 },
  { code: "HER-006", name: "Esmeriladora angular 4-1/2\" 820 W", cat: "HER", brand: "Truper", unit: "und", cost: 32.5, price: 54.9, pop: 1.2, qty: [1, 1], target: 8 },
  { code: "HER-007", name: "Nivel de aluminio 24\"", cat: "HER", brand: "Pretul", unit: "und", cost: 4.8, price: 8.5, pop: 2, qty: [1, 1], target: 20 },
  { code: "HER-008", name: "Alicate universal 8\"", cat: "HER", brand: "Truper", unit: "und", cost: 4.3, price: 7.75, pop: 3, qty: [1, 2], target: 30 },
  { code: "HER-009", name: "Juego de brocas para concreto 5 piezas", cat: "HER", brand: "Truper", unit: "und", cost: 4.9, price: 8.9, pop: 3, qty: [1, 2], target: 30 },
  // Construcción
  { code: "CON-001", name: "Cemento gris tipo GU bolsa 42.5 kg", cat: "CON", unit: "und", cost: 7.4, price: 9.25, pop: 14, qty: [2, 25], target: 600 },
  { code: "CON-002", name: "Hierro corrugado 3/8\" x 6 m", cat: "CON", unit: "und", cost: 3.1, price: 4.25, pop: 9, qty: [4, 40], target: 800 },
  { code: "CON-003", name: "Bloque de concreto 15 x 20 x 40 cm", cat: "CON", unit: "und", cost: 0.48, price: 0.7, pop: 7, qty: [20, 250], target: 5000 },
  { code: "CON-004", name: "Alambre de amarre galvanizado", cat: "CON", unit: "lb", cost: 0.65, price: 1.1, pop: 6, qty: [2, 15], target: 400 },
  { code: "CON-005", name: "Clavo de acero 2-1/2\"", cat: "CON", unit: "lb", cost: 0.85, price: 1.4, pop: 7, qty: [1, 10], target: 350 },
  { code: "CON-006", name: "Pegamento para cerámica bolsa 20 kg", cat: "CON", unit: "und", cost: 4.2, price: 6.75, pop: 4, qty: [2, 12], target: 150 },
  { code: "CON-007", name: "Cerámica de piso 45 x 45 cm beige", cat: "CON", unit: "m²", cost: 6.8, price: 10.95, pop: 3, qty: [5, 40], target: 500 },
  // Electricidad
  { code: "ELE-001", name: "Cable eléctrico THHN #12", cat: "ELE", unit: "m", cost: 0.38, price: 0.65, pop: 8, qty: [5, 100], target: 2500 },
  { code: "ELE-002", name: "Tomacorriente doble polarizado", cat: "ELE", brand: "Volteck", unit: "und", cost: 1.4, price: 2.75, pop: 6, qty: [1, 6], target: 120 },
  { code: "ELE-003", name: "Interruptor sencillo", cat: "ELE", brand: "Volteck", unit: "und", cost: 1.05, price: 2.1, pop: 5, qty: [1, 6], target: 120 },
  { code: "ELE-004", name: "Foco LED 9 W luz blanca", cat: "ELE", brand: "Volteck", unit: "und", cost: 1.1, price: 2.25, pop: 7, qty: [1, 10], target: 200 },
  { code: "ELE-005", name: "Caja octogonal metálica 4\"", cat: "ELE", unit: "und", cost: 0.55, price: 1.05, pop: 4, qty: [2, 12], target: 150 },
  { code: "ELE-006", name: "Breaker 1 polo 20 A", cat: "ELE", unit: "und", cost: 4.1, price: 7.5, pop: 3, qty: [1, 3], target: 50 },
  { code: "ELE-007", name: "Cinta de aislar negra 18 m", cat: "ELE", brand: "Truper", unit: "und", cost: 0.45, price: 0.95, pop: 6, qty: [1, 4], target: 150 },
  // Plomería
  { code: "PLO-001", name: "Tubo PVC 1/2\" x 6 m SDR 13.5", cat: "PLO", unit: "und", cost: 2.6, price: 4.2, pop: 7, qty: [1, 12], target: 250 },
  { code: "PLO-002", name: "Codo PVC 1/2\" x 90°", cat: "PLO", unit: "und", cost: 0.12, price: 0.3, pop: 6, qty: [2, 20], target: 600 },
  { code: "PLO-003", name: "Llave de chorro 1/2\" de bronce", cat: "PLO", brand: "Foset", unit: "und", cost: 3.8, price: 6.5, pop: 3, qty: [1, 2], target: 40 },
  { code: "PLO-004", name: "Pegamento para PVC 1/4 gal", cat: "PLO", unit: "und", cost: 4.6, price: 7.8, pop: 3, qty: [1, 2], target: 40 },
  { code: "PLO-005", name: "Inodoro de dos piezas blanco", cat: "PLO", unit: "und", cost: 48, price: 79, pop: 0.8, qty: [1, 1], target: 8 },
  { code: "PLO-006", name: "Cinta teflón 1/2\"", cat: "PLO", brand: "Foset", unit: "und", cost: 0.18, price: 0.45, pop: 5, qty: [1, 5], target: 200 },
  { code: "PLO-007", name: "Tanque para agua 1,100 L", cat: "PLO", unit: "und", cost: 85, price: 129, pop: 0.5, qty: [1, 1], target: 5 },
  // Pinturas
  { code: "PIN-001", name: "Pintura látex blanco 1 gal", cat: "PIN", unit: "gal", cost: 9.8, price: 15.9, pop: 5, qty: [1, 4], target: 80 },
  { code: "PIN-002", name: "Pintura látex blanco cubeta 5 gal", cat: "PIN", unit: "und", cost: 42, price: 66.5, pop: 2, qty: [1, 2], target: 20 },
  { code: "PIN-003", name: "Pintura anticorrosiva gris 1 gal", cat: "PIN", unit: "gal", cost: 11.5, price: 18.75, pop: 2, qty: [1, 2], target: 30 },
  { code: "PIN-004", name: "Brocha de 3\"", cat: "PIN", unit: "und", cost: 1.2, price: 2.4, pop: 4, qty: [1, 3], target: 80 },
  { code: "PIN-005", name: "Rodillo de 9\" con felpa", cat: "PIN", unit: "und", cost: 2.6, price: 4.95, pop: 3, qty: [1, 2], target: 50 },
  { code: "PIN-006", name: "Thinner 1 gal", cat: "PIN", unit: "gal", cost: 4.9, price: 7.9, pop: 3, qty: [1, 2], target: 50 },
  // Tornillería y fijación
  { code: "FIJ-001", name: "Tornillo para tablayeso 1\" (ciento)", cat: "FIJ", unit: "cto", cost: 0.9, price: 1.75, pop: 4, qty: [1, 5], target: 150 },
  { code: "FIJ-002", name: "Ancla plástica 1/4\" (ciento)", cat: "FIJ", unit: "cto", cost: 0.8, price: 1.6, pop: 3, qty: [1, 4], target: 120 },
  { code: "FIJ-003", name: "Perno hexagonal galvanizado 3/8\" x 2\"", cat: "FIJ", unit: "und", cost: 0.22, price: 0.45, pop: 3, qty: [2, 20], target: 400 },
  { code: "FIJ-004", name: "Candado de latón 40 mm", cat: "FIJ", brand: "Truper", unit: "und", cost: 3.4, price: 6.25, pop: 2, qty: [1, 2], target: 30 },
  // Jardinería
  { code: "JAR-001", name: "Manguera reforzada 1/2\" x 15 m", cat: "JAR", brand: "Truper", unit: "und", cost: 7.5, price: 12.9, pop: 2, qty: [1, 1], target: 25 },
  { code: "JAR-002", name: "Carretilla de concreto 5 pies³", cat: "JAR", brand: "Truper", unit: "und", cost: 34, price: 54, pop: 1, qty: [1, 1], target: 8 },
  { code: "JAR-003", name: "Machete 22\" mango de plástico", cat: "JAR", brand: "Truper", unit: "und", cost: 3.4, price: 5.95, pop: 2, qty: [1, 2], target: 30 },
  { code: "JAR-004", name: "Pala cuadrada mango de madera", cat: "JAR", brand: "Pretul", unit: "und", cost: 6.2, price: 10.5, pop: 2, qty: [1, 2], target: 25 },
  // Servicios
  { code: "SER-001", name: "Corte y roscado de tubo", cat: "SER", unit: "und", cost: 0, price: 1.5, service: true, pop: 1.5, qty: [1, 4], target: 0 },
  { code: "SER-002", name: "Entrega a domicilio zona metropolitana", cat: "SER", unit: "und", cost: 0, price: 5, service: true, pop: 2, qty: [1, 1], target: 0 },
  { code: "SER-003", name: "Igualación de color de pintura", cat: "SER", unit: "und", cost: 0, price: 2, service: true, pop: 0.8, qty: [1, 1], target: 0 },
];

/** Productos que se dejan bajo mínimo al final (alertas visibles en Inventario). */
const LOW_STOCK_AT_END: [BranchKey, string][] = [
  ["MAT", "HER-005"],
  ["MAT", "PIN-002"],
  ["STT", "ELE-006"],
  ["STT", "CON-006"],
  ["SMG", "PLO-003"],
];

const CUSTOMERS = [
  { name: "Constructora Los Pinos", legal: "Constructora Los Pinos, S.A. de C.V.", taxpayer: "REGISTERED_TAXPAYER", nit: "0614-110415-102-7", nrc: "245117-0", activity: "Construcción de edificios residenciales", phone: "2243-8810", email: "compras@lospinos.demo", w: 6 },
  { name: "Inversiones Ramírez Molina", legal: "Inversiones Ramírez Molina, S.A. de C.V.", taxpayer: "REGISTERED_TAXPAYER", nit: "0614-070219-101-3", nrc: "268442-6", activity: "Alquiler de bienes inmuebles", phone: "2264-1022", email: "administracion@irm.demo", w: 3 },
  { name: "Taller Mecánico Hernández", legal: "Mario Ernesto Hernández Cruz", taxpayer: "REGISTERED_TAXPAYER", nit: "0614-140580-105-2", nrc: "187455-2", activity: "Reparación de vehículos automotores", phone: "7745-2190", email: "tallerhernandez@correo.demo", w: 2 },
  { name: "Colegio San Rafael", legal: "Asociación Educativa San Rafael", taxpayer: "REGISTERED_TAXPAYER", nit: "0511-200301-101-4", nrc: "132907-8", activity: "Enseñanza secundaria", phone: "2228-6604", email: "mantenimiento@sanrafael.demo", w: 2 },
  { name: "Remodelaciones Flores & Asociados", legal: "Remodelaciones Flores & Asociados, S.A. de C.V.", taxpayer: "REGISTERED_TAXPAYER", nit: "0614-290921-103-1", nrc: "301264-9", activity: "Terminación y acabado de edificios", phone: "7921-4408", email: "proyectos@rfa.demo", w: 4 },
  { name: "Agroservicio El Cafetal", legal: "Agroservicio El Cafetal, S.A. de C.V.", taxpayer: "REGISTERED_TAXPAYER", nit: "1217-180316-102-5", nrc: "254071-3", activity: "Venta al por menor de insumos agropecuarios", phone: "2661-7735", email: "elcafetal@correo.demo", w: 2 },
  { name: "Hotel Brisas de Oriente", legal: "Brisas de Oriente, S.A. de C.V.", taxpayer: "REGISTERED_TAXPAYER", nit: "1217-020612-101-9", nrc: "219384-0", activity: "Actividades de alojamiento", phone: "2660-4471", email: "mantenimiento@brisasoriente.demo", w: 2 },
  { name: "María José Castillo", taxpayer: "FINAL_CONSUMER", dui: "04815237-6", phone: "7012-5543", w: 1 },
  { name: "Ricardo Antonio Pérez", taxpayer: "FINAL_CONSUMER", dui: "03920471-1", phone: "7688-0219", w: 1 },
  { name: "Ana Lucía Rodríguez", taxpayer: "FINAL_CONSUMER", dui: "05127704-3", phone: "7590-3348", w: 1 },
  { name: "Fernando Alberto Quintanilla", taxpayer: "FINAL_CONSUMER", dui: "02648115-9", phone: "7311-8862", w: 1 },
  { name: "Claudia Beatriz Menjívar", taxpayer: "FINAL_CONSUMER", dui: "04471039-0", phone: "7845-1127", w: 1 },
  { name: "Jorge Luis Aguilar", taxpayer: "FINAL_CONSUMER", dui: "01937726-4", phone: "7266-4095", w: 1 },
  { name: "Silvia Carolina Orellana", taxpayer: "FINAL_CONSUMER", dui: "05530192-8", phone: "7409-6631", w: 1 },
] as const;

const PAYMENT_FORMS = [
  { value: "01", weight: 58 }, // efectivo
  { value: "02", weight: 22 }, // tarjeta de débito
  { value: "03", weight: 12 }, // tarjeta de crédito
  { value: "05", weight: 8 }, // transferencia
];

const rnd = (len: number) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () => chars[R.int(0, chars.length - 1)]).join("");
};

async function main() {
  console.log("\n🧱 Showcase Commerce — Ferretería El Roble\n");

  if (await prisma.runtimeTenant.findUnique({ where: { slug: TENANT.slug } })) {
    console.error("✗ El tenant de vitrina ya existe. Recree la base con: npm run showcase:setup");
    process.exit(1);
  }

  // ── Tenant, sucursales, usuarios ─────────────────────────────────
  const tenant = await prisma.runtimeTenant.create({ data: TENANT });
  const T = tenant.id;
  const branchId = {} as Record<BranchKey, string>;
  for (const b of BRANCHES) {
    const row = await prisma.branch.create({
      data: { tenant_id: T, name: b.name, address: b.address, phone: b.phone },
    });
    branchId[b.key] = row.id;
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userId = {} as Record<string, string>;
  for (const u of USERS) {
    const row = await prisma.user.create({
      data: {
        tenant_id: T,
        email: u.email,
        password_hash: hash,
        first_name: u.first,
        last_name: u.last,
        role: u.role,
        branch_id: u.branch ? branchId[u.branch] : null,
        location_id: u.branch ? branchId[u.branch] : null,
      },
    });
    userId[u.email] = row.id;
  }
  const admin = userId["gerencia@elroble.demo"];
  const cashierOf = (k: BranchKey) =>
    userId[{ MAT: "caja.matriz@elroble.demo", STT: "caja.tecla@elroble.demo", SMG: "caja.sanmiguel@elroble.demo" }[k]];
  const branchAdminOf = (k: BranchKey) =>
    userId[{ MAT: "admin.matriz@elroble.demo", STT: "admin.tecla@elroble.demo", SMG: "admin.sanmiguel@elroble.demo" }[k]];

  // ── Organización Platform (Commerce-only, sin vertical) ──────────
  const plan = await prisma.platformPlan.findUnique({ where: { code: "professional" } });
  const org = await prisma.platformOrganization.create({
    data: {
      code: TENANT.slug,
      name: TENANT.name,
      legal_name: "Ferretería El Roble, S.A. de C.V.",
      tenant_id: T,
      plan_id: plan?.id ?? null,
      status: "ACTIVE",
      license_status: "ACTIVE",
      provisioning_status: "PROVISIONED",
      country_code: "SV",
      timezone: "America/El_Salvador",
    },
  });
  const moduleCodes = [
    "core.users", "core.roles", "core.locations", "core.customers",
    "commerce.products", "commerce.inventory", "commerce.suppliers",
    "commerce.purchases", "commerce.sales", "commerce.cash", "fiscal.dte",
  ];
  const modules = await prisma.platformModule.findMany({ where: { code: { in: moduleCodes } } });
  await prisma.platformOrganizationModule.createMany({
    data: modules.map((m) => ({ organization_id: org.id, module_id: m.id, is_active: true })),
  });
  await prisma.platformBranding.create({ data: { organization_id: org.id } });

  // ── Baseline Commerce (IVA 13 %, categoría GENERAL, config fiscal) ──
  await prisma.$transaction((tx) => ensureCommerceTenantBaseline(tx, T));
  const iva = await prisma.taxRate.findFirstOrThrow({ where: { tenant_id: T, rate: 13 } });

  // ── Categorías, unidades, proveedores ────────────────────────────
  const catId: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const row = await prisma.productCategory.create({ data: { tenant_id: T, code: c.code, name: c.name } });
    catId[c.code] = row.id;
  }
  const units = await prisma.unitOfMeasure.findMany({ select: { id: true, symbol: true } });
  const unitId = Object.fromEntries(units.map((u) => [u.symbol, u.id]));

  const supplierId: Record<string, string> = {};
  const supplierForCat: Record<string, string> = {};
  for (const s of SUPPLIERS) {
    const row = await prisma.supplier.create({
      data: {
        tenant_id: T,
        supplier_code: s.code,
        name: s.name,
        legal_name: s.legal,
        taxpayer_type: s.type,
        id_type_code: "36",
        nit: s.nit,
        nrc: s.nrc,
        activity_name: s.activity,
        country_code: "SV",
        country_name: "El Salvador",
        contact_name: s.contact,
        contact_role: "Ejecutivo de ventas",
        phone: s.phone,
        email: s.email,
        person_type: "LEGAL_ENTITY",
        created_by: admin,
      },
    });
    supplierId[s.code] = row.id;
    for (const c of s.cats) supplierForCat[c] = s.code;
  }

  // ── Productos ────────────────────────────────────────────────────
  const productId: Record<string, string> = {};
  for (const p of PRODUCTS) {
    const row = await prisma.product.create({
      data: {
        tenant_id: T,
        product_code: p.code,
        name: p.name,
        product_type: p.service ? "SERVICE" : "PRODUCT",
        is_stockable: !p.service,
        allow_purchase: !p.service,
        allow_sale: true,
        category_id: catId[p.cat],
        brand: p.brand ?? null,
        unit_id: unitId[p.unit] ?? unitId["und"],
        supplier_id: p.service ? null : supplierId[supplierForCat[p.cat]],
        sku: p.service ? null : `7401${p.code.replace("-", "")}`,
        cost_price: p.service ? null : D(p.cost),
        sale_price: D(p.price),
        tax_rate_id: iva.id,
        created_by: admin,
      },
    });
    productId[p.code] = row.id;
  }
  const stockables = PRODUCTS.filter((p) => !p.service);

  // ── Clientes fiscales ────────────────────────────────────────────
  const customerIds: { id: string; taxpayer: string; w: number }[] = [];
  let ci = 0;
  for (const c of CUSTOMERS) {
    ci++;
    const row = await prisma.customer.create({
      data: {
        tenant_id: T,
        customer_code: `CLI-${String(ci).padStart(4, "0")}`,
        name: c.name,
        legal_name: "legal" in c ? c.legal : null,
        taxpayer_type: c.taxpayer,
        id_type_code: "nit" in c ? "36" : "13",
        nit: "nit" in c ? c.nit : null,
        nrc: "nrc" in c ? c.nrc : null,
        dui: "dui" in c ? c.dui : null,
        activity_name: "activity" in c ? c.activity : null,
        phone: c.phone,
        email: "email" in c ? c.email : null,
        created_by: admin,
      },
    });
    customerIds.push({ id: row.id, taxpayer: c.taxpayer, w: c.w });
  }

  // ── Cajas y emisor DTE por sucursal ──────────────────────────────
  const registerId = {} as Record<BranchKey, string>;
  for (const b of BRANCHES) {
    const reg = await prisma.cashRegister.create({
      data: { tenant_id: T, location_id: branchId[b.key], code: "CAJA-01", name: "Caja principal", created_by: admin },
    });
    registerId[b.key] = reg.id;
    await prisma.dteIssuerConfig.create({
      data: {
        tenant_id: T,
        location_id: branchId[b.key],
        environment: "PRODUCTION",
        nit: "0614-050817-101-2",
        nrc: "263018-4",
        name: TENANT.name,
        legal_name: "Ferretería El Roble, S.A. de C.V.",
        activity_name: "Venta al por menor de artículos de ferretería",
        establishment_code: b.estab,
        establishment_type_code: b.key === "MAT" ? "02" : "01",
        point_of_sale_code: "P001",
        cod_estable_mh: b.estab,
        cod_punto_venta_mh: "P001",
        address_complement: b.address,
        phone: b.phone,
        email: "facturacion@elroble.demo",
        created_by: admin,
      },
    });
  }

  // ═════════════════════════════════════════════════════════════════
  // Simulación cronológica: compras → inventario → ventas → caja → DTE
  // ═════════════════════════════════════════════════════════════════
  const today = todayInElSalvador();
  const nowHour = currentLocalHour();
  const start = addDays(today, -DAYS_BACK);

  type PL = { id: string; stock: number; min: number; target: number };
  const pl = new Map<string, PL>(); // `${branch}|${code}`
  const plRows: Prisma.ProductLocationCreateManyInput[] = [];
  const movements: Prisma.InventoryMovementCreateManyInput[] = [];
  const shelves = ["A", "B", "C", "D", "E"];

  const move = (
    b: BranchKey, code: string, type: "INITIAL_LOAD" | "PURCHASE_IN" | "SALE_OUT",
    qty: number, at: Date, ref: { entity: string; id: string; code: string } | null, by: string, unitCost?: number,
  ) => {
    const row = pl.get(`${b}|${code}`)!;
    const before = row.stock;
    row.stock = type === "SALE_OUT" ? before - qty : before + qty;
    movements.push({
      id: randomUUID(),
      tenant_id: T,
      location_id: branchId[b],
      product_id: productId[code],
      product_location_id: row.id,
      movement_type: type,
      quantity: D(qty),
      unit_cost: unitCost !== undefined ? D(unitCost) : null,
      stock_before: D(before),
      resulting_stock: D(row.stock),
      reference_entity: ref?.entity ?? null,
      reference_id: ref?.id ?? null,
      reference_code: ref?.code ?? null,
      notes: type === "INITIAL_LOAD" ? "Carga inicial de inventario" : null,
      performed_by: by,
      created_at: at,
    });
  };

  for (const b of BRANCHES) {
    for (const p of stockables) {
      const target = Math.max(3, Math.round(p.target * b.weight));
      const id = randomUUID();
      pl.set(`${b.key}|${p.code}`, { id, stock: 0, min: Math.max(2, Math.round(target * 0.25)), target });
      plRows.push({
        id,
        tenant_id: T,
        location_id: branchId[b.key],
        product_id: productId[p.code],
        min_stock: D(Math.max(2, Math.round(target * 0.25))),
        reorder_quantity: D(Math.round(target * 0.75)),
        warehouse: b.key === "MAT" ? "Bodega central" : "Bodega sala",
        shelf: `${shelves[CATEGORIES.findIndex((c) => c.code === p.cat) % shelves.length]}${R.int(1, 6)}`,
        position: `N${R.int(1, 4)}`,
        created_by: admin,
        created_at: atLocalTime(start, 7),
      });
      move(b.key, p.code, "INITIAL_LOAD", Math.round(target * (0.7 + R.rand() * 0.3)), atLocalTime(start, 7, 30), null, admin, p.cost);
    }
  }

  const purchases: Prisma.PurchaseCreateManyInput[] = [];
  const purchaseItems: Prisma.PurchaseItemCreateManyInput[] = [];
  const sales: Prisma.SaleCreateManyInput[] = [];
  const saleItems: Prisma.SaleItemCreateManyInput[] = [];
  const payments: Prisma.SalePaymentCreateManyInput[] = [];
  const dtes: Prisma.DteOutgoingDocumentCreateManyInput[] = [];
  const sessions: Prisma.CashSessionCreateManyInput[] = [];
  const cashMoves: Prisma.CashMovementCreateManyInput[] = [];

  const purchaseSeq = new Map<string, number>();
  const saleSeq = new Map<string, number>();
  const dteSeq = new Map<string, number>();
  const next = (m: Map<string, number>, k: string) => {
    const n = (m.get(k) ?? 0) + 1;
    m.set(k, n);
    return n;
  };
  const lowStockFrom = addDays(today, -12);

  for (let day = addDays(start, 1); day.getTime() <= today.getTime(); day = addDays(day, 1)) {
    const isToday = day.getTime() === today.getTime();
    const dow = day.getUTCDay(); // 0 domingo
    if (dow === 0) continue; // cerrado los domingos
    const year = day.getUTCFullYear();
    const month = day.getUTCMonth() + 1;
    const daysFromStart = Math.round((day.getTime() - start.getTime()) / 86_400_000);
    const growth = 0.85 + (daysFromStart / DAYS_BACK) * 0.3; // tendencia leve al alza

    for (const b of BRANCHES) {
      const B = b.key;
      const L = branchId[B];

      // ── Reabastecimiento (mañana, antes de abrir ventas) ───────
      // Un pedido por proveedor cuando alguno de sus productos cae cerca del
      // mínimo; el pedido completa todo lo de ese proveedor que esté bajo.
      const keepLow = (code: string) =>
        day >= lowStockFrom && LOW_STOCK_AT_END.some(([lb, lc]) => lb === B && lc === code);
      const triggered = new Set(
        stockables
          .filter((p) => !keepLow(p.code) && pl.get(`${B}|${p.code}`)!.stock <= pl.get(`${B}|${p.code}`)!.min * 1.4)
          .map((p) => supplierForCat[p.cat]),
      );
      const toBuy = new Map<string, { code: string; qty: number }[]>();
      for (const p of stockables) {
        const sup = supplierForCat[p.cat];
        const row = pl.get(`${B}|${p.code}`)!;
        if (!triggered.has(sup) || keepLow(p.code) || row.stock > row.target * 0.7) continue;
        const qty = Math.max(1, Math.round(row.target - row.stock));
        if (!toBuy.has(sup)) toBuy.set(sup, []);
        toBuy.get(sup)!.push({ code: p.code, qty });
      }
      for (const [sup, lines] of toBuy) {
        const pid = randomUUID();
        const code = String(next(purchaseSeq, `${B}|${year}-${month}`));
        const at = atLocalTime(day, 8, R.int(0, 50));
        let sub = 0;
        lines.forEach((l) => {
          const p = PRODUCTS.find((x) => x.code === l.code)!;
          const ls = round2(l.qty * p.cost);
          const tax = round2(ls * TAX / 100);
          sub += ls;
          purchaseItems.push({
            id: randomUUID(), purchase_id: pid, product_id: productId[l.code], quantity: D(l.qty),
            unit_cost: D(p.cost), tax_amount: D(tax), line_subtotal: D(ls), line_total: D(round2(ls + tax)),
            created_at: at,
          });
          move(B, l.code, "PURCHASE_IN", l.qty, at, { entity: "purchase", id: pid, code }, branchAdminOf(B), p.cost);
        });
        sub = round2(sub);
        const tax = round2(sub * TAX / 100);
        purchases.push({
          id: pid, tenant_id: T, location_id: L, supplier_id: supplierId[sup],
          purchase_code: code, purchase_year: year, purchase_month: month, purchase_date: day,
          status: "CONFIRMED", subtotal: D(sub), tax_amount: D(tax), total_amount: D(round2(sub + tax)),
          document_type: "CCF", document_series: "DTE-03",
          document_number: `${String(R.int(1, 4)).padStart(4, "0")}-${String(R.int(1000, 99999)).padStart(8, "0")}`,
          control_number: `DTE-03-${rnd(4)}P001-${String(R.int(1000, 99999)).padStart(15, "0")}`,
          generation_code: randomUUID().toUpperCase(),
          payment_condition: R.chance(0.6) ? "CRE" : "CON",
          confirmed_at: at, confirmed_by: branchAdminOf(B), created_by: branchAdminOf(B),
          created_at: at, updated_at: at,
        });
      }

      // ── Sesión de caja del día ─────────────────────────────────
      const sessionId = randomUUID();
      const opening = B === "MAT" ? 150 : 100;
      let expectedCash = opening;
      const openedAt = atLocalTime(day, 7, R.int(20, 40));

      // ── Ventas ─────────────────────────────────────────────────
      const base = (dow === 6 ? 15 : 11) * b.weight * growth;
      let count = Math.max(3, Math.round(base + (R.rand() * 6 - 3)));
      const lastHour = isToday ? Math.max(11, Math.min(17, nowHour)) : 17;
      if (isToday) count = Math.max(4, Math.round(count * ((lastHour - 7) / 10)));
      const times = Array.from({ length: count }, () => 7 * 60 + 45 + R.int(0, (lastHour - 7) * 60 - 50))
        .sort((a, b2) => a - b2);

      for (const minute of times) {
        const at = atLocalTime(day, 0, minute);
        const customer = R.chance(0.42) ? R.weighted(customerIds.map((c) => ({ value: c, weight: c.w }))) : null;
        const isCcf = customer?.taxpayer === "REGISTERED_TAXPAYER";
        const nLines = isCcf ? R.int(2, 6) : R.weighted([{ value: 1, weight: 4 }, { value: 2, weight: 3 }, { value: 3, weight: 2 }, { value: 4, weight: 1 }]);
        const used = new Set<string>();
        const lines: { p: ProductSeed; qty: number }[] = [];
        for (let i = 0; i < nLines; i++) {
          const p = R.weighted(PRODUCTS.map((x) => ({ value: x, weight: x.pop })));
          if (used.has(p.code)) continue;
          let qty = R.int(p.qty[0], p.qty[1]);
          if (isCcf && !p.service) qty = Math.min(p.qty[1], Math.round(qty * 1.8));
          if (!p.service) {
            const avail = pl.get(`${B}|${p.code}`)!.stock;
            const floor = LOW_STOCK_AT_END.some(([lb, lc]) => lb === B && lc === p.code) ? 1 : 0;
            qty = Math.min(qty, Math.floor(avail) - floor);
            if (qty <= 0) continue;
          }
          used.add(p.code);
          lines.push({ p, qty });
        }
        if (lines.length === 0) continue;

        const saleId = randomUUID();
        const seq = next(saleSeq, `${B}|${year}-${month}`);
        const saleCode = `VTA-${year}-${String(month).padStart(2, "0")}-${String(seq).padStart(4, "0")}`;
        const cashier = cashierOf(B);
        let subtotal = 0;
        let taxTotal = 0;
        lines.forEach((l, idx) => {
          const ls = round2(l.qty * l.p.price);
          const tax = round2(ls * TAX / 100);
          subtotal += ls;
          taxTotal += tax;
          saleItems.push({
            id: randomUUID(), sale_id: saleId, product_id: productId[l.p.code], line_number: idx + 1,
            product_code_snapshot: l.p.code, product_name_snapshot: l.p.name,
            product_type_snapshot: l.p.service ? "SERVICE" : "PRODUCT", is_stockable_snapshot: !l.p.service,
            quantity: D(l.qty), unit_price: D(l.p.price), tax_rate_snapshot: D(TAX), tax_amount: D(tax),
            line_subtotal: D(ls), line_total: D(round2(ls + tax)), created_at: at, updated_at: at,
          });
          if (!l.p.service) move(B, l.p.code, "SALE_OUT", l.qty, at, { entity: "sale", id: saleId, code: saleCode }, cashier);
        });
        subtotal = round2(subtotal);
        taxTotal = round2(taxTotal);
        const total = round2(subtotal + taxTotal);

        // Crédito a 30 días para algunas empresas: sin pago todavía.
        const onCredit = isCcf && R.chance(0.25);
        const form = R.weighted(PAYMENT_FORMS);
        if (!onCredit) {
          payments.push({
            id: randomUUID(), sale_id: saleId, payment_method_code: form, mh_payment_form_code: form,
            amount: D(total), paid_at: at, cash_session_id: sessionId, created_by: cashier,
            reference: form === "05" ? `TRF-${R.int(100000, 999999)}` : null, created_at: at, updated_at: at,
          });
          if (form === "01") expectedCash = round2(expectedCash + total);
        }

        sales.push({
          id: saleId, tenant_id: T, location_id: L, customer_id: customer?.id ?? null,
          sale_code: saleCode, sale_year: year, sale_month: month, sale_sequence: seq, sale_date: day,
          status: "CONFIRMED", payment_status: onCredit ? "UNPAID" : "PAID",
          primary_dte_type_code: isCcf ? "03" : "01",
          payment_method_code: onCredit ? null : form,
          condition_operation_code: onCredit ? "2" : "1",
          payment_term_code: onCredit ? "01" : null, payment_term_value: onCredit ? 30 : null,
          subtotal: D(subtotal), tax_amount: D(taxTotal), total_amount: D(total), inventory_moved: true,
          cash_session_id: sessionId, confirmed_at: at, confirmed_by: cashier, created_by: cashier,
          created_at: at, updated_at: at,
        });

        // DTE: casi todo ACCEPTED; recientes con estados variados para el panel.
        const type = isCcf ? "03" : "01";
        const daysAgo = Math.round((today.getTime() - day.getTime()) / 86_400_000);
        let status: DteOutgoingStatus = "ACCEPTED";
        if (isToday && minute > (lastHour - 1) * 60) status = R.pick(["SIGNED", "SENT", "PENDING_GENERATION"] as const);
        else if (daysAgo <= 20 && R.chance(0.015)) status = "REJECTED";
        else if (daysAgo <= 45 && R.chance(0.008)) status = "INVALIDATED";
        else if (daysAgo <= 3 && R.chance(0.03)) status = "OBSERVED";
        const hasNumber = status !== "PENDING_GENERATION";
        const ctl = hasNumber
          ? `DTE-${type}-${b.estab}P001-${String(next(dteSeq, `${B}|${type}`)).padStart(15, "0")}`
          : null;
        const sec = (s: number) => new Date(at.getTime() + s * 1000);
        dtes.push({
          id: randomUUID(), tenant_id: T, location_id: L, sale_id: saleId, dte_type_code: type,
          generation_code: hasNumber ? randomUUID().toUpperCase() : null, control_number: ctl,
          reception_stamp: ["ACCEPTED", "OBSERVED", "INVALIDATED"].includes(status) ? `${year}${rnd(36)}` : null,
          environment: "PRODUCTION", dte_status: status,
          rejection_reason: status === "REJECTED" ? "[096] NRC DEL RECEPTOR NO SE ENCUENTRA REGISTRADO" : null,
          observations: status === "OBSERVED" ? ["Campo complementario sin información relevante"] : undefined,
          issued_at: hasNumber ? at : null, generated_at: hasNumber ? sec(1) : null,
          schema_validated_at: hasNumber ? sec(1) : null, signed_at: hasNumber ? sec(2) : null,
          sent_at: ["SIGNED", "PENDING_GENERATION"].includes(status) ? null : sec(3),
          accepted_at: ["ACCEPTED", "INVALIDATED"].includes(status) ? sec(4) : null,
          observed_at: status === "OBSERVED" ? sec(4) : null,
          rejected_at: status === "REJECTED" ? sec(4) : null,
          invalidated_at: status === "INVALIDATED" ? addDays(at, 1) : null,
          created_by: cashier, created_at: at, updated_at: at,
        });
      }

      // ── Movimientos manuales de caja ───────────────────────────
      const reg = registerId[B];
      if (R.chance(0.35)) {
        const amt = R.pick([4.5, 6.25, 8, 12.4, 15]);
        cashMoves.push({
          id: randomUUID(), tenant_id: T, location_id: L, cash_session_id: sessionId, cash_register_id: reg,
          movement_type: "PETTY_EXPENSE", direction: "OUT", amount: D(amt),
          reason: R.pick(["Compra de agua purificada", "Papelería para caja", "Pago de transporte de mercadería", "Artículos de limpieza"]),
          performed_by: cashierOf(B), performed_at: atLocalTime(day, 11, R.int(0, 59)),
        });
        expectedCash = round2(expectedCash - amt);
      }
      if (!isToday && expectedCash > 600) {
        const amt = Math.floor((expectedCash - opening) * 0.7 / 50) * 50;
        cashMoves.push({
          id: randomUUID(), tenant_id: T, location_id: L, cash_session_id: sessionId, cash_register_id: reg,
          movement_type: "CASH_WITHDRAWAL", direction: "OUT", amount: D(amt),
          reason: "Remesa a banco", performed_by: branchAdminOf(B), performed_at: atLocalTime(day, 15, R.int(0, 59)),
        });
        expectedCash = round2(expectedCash - amt);
      }
      const diff = isToday ? null : R.chance(0.8) ? 0 : R.pick([-1.25, -0.5, 0.75, 2]);
      sessions.push({
        id: sessionId, tenant_id: T, location_id: L, cash_register_id: reg,
        opened_by: cashierOf(B), opened_at: openedAt,
        closed_by: isToday ? null : branchAdminOf(B), closed_at: isToday ? null : atLocalTime(day, 18, R.int(0, 25)),
        opening_amount: D(opening), expected_cash_amount: D(expectedCash),
        declared_cash_amount: diff === null ? null : D(round2(expectedCash + diff)),
        difference_amount: diff === null ? null : D(diff),
        status: isToday ? "OPEN" : "CLOSED",
        notes: diff ? (diff < 0 ? "Faltante menor registrado en el corte" : "Sobrante registrado en el corte") : null,
        created_at: openedAt, updated_at: openedAt,
      });
    }
  }

  // Saldo final materializado en product_locations.
  for (const r of plRows) {
    const key = [...pl.entries()].find(([, v]) => v.id === r.id)![1];
    r.current_stock = D(key.stock);
  }

  // ── Escritura por lotes (orden respeta FKs) ──────────────────────
  const batch = async <T,>(label: string, rows: T[], fn: (chunk: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 1000) await fn(rows.slice(i, i + 1000));
    console.log(`  ✓ ${label.padEnd(22)} ${rows.length}`);
  };
  await batch("product_locations", plRows, (c) => prisma.productLocation.createMany({ data: c }));
  await batch("purchases", purchases, (c) => prisma.purchase.createMany({ data: c }));
  await batch("purchase_items", purchaseItems, (c) => prisma.purchaseItem.createMany({ data: c }));
  await batch("cash_sessions", sessions, (c) => prisma.cashSession.createMany({ data: c }));
  await batch("sales", sales, (c) => prisma.sale.createMany({ data: c }));
  await batch("sale_items", saleItems, (c) => prisma.saleItem.createMany({ data: c }));
  await batch("sale_payments", payments, (c) => prisma.salePayment.createMany({ data: c }));
  await batch("dte_outgoing_documents", dtes, (c) => prisma.dteOutgoingDocument.createMany({ data: c }));
  await batch("cash_movements", cashMoves, (c) => prisma.cashMovement.createMany({ data: c }));
  await batch("inventory_movements", movements, (c) => prisma.inventoryMovement.createMany({ data: c }));

  const total = sales.reduce((a, s) => a + Number(s.total_amount), 0);
  console.log(`\n  ✅ Ferretería El Roble lista — ventas: ${sales.length} ($${total.toFixed(2)})`);
  console.log(`     Login: gerencia@elroble.demo / ${DEMO_PASSWORD} (super_admin, 3 sucursales)\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
