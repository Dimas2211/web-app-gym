import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.gym.findFirst({
    where: { slug: "trustmedb" },
  });

  if (!tenant) throw new Error("No se encontró TrustmeDB.");

  const location = await prisma.branch.findFirst({
    where: {
      tenant_id: tenant.id,
      name: "Sucursal Central",
    },
  });

  if (!location) throw new Error("No se encontró Sucursal Central.");

  const issuer = await prisma.dteIssuerConfig.upsert({
    where: {
      tenant_id_location_id_environment: {
        tenant_id: tenant.id,
        location_id: location.id,
        environment: "TEST",
      },
    },
    update: {
      nit: "05280807241037",
      nrc: "3464880",
      name: "TECNOLOGIAS TRUST ME, S.A. DE C.V.",
      legal_name: "TECNOLOGIAS TRUST ME, S.A. DE C.V.",
      activity_code: "62010",
      activity_name: "Programación Informática",
      establishment_type_code: "01",
      establishment_code: "M001",
      point_of_sale_code: "P001",
      cod_estable_mh: "M001",
      cod_punto_venta_mh: "P001",
      dept_code: "05",
      municipality_code: "28",
      address_complement: "Santa Tecla, Av. Manuel Gallardo, Col. Santa Cecilia, #4",
      phone: "77952790",
      email: "info@apptrustme.com",
      is_active: true,
    },
    create: {
      tenant_id: tenant.id,
      location_id: location.id,
      environment: "TEST",
      nit: "05280807241037",
      nrc: "3464880",
      name: "TECNOLOGIAS TRUST ME, S.A. DE C.V.",
      legal_name: "TECNOLOGIAS TRUST ME, S.A. DE C.V.",
      activity_code: "62010",
      activity_name: "Programación Informática",
      establishment_type_code: "01",
      establishment_code: "0001",
      point_of_sale_code: "0001",
      cod_estable_mh: "0001",
      cod_punto_venta_mh: "0001",
      dept_code: "05",
      municipality_code: "11",
      address_complement: "Santa Tecla, Av. Manuel Gallardo, Col. Santa Cecilia, #4",
      phone: "77952790",
      email: "info@apptrustme.com",
      is_active: true,
    },
  });

  const year = new Date().getFullYear();

  for (const dte_type_code of ["01", "03", "05"]) {
    await prisma.dteCorrelative.upsert({
      where: {
        tenant_id_location_id_issuer_config_id_environment_dte_type_code_year: {
          tenant_id: tenant.id,
          location_id: location.id,
          issuer_config_id: issuer.id,
          environment: "TEST",
          dte_type_code,
          year,
        },
      },
      update: {},
      create: {
        tenant_id: tenant.id,
        location_id: location.id,
        issuer_config_id: issuer.id,
        environment: "TEST",
        dte_type_code,
        cod_estable_mh: issuer.cod_estable_mh,
        cod_punto_venta_mh: issuer.cod_punto_venta_mh,
        year,
        last_sequence: 0,
      },
    });
  }

  console.log("DTE configurado para TrustmeDB:", issuer.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });