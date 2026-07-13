import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordRodrigo = await bcrypt.hash("Rodrigo2026!", 10);
  const passwordDaniel = await bcrypt.hash("Daniel2026!", 10);

  const tenant = await prisma.gym.create({
    data: {
      name: "TrustmeDB",
      slug: "trustmedb",
      status: "active",
    },
  });

  const location = await prisma.branch.create({
    data: {
      gym_id: tenant.id,
      tenant_id: tenant.id,
      name: "Sucursal Central",
      status: "active",
    },
  });

  await prisma.gymSettings.create({
    data: {
      gym_id: tenant.id,
      tenant_id: tenant.id,
    },
  });

  await prisma.user.createMany({
    data: [
      {
        gym_id: tenant.id,
        tenant_id: tenant.id,
        branch_id: location.id,
        location_id: location.id,
        email: "rodrigo@test.local",
        password_hash: passwordRodrigo,
        first_name: "Rodrigo",
        last_name: "Dimas",
        role: "super_admin",
        status: "active",
      },
      {
        gym_id: tenant.id,
        tenant_id: tenant.id,
        branch_id: location.id,
        location_id: location.id,
        email: "daniel@test.local",
        password_hash: passwordDaniel,
        first_name: "Daniel",
        last_name: "Admin",
        role: "super_admin",
        status: "active",
      },
    ],
  });

  console.log("TrustmeDB creada con Sucursal Central, Rodrigo y Daniel.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });