import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.dteIssuerConfig.updateMany({
    where: {
      environment: "TEST",
      is_active: true,
    },
    data: {
      cod_estable_mh: "M001",
      cod_punto_venta_mh: "P001",
      establishment_code: "M001",
      point_of_sale_code: "P001",
    },
  });

  console.log("DteIssuerConfig actualizados:", result.count);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });