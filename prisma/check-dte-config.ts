import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const configs = await prisma.dteIssuerConfig.findMany({
    orderBy: { created_at: "desc" },
  });

  console.dir(configs, { depth: null });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });