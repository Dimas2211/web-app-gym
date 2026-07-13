import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const doc = await prisma.dteOutgoingDocument.findFirst({
    orderBy: { created_at: "desc" },
  });

  if (!doc) {
    console.log("No hay DTE.");
    return;
  }

  console.dir(doc, { depth: null });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });