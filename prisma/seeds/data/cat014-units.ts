// ─────────────────────────────────────────────────────────────────
// prisma/seeds/data — cat014-units.ts
//
// F3-C23E — Fuente única de CAT-014 (Unidad de Medida, Sistema de
// Transmisión MH El Salvador). Antes vivía embebida como constante
// privada dentro de prisma/seeds/seed.units-of-measure.ts; se extrae
// aquí para que también la use el flujo comercial de FEX 11
// (configurar unidad MH para un producto/servicio sin bloquearlo,
// ver export-sale.service.ts / export-configure-mh-unit-modal.tsx)
// sin duplicar a mano la misma lista de códigos oficiales en dos
// lugares — mismo patrón que fex11-catalog-rows.ts.
//
// Sin dependencias de Prisma — módulo de datos puro.
// ─────────────────────────────────────────────────────────────────

export interface Cat014Unit {
  mh_code: number;
  name:    string;
  symbol:  string;
}

// CAT-014 — Unidad de Medida (Hacienda El Salvador)
export const CAT014_UNITS: Cat014Unit[] = [
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

// F3-C23E — Unidad recomendada por defecto para SERVICIOS en el flujo
// FEX 11 (ítems intangibles sin unidad física real, p. ej. desarrollo
// de software). El catálogo CAT-014 oficial no define un código
// específico "servicio" — mh_code 59 "Unidad" es el valor genérico ya
// usado como unidad base de productos (ver seed.units-of-measure.ts,
// symbol "und") y es lo más cercano documentado sin inventar un código
// nuevo. El usuario sigue eligiendo manualmente en el modal de
// configuración — esto solo prioriza la opción en la lista.
export const CAT014_SERVICE_DEFAULT_MH_CODE = 59;
