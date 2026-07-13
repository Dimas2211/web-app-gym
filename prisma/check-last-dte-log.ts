import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const log = await prisma.dteTransmissionLog.findFirst({
    orderBy: { created_at: "desc" },
  });

  if (!log) {
    console.log("No hay logs DTE.");
    return;
  }

  console.dir(log, { depth: null });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });