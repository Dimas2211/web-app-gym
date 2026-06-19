/**
 * seed.units-of-measure.ts
 *
 * Catálogo global de unidades de medida — sin tenant_id.
 * Fuente: CAT-014 del Sistema de Transmisión del Ministerio de Hacienda de El Salvador.
 *
 * Limitación actual: el modelo UnitOfMeasure no tiene campo `code` ni `mh_code`,
 * por lo que el código oficial numérico CAT-014 no puede almacenarse por ahora.
 * Cuando se agregue ese campo (migración futura), este seed debe actualizarse.
 *
 * Idempotente: puede ejecutarse múltiples veces sin duplicar datos.
 * Clave de upsert: symbol (@@unique en el schema).
 */

import { PrismaClient } from "@prisma/client";

// CAT-014 — Unidad de Medida (Hacienda El Salvador)
// mh_code: código oficial de referencia (no almacenado hasta que exista campo en schema)
const CAT014_UNITS = [
  { mh_code:  1, name: "Metro",               symbol: "m"        },
  { mh_code:  2, name: "Yarda",               symbol: "yd"       },
  { mh_code:  6, name: "Milímetro",           symbol: "mm"       },
  { mh_code:  9, name: "Kilómetro cuadrado",  symbol: "km²"      },
  { mh_code: 10, name: "Hectárea",            symbol: "ha"       },
  { mh_code: 13, name: "Metro cuadrado",      symbol: "m²"       },
  { mh_code: 15, name: "Vara cuadrada",       symbol: "v²"       },
  { mh_code: 18, name: "Metro cúbico",        symbol: "m³"       },
  { mh_code: 20, name: "Barril",              symbol: "bbl"      },
  { mh_code: 22, name: "Galón",              symbol: "gal"      },
  { mh_code: 23, name: "Litro",              symbol: "L"        },
  { mh_code: 24, name: "Botella",            symbol: "bot"      },
  { mh_code: 26, name: "Mililitro",          symbol: "mL"       },
  { mh_code: 30, name: "Tonelada",           symbol: "t"        },
  { mh_code: 32, name: "Quintal",            symbol: "qq"       },
  { mh_code: 33, name: "Arroba",             symbol: "arr"      },
  { mh_code: 34, name: "Kilogramo",          symbol: "kg"       },
  { mh_code: 36, name: "Libra",              symbol: "lb"       },
  { mh_code: 37, name: "Onza troy",          symbol: "oz t"     },
  { mh_code: 38, name: "Onza",              symbol: "oz"       },
  { mh_code: 39, name: "Gramo",             symbol: "g"        },
  { mh_code: 40, name: "Miligramo",         symbol: "mg"       },
  { mh_code: 42, name: "Megawatt",          symbol: "MW"       },
  { mh_code: 43, name: "Kilowatt",          symbol: "kW"       },
  { mh_code: 44, name: "Watt",              symbol: "W"        },
  { mh_code: 45, name: "Megavoltio-amperio", symbol: "MVA"     },
  { mh_code: 46, name: "Kilovoltio-amperio", symbol: "kVA"     },
  { mh_code: 47, name: "Voltio-amperio",    symbol: "VA"       },
  { mh_code: 49, name: "Gigawatt-hora",     symbol: "GWh"      },
  { mh_code: 50, name: "Megawatt-hora",     symbol: "MWh"      },
  { mh_code: 51, name: "Kilowatt-hora",     symbol: "kWh"      },
  { mh_code: 52, name: "Watt-hora",         symbol: "Wh"       },
  { mh_code: 53, name: "Kilovoltio",        symbol: "kV"       },
  { mh_code: 54, name: "Voltio",            symbol: "V"        },
  { mh_code: 55, name: "Millar",            symbol: "mill"     },
  { mh_code: 56, name: "Medio millar",      symbol: "med.mill" },
  { mh_code: 57, name: "Ciento",            symbol: "cto"      },
  { mh_code: 58, name: "Docena",            symbol: "doc"      },
  { mh_code: 59, name: "Unidad",            symbol: "und"      },
  { mh_code: 99, name: "Otra",              symbol: "otra"     },
];

export async function seedUnitsOfMeasure(prisma: PrismaClient): Promise<void> {
  console.log("\n📐 Unidades de medida (CAT-014 Hacienda El Salvador)...");

  let created = 0;
  let updated = 0;

  for (const unit of CAT014_UNITS) {
    const result = await prisma.unitOfMeasure.upsert({
      where:  { symbol: unit.symbol },
      update: { name: unit.name },
      create: { name: unit.name, symbol: unit.symbol, status: "active" },
    });
    // upsert no distingue created/updated directamente, usamos created_at ≈ updated_at como proxy
    const isNew = result.created_at.getTime() === result.updated_at.getTime();
    if (isNew) { created++; } else { updated++; }
  }

  console.log(`  ✅ ${CAT014_UNITS.length} unidades procesadas — creadas: ${created}, ya existían: ${updated}`);
  console.log("  ⚠️  Nota: código MH (CAT-014) no almacenado — modelo sin campo 'code'. Pendiente para migración futura.");
}
