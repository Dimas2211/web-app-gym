import { PrismaClient } from "@prisma/client";
import fs from "fs";

function getDatabaseUrlFromEnvFile(path: string) {
  const content = fs.readFileSync(path, "utf8");
  const match = content.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
  if (!match) throw new Error(`No encontré DATABASE_URL en ${path}`);
  return match[1];
}

const sourceUrl = getDatabaseUrlFromEnvFile(".env.actual.backup");
const targetUrl = process.env.DATABASE_URL;

if (!targetUrl) {
  throw new Error("No encontré DATABASE_URL actual. Revisá tu .env.");
}

const source = new PrismaClient({
  datasources: { db: { url: sourceUrl } },
});

const target = new PrismaClient({
  datasources: { db: { url: targetUrl } },
});

async function main() {
  console.log("Copiando catálogos MH hacia TrustmeDB...");

  const identificationTypes = await source.identificationType.findMany();
  const economicActivities = await source.economicActivity.findMany();
  const municipalities = await source.municipality.findMany();
  const countries = await source.country.findMany();

  console.log({
    identificationTypes: identificationTypes.length,
    economicActivities: economicActivities.length,
    municipalities: municipalities.length,
    countries: countries.length,
  });

  await target.identificationType.createMany({
    data: identificationTypes,
    skipDuplicates: true,
  });

  await target.economicActivity.createMany({
    data: economicActivities,
    skipDuplicates: true,
  });

  await target.municipality.createMany({
    data: municipalities,
    skipDuplicates: true,
  });

  await target.country.createMany({
    data: countries,
    skipDuplicates: true,
  });

  console.log("Catálogos MH copiados correctamente a TrustmeDB.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });