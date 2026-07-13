import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.gym.findFirst({
    where: { slug: "trustmedb" },
  });

  if (!tenant) {
    throw new Error("No se encontró el tenant TrustmeDB.");
  }

  await prisma.productCategory.createMany({
    data: [
      { tenant_id: tenant.id, code: "GEN", name: "General", status: "active" },
      { tenant_id: tenant.id, code: "SERV", name: "Servicios", status: "active" },
      { tenant_id: tenant.id, code: "PROD", name: "Productos", status: "active" },
    ],
    skipDuplicates: true,
  });

  await prisma.unitOfMeasure.createMany({
    data: [
      { name: "Unidad", symbol: "UN", status: "active" },
      { name: "Servicio", symbol: "SERV", status: "active" },
      { name: "Libra", symbol: "LB", status: "active" },
      { name: "Kilogramo", symbol: "KG", status: "active" },
      { name: "Litro", symbol: "L", status: "active" },
    ],
    skipDuplicates: true,
  });

  await prisma.taxRate.createMany({
    data: [
      { tenant_id: tenant.id, name: "IVA 13%", rate: 13, status: "active" },
      { tenant_id: tenant.id, name: "Exento 0%", rate: 0, status: "active" },
    ],
    skipDuplicates: true,
  });

  console.log("Catálogos commerce mínimos creados para TrustmeDB.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });