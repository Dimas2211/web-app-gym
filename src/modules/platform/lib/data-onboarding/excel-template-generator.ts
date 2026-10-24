// ─────────────────────────────────────────────────────────────────
// platform — excel-template-generator.ts
//
// E1A: Generador de plantillas Excel para el Data Onboarding Center.
// Produce workbooks .xlsx con 4 hojas: Instrucciones, Datos, Campos,
// Dependencias.
//
// Reglas de seguridad E1A:
// - No importa Prisma.
// - No ejecuta queries.
// - No escribe en bases cliente.
// - No expone credenciales.
// - Solo genera el workbook en memoria y retorna Buffer.
// ─────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx";
import type { DataOnboardingDatasetKey } from "../../types/platform.types";

// ── Tipos internos ────────────────────────────────────────────────

interface ColumnDef {
  key:           string;
  required:      boolean;
  type:          string;
  description:   string;
  example:       string;
  allowedValues?: string;
}

interface TemplateDefinition {
  label:       string;
  description: string;
  columns:     ColumnDef[];
  dependencies: { dataset: string; note: string }[];
  extraNotes:  string[];
}

// ── Definiciones por dataset ──────────────────────────────────────

const TEMPLATE_CONFIGS: Partial<Record<DataOnboardingDatasetKey, TemplateDefinition>> = {

  categories: {
    label: "Categorías de Productos",
    description:
      "Clasificación principal del catálogo de productos. " +
      "Debe importarse antes que líneas, sublíneas y productos.",
    columns: [
      {
        key: "name", required: true, type: "texto",
        description: "Nombre único de la categoría por tenant.",
        example: "Bebidas",
      },
      {
        key: "description", required: false, type: "texto",
        description: "Descripción adicional de la categoría.",
        example: "Bebidas frías y calientes",
      },
      {
        key: "status", required: false, type: "texto (valores permitidos)",
        description: "Estado del registro.",
        example: "active",
        allowedValues: "active | inactive",
      },
    ],
    dependencies: [],
    extraNotes: [
      "El campo 'name' debe ser único dentro de la organización.",
      "Si no se indica 'status', el sistema asignará 'active' por defecto.",
    ],
  },

  lines: {
    label: "Líneas de Productos",
    description:
      "Subdivisión dentro de una categoría. " +
      "Depende de categorías ya creadas en el sistema.",
    columns: [
      {
        key: "name", required: true, type: "texto",
        description: "Nombre único de la línea.",
        example: "Bebidas Frías",
      },
      {
        key: "category_name", required: true, type: "texto",
        description: "Nombre exacto de la categoría a la que pertenece. Debe existir en el sistema.",
        example: "Bebidas",
      },
      {
        key: "description", required: false, type: "texto",
        description: "Descripción de la línea.",
        example: "Línea de bebidas para consumo frío",
      },
      {
        key: "status", required: false, type: "texto (valores permitidos)",
        description: "Estado del registro.",
        example: "active",
        allowedValues: "active | inactive",
      },
    ],
    dependencies: [
      { dataset: "categories", note: "Las categorías referenciadas en category_name deben existir antes de importar líneas." },
    ],
    extraNotes: [
      "El campo 'category_name' se resuelve por nombre exacto (sensible a mayúsculas).",
    ],
  },

  sublines: {
    label: "Sublíneas de Productos",
    description:
      "Tercer nivel de clasificación del catálogo. " +
      "Depende de líneas ya creadas en el sistema.",
    columns: [
      {
        key: "name", required: true, type: "texto",
        description: "Nombre único de la sublínea.",
        example: "Jugos Naturales",
      },
      {
        key: "line_name", required: true, type: "texto",
        description: "Nombre exacto de la línea a la que pertenece. Debe existir en el sistema.",
        example: "Bebidas Frías",
      },
      {
        key: "category_name", required: false, type: "texto",
        description: "Nombre de la categoría (referencia informativa).",
        example: "Bebidas",
      },
      {
        key: "description", required: false, type: "texto",
        description: "Descripción de la sublínea.",
        example: "Jugos naturales sin azúcar",
      },
      {
        key: "status", required: false, type: "texto (valores permitidos)",
        description: "Estado del registro.",
        example: "active",
        allowedValues: "active | inactive",
      },
    ],
    dependencies: [
      { dataset: "categories", note: "Importar categorías primero si se usa category_name." },
      { dataset: "lines",      note: "Las líneas referenciadas en line_name deben existir antes de importar sublíneas." },
    ],
    extraNotes: [
      "El campo 'line_name' se resuelve por nombre exacto.",
    ],
  },

  products: {
    label: "Productos",
    description:
      "Catálogo maestro de productos. No incluye stock ni ubicación. " +
      "Importar después de categorías, líneas, sublíneas, unidades y tasas de impuesto.",
    columns: [
      {
        key: "product_code", required: true, type: "texto",
        description: "Código único del producto por tenant. No puede repetirse.",
        example: "PROD001",
      },
      {
        key: "name", required: true, type: "texto",
        description: "Nombre del producto.",
        example: "Coca-Cola 600ml",
      },
      {
        key: "product_type", required: true, type: "texto (valores permitidos)",
        description: "Tipo del producto.",
        example: "PRODUCT",
        allowedValues: "PRODUCT | SERVICE",
      },
      {
        key: "is_stockable", required: true, type: "booleano",
        description: "Si el producto maneja inventario físico.",
        example: "true",
        allowedValues: "true | false",
      },
      {
        key: "allow_purchase", required: true, type: "booleano",
        description: "Si el producto puede comprarse a proveedores.",
        example: "true",
        allowedValues: "true | false",
      },
      {
        key: "allow_sale", required: true, type: "booleano",
        description: "Si el producto puede venderse.",
        example: "true",
        allowedValues: "true | false",
      },
      {
        key: "category_name", required: true, type: "texto",
        description: "Nombre exacto de la categoría. Debe existir en el sistema.",
        example: "Bebidas",
      },
      {
        key: "unit_name", required: true, type: "texto",
        description: "Nombre exacto de la unidad de medida. Debe existir en el sistema.",
        example: "Unidad",
      },
      {
        key: "description", required: false, type: "texto",
        description: "Descripción del producto.",
        example: "Refresco carbonatado 600ml",
      },
      {
        key: "line_name", required: false, type: "texto",
        description: "Nombre exacto de la línea. Debe existir en el sistema.",
        example: "Bebidas Frías",
      },
      {
        key: "subline_name", required: false, type: "texto",
        description: "Nombre exacto de la sublínea. Debe existir en el sistema.",
        example: "Refrescos",
      },
      {
        key: "brand", required: false, type: "texto",
        description: "Marca del producto.",
        example: "Coca-Cola",
      },
      {
        key: "package_unit", required: false, type: "texto",
        description: "Presentación o unidad de empaque.",
        example: "Caja de 24",
      },
      {
        key: "supplier_name", required: false, type: "texto",
        description: "Nombre del proveedor principal. Debe existir en el sistema.",
        example: "Distribuidora XYZ",
      },
      {
        key: "sku", required: false, type: "texto",
        description: "SKU o código adicional de referencia.",
        example: "CC600-R",
      },
      {
        key: "cost_price", required: false, type: "decimal",
        description: "Precio de costo unitario (punto como separador decimal).",
        example: "0.75",
      },
      {
        key: "sale_price", required: false, type: "decimal",
        description: "Precio de venta unitario (punto como separador decimal).",
        example: "1.25",
      },
      {
        key: "tax_rate_name", required: false, type: "texto",
        description: "Nombre exacto de la tasa de impuesto. Debe existir en el sistema.",
        example: "IVA 13%",
      },
      {
        key: "status", required: false, type: "texto (valores permitidos)",
        description: "Estado del producto. Si no se indica, el sistema asignará ACTIVE por defecto.",
        example: "ACTIVE",
        allowedValues: "ACTIVE | INACTIVE | DISCONTINUED",
      },
    ],
    dependencies: [
      { dataset: "categories",      note: "category_name debe existir antes de importar productos." },
      { dataset: "lines",           note: "line_name (opcional) debe existir si se especifica." },
      { dataset: "sublines",        note: "subline_name (opcional) debe existir si se especifica." },
      { dataset: "units_of_measure", note: "unit_name debe existir en el catálogo de unidades." },
      { dataset: "tax_rates",       note: "tax_rate_name (opcional) debe existir si se especifica." },
      { dataset: "suppliers",       note: "supplier_name (opcional) debe existir si se especifica." },
    ],
    extraNotes: [
      "product_code debe ser único dentro de la organización.",
      "Los precios usan punto (.) como separador decimal. Ejemplo: 1.25",
      "is_stockable=true habilita el control de inventario para este producto.",
    ],
  },

  customers: {
    label: "Clientes",
    description:
      "Base de clientes del negocio. Incluye datos de identificación y contacto. " +
      "No tiene dependencias con otros datasets.",
    columns: [
      {
        key: "name", required: true, type: "texto",
        description: "Nombre completo del cliente.",
        example: "Juan Pérez García",
      },
      {
        key: "customer_code", required: false, type: "texto",
        description: "Código único del cliente. Se auto-genera si no se provee.",
        example: "CLI001",
      },
      {
        key: "email", required: false, type: "texto",
        description: "Correo electrónico del cliente.",
        example: "juan.perez@email.com",
      },
      {
        key: "phone", required: false, type: "texto",
        description: "Teléfono de contacto.",
        example: "7777-1234",
      },
      {
        key: "document_type", required: false, type: "texto (valores permitidos)",
        description: "Tipo de documento de identificación.",
        example: "DUI",
        allowedValues: "NIT | DUI | PASAPORTE | CEDULA | OTRO",
      },
      {
        key: "document_number", required: false, type: "texto",
        description: "Número del documento de identificación.",
        example: "01234567-8",
      },
      {
        key: "address", required: false, type: "texto",
        description: "Dirección del cliente.",
        example: "Col. Escalón, San Salvador",
      },
      {
        key: "city", required: false, type: "texto",
        description: "Ciudad o municipio del cliente. NO SE GUARDA EN E1C-C — el modelo Customer no tiene columna equivalente.",
        example: "San Salvador",
      },
      {
        key: "country_code", required: false, type: "texto",
        description: "Código de país ISO 3166-1 alpha-2. NO SE GUARDA EN E1C-C — el modelo Customer no tiene columna equivalente.",
        example: "SV",
      },
      {
        key: "status", required: false, type: "texto (valores permitidos)",
        description: "Estado del cliente. Si no se indica, el sistema asignará 'active' por defecto.",
        example: "active",
        allowedValues: "active | inactive",
      },
      {
        key: "notes", required: false, type: "texto",
        description: "Notas o comentarios adicionales. NO SE GUARDA EN E1C-C — el modelo Customer no tiene columna equivalente.",
        example: "Cliente frecuente desde 2023",
      },
    ],
    dependencies: [],
    extraNotes: [
      "customer_code se auto-genera si no se provee.",
      "Si document_type se especifica, se recomienda también proveer document_number.",
      "document_type NIT y document_number se almacenan en el campo 'nit' del sistema.",
      "document_type DUI y document_number se almacenan en el campo 'dui' del sistema.",
      "Sin documento de identidad la llave es solo el nombre — posible duplicado no detectable.",
      "IMPORTANTE: las columnas 'city', 'country_code' y 'notes' se aceptan en el archivo pero " +
      "NO se persisten actualmente — el modelo Customer no tiene esas columnas. No asuma que se guardaron.",
    ],
  },

  suppliers: {
    label: "Proveedores",
    description:
      "Maestro de proveedores del dominio commerce. " +
      "Incluye datos fiscales opcionales recomendados para DTE. " +
      "No tiene dependencias con otros datasets.",
    columns: [
      {
        key: "name", required: true, type: "texto",
        description: "Nombre legal o comercial del proveedor.",
        example: "Distribuidora El Sol S.A. de C.V.",
      },
      {
        key: "trade_name", required: false, type: "texto",
        description: "Nombre comercial o razón social (si difiere del nombre legal).",
        example: "El Sol",
      },
      {
        key: "nit", required: false, type: "texto",
        description: "NIT fiscal del proveedor. Formato recomendado: 0000-000000-000-0",
        example: "0614-050505-101-2",
      },
      {
        key: "nrc", required: false, type: "texto",
        description: "Número de Registro de Contribuyente.",
        example: "123456-7",
      },
      {
        key: "email", required: false, type: "texto",
        description: "Correo electrónico de contacto.",
        example: "ventas@elsol.com.sv",
      },
      {
        key: "phone", required: false, type: "texto",
        description: "Teléfono de contacto.",
        example: "2222-0000",
      },
      {
        key: "address", required: false, type: "texto",
        description: "Dirección del proveedor.",
        example: "Blvd. Los Héroes, Local 12",
      },
      {
        key: "city", required: false, type: "texto",
        description: "Ciudad o municipio.",
        example: "San Salvador",
      },
      {
        key: "country_code", required: false, type: "texto",
        description: "Código de país ISO 3166-1 alpha-2.",
        example: "SV",
      },
      {
        key: "economic_activity", required: false, type: "texto",
        description: "Código de actividad económica (catálogo MH para DTE).",
        example: "47111",
      },
      {
        key: "classification", required: false, type: "texto (valores permitidos)",
        description: "Clasificación fiscal del proveedor. NO SE MAPEA EN E1C-C — su vocabulario no " +
          "coincide con el enum real taxpayer_type del sistema (LARGE_TAXPAYER | SMALL_TAXPAYER | " +
          "NON_TAXPAYER | FOREIGN). El proveedor se crea con el valor por defecto del sistema.",
        example: "OTRO",
        allowedValues: "GRAN_CONTRIBUYENTE | MEDIANO | OTRO",
      },
      {
        key: "contact_name", required: false, type: "texto",
        description: "Nombre del contacto principal.",
        example: "María García",
      },
      {
        key: "status", required: false, type: "texto (valores permitidos)",
        description: "Estado del proveedor. Si no se indica, el sistema asignará 'active' por defecto.",
        example: "active",
        allowedValues: "active | inactive",
      },
    ],
    dependencies: [],
    extraNotes: [
      "NIT y NRC son opcionales pero recomendados si el proveedor es emisor DTE.",
      "economic_activity corresponde al catálogo de actividades económicas del MH.",
      "Si no se provee NIT, la llave de identificación es el nombre — posible duplicado no detectable.",
      "supplier_code no se solicita en esta plantilla — se genera automáticamente (PROV-{nombre}-{código}).",
      "IMPORTANTE: 'classification' se acepta en el archivo pero NO se mapea a taxpayer_type actualmente " +
      "— el proveedor queda con el valor por defecto del sistema. 'city' se guarda como municipality_name " +
      "y 'trade_name' se guarda como legal_name (no hay columnas 'city'/'trade_name' literales en el modelo).",
    ],
  },

  inventory_initial: {
    label: "Inventario Inicial",
    description:
      "Stock de apertura por producto y sucursal (Branch). " +
      "Solo aplica a productos PRODUCT, con is_stockable=true y status=ACTIVE. " +
      "Requiere que el producto y la sucursal ya existan en el sistema.",
    columns: [
      {
        key: "product_code", required: true, type: "texto",
        description: "Código del producto. Debe existir en el sistema, ser de tipo PRODUCT, is_stockable=true y status=ACTIVE. No aplica a productos SERVICE.",
        example: "PROD001",
      },
      {
        key: "location_name", required: true, type: "texto",
        description: "Nombre exacto de la sucursal (Branch). Debe existir en el sistema. No se crea la sucursal desde este import.",
        example: "Sede Central",
      },
      {
        key: "quantity", required: true, type: "número",
        description: "Cantidad de stock inicial. Debe ser estrictamente mayor que 0 — no se permite 0 ni negativos.",
        example: "50",
      },
      {
        key: "unit_cost", required: false, type: "decimal",
        description: "Costo unitario del stock inicial (punto como separador decimal). Si viene, debe ser decimal válido >= 0.",
        example: "0.75",
      },
      {
        key: "notes", required: false, type: "texto",
        description: "Notas o referencia del movimiento de apertura.",
        example: "Stock apertura 2024",
      },
    ],
    dependencies: [
      { dataset: "products", note: "product_code debe existir en el sistema como PRODUCT, is_stockable=true y status=ACTIVE." },
    ],
    extraNotes: [
      "Este import crea un ProductLocation y un movimiento de inventario tipo INITIAL_LOAD, juntos en una sola transacción por fila.",
      "quantity debe ser estrictamente mayor que 0. No se permite quantity=0 ni negativo.",
      "No se permite inventario inicial para productos de tipo SERVICE.",
      "No se permite inventario inicial para productos con is_stockable=false.",
      "Solo se permite para productos con status=ACTIVE.",
      "No se puede ejecutar dos veces para el mismo producto + sucursal: si ya existe un ProductLocation o un movimiento INITIAL_LOAD previo, la fila se bloquea.",
      "La sucursal (location_name) se resuelve contra Branch.name, no contra un modelo Location genérico, y debe existir en la base de datos destino.",
    ],
  },

  // ── GYM-ONBOARDING ──────────────────────────────────────────────

  gym_clients: {
    label: "Clientes GYM",
    description:
      "Socios del gimnasio (modelo Client de la vertical GYM — distinto de los clientes comerciales). " +
      "Crea solo el expediente operativo: no crea acceso al portal, usuarios, membresías, pagos, asistencias ni reservas.",
    columns: [
      {
        key: "first_name", required: true, type: "texto (máx. 100)",
        description: "Nombre(s) del socio.",
        example: "María",
      },
      {
        key: "last_name", required: true, type: "texto (máx. 100)",
        description: "Apellido(s) del socio.",
        example: "López Rivas",
      },
      {
        key: "branch_name", required: true, type: "texto",
        description: "Nombre exacto de la sucursal activa de la organización. Debe existir — no se crea desde este import.",
        example: "Sede Central",
      },
      {
        key: "operational_code", required: false, type: "texto (máx. 30, sin espacios)",
        description: "Código operativo del socio. Si se deja vacío se genera con la configuración de códigos del gimnasio (ej. C1010). No puede repetirse ni existir ya.",
        example: "C1010",
      },
      {
        key: "document_id", required: false, type: "texto (máx. 50)",
        description: "Documento de identidad (DUI, pasaporte…). Recomendado: es la llave más fiable para detectar duplicados.",
        example: "01234567-8",
      },
      {
        key: "birth_date", required: false, type: "fecha",
        description: "Fecha de nacimiento. Formato AAAA-MM-DD o DD/MM/AAAA. No puede ser futura.",
        example: "1990-05-21",
      },
      {
        key: "gender", required: false, type: "texto (valores permitidos)",
        description: "Género del socio.",
        example: "female",
        allowedValues: "male | female | other | prefer_not_to_say (también M, F, masculino, femenino, otro)",
      },
      {
        key: "email", required: false, type: "texto",
        description: "Correo de contacto del expediente. NO crea acceso al portal.",
        example: "maria.lopez@email.com",
      },
      {
        key: "phone", required: false, type: "texto (máx. 30)",
        description: "Teléfono de contacto.",
        example: "7777-1234",
      },
      {
        key: "address", required: false, type: "texto (máx. 255)",
        description: "Dirección del socio.",
        example: "Col. Escalón, San Salvador",
      },
      {
        key: "emergency_contact_name", required: false, type: "texto (máx. 100)",
        description: "Nombre del contacto de emergencia.",
        example: "José López",
      },
      {
        key: "emergency_contact_phone", required: false, type: "texto (máx. 30)",
        description: "Teléfono del contacto de emergencia.",
        example: "7000-0000",
      },
      {
        key: "sport_name", required: false, type: "texto",
        description: "Nombre exacto de un deporte ya existente en el catálogo. No se crea desde este import.",
        example: "Crossfit",
      },
      {
        key: "goal_name", required: false, type: "texto",
        description: "Nombre exacto de un objetivo ya existente en el catálogo. No se crea desde este import.",
        example: "Pérdida de peso",
      },
      {
        key: "modality", required: false, type: "texto (valores permitidos)",
        description: "Modalidad del socio. Vacío = NORMAL. PERSONALIZED y GROUP exigen el módulo de clases habilitado.",
        example: "NORMAL",
        allowedValues: "NORMAL | PERSONALIZED | GROUP",
      },
      {
        key: "notes", required: false, type: "texto (máx. 1000)",
        description: "Notas internas del expediente.",
        example: "Lesión previa de rodilla",
      },
      {
        key: "status", required: false, type: "texto (valores permitidos)",
        description: "Estado del socio. Vacío = active.",
        example: "active",
        allowedValues: "active | inactive",
      },
    ],
    dependencies: [
      { dataset: "Sucursales (Branch)", note: "branch_name debe existir y estar activa en la organización destino." },
      { dataset: "Deportes / Objetivos", note: "sport_name y goal_name (opcionales) deben existir en el catálogo." },
    ],
    extraNotes: [
      "La fila 2 de la hoja 'Datos' es un EJEMPLO: elimínela o reemplácela antes de importar.",
      "Solo crea registros nuevos (CREATE_ONLY). No actualiza ni elimina socios existentes.",
      "Duplicados que BLOQUEAN: operational_code o document_id ya existentes (en el archivo o en el gimnasio), " +
      "o misma persona con nombre + email/teléfono/fecha de nacimiento coincidentes.",
      "Coincidir solo en nombre y apellido genera una advertencia (no bloquea): verifique antes de importar.",
      "Sin operational_code ni document_id, volver a importar el mismo archivo puede duplicar socios: " +
      "incluya document_id u operational_code siempre que sea posible.",
      "El email es dato de contacto: no se crean usuarios ni acceso al portal (se habilita después desde Clientes).",
      "No se asigna entrenador en esta versión. No se crean membresías, pagos, asistencias ni reservas.",
      "Máximo 5,000 registros no vacíos y 4 MB por archivo. Si el archivo excede el límite, se rechaza entero (no hay import parcial).",
    ],
  },

  gym_trainers: {
    label: "Entrenadores",
    description:
      "Perfiles operativos de entrenadores (modelo Trainer de la vertical GYM). " +
      "Se crean sin usuario de sistema; la cuenta con rol trainer se vincula después desde la interfaz.",
    columns: [
      {
        key: "first_name", required: true, type: "texto (máx. 100)",
        description: "Nombre(s) del entrenador.",
        example: "Carlos",
      },
      {
        key: "last_name", required: true, type: "texto (máx. 100)",
        description: "Apellido(s) del entrenador.",
        example: "Martínez",
      },
      {
        key: "branch_name", required: true, type: "texto",
        description: "Nombre exacto de la sucursal activa de la organización. Debe existir — no se crea desde este import.",
        example: "Sede Central",
      },
      {
        key: "email", required: false, type: "texto (máx. 200)",
        description: "Correo de contacto. NO crea usuario ni acceso al sistema.",
        example: "carlos.martinez@email.com",
      },
      {
        key: "phone", required: false, type: "texto (máx. 30)",
        description: "Teléfono de contacto.",
        example: "7123-4567",
      },
      {
        key: "specialty", required: false, type: "texto (máx. 200)",
        description: "Especialidad del entrenador.",
        example: "Funcional y movilidad",
      },
      {
        key: "personalized_capacity", required: false, type: "número entero",
        description: "Cupo de clientes PERSONALIZED simultáneos. Vacío = usar el cupo por defecto del gimnasio.",
        example: "3",
        allowedValues: "1 a 50",
      },
      {
        key: "notes", required: false, type: "texto (máx. 1000)",
        description: "Notas internas.",
        example: "Certificación NSCA",
      },
      {
        key: "status", required: false, type: "texto (valores permitidos)",
        description: "Estado del entrenador. Vacío = active.",
        example: "active",
        allowedValues: "active | inactive",
      },
    ],
    dependencies: [
      { dataset: "Sucursales (Branch)", note: "branch_name debe existir y estar activa en la organización destino." },
    ],
    extraNotes: [
      "La fila 2 de la hoja 'Datos' es un EJEMPLO: elimínela o reemplácela antes de importar.",
      "Requiere el módulo de entrenadores (gym.trainers) habilitado para la organización.",
      "Solo crea registros nuevos (CREATE_ONLY). No modifica entrenadores existentes.",
      "Se bloquea un entrenador si ya existe otro en el gimnasio con el mismo email o el mismo nombre y apellido.",
      "No se importan horarios de disponibilidad, sesiones, clases ni reservas.",
      "No se crean usuarios del sistema: el vínculo con un usuario de rol trainer se hace después desde Entrenadores.",
      "Máximo 5,000 registros no vacíos y 4 MB por archivo. Si el archivo excede el límite, se rechaza entero (no hay import parcial).",
    ],
  },
};

// ── Helpers de construcción de hojas ─────────────────────────────

function setColWidths(ws: XLSX.WorkSheet, widths: number[]): void {
  ws["!cols"] = widths.map((wch) => ({ wch }));
}

function buildInstructionSheet(
  config: TemplateDefinition,
  profileLabel: string,
): XLSX.WorkSheet {
  const rows: unknown[][] = [
    [`Data Onboarding Center — ${config.label}`],
    [],
    ["Perfil destino:", profileLabel],
    ["Dataset:", config.label],
    [],
    ["DESCRIPCIÓN"],
    [config.description],
    [],
    ["INSTRUCCIONES DE USO"],
    ["1. Complete los datos en la hoja 'Datos', una fila por registro."],
    ["2. No cambie los nombres de las columnas."],
    ["3. Las columnas marcadas con * son obligatorias."],
    ["4. No deje columnas requeridas vacías."],
    ["5. No use fórmulas en las celdas — solo valores literales."],
    ["6. Para campos booleanos use: true o false (en minúsculas)."],
    ["7. Para precios use punto (.) como separador decimal. Ejemplo: 1.25"],
    ["8. Consulte la hoja 'Campos' para ver tipos, ejemplos y valores permitidos."],
    ["9. Consulte la hoja 'Dependencias' para saber qué importar antes."],
    [],
    ["ESTADO EN E1A"],
    ["Esta plantilla permite descargar la estructura de importación."],
    ["La importación real de datos estará disponible en fases E1B/E1C."],
    [],
  ];

  if (config.extraNotes.length > 0) {
    rows.push(["NOTAS ADICIONALES"]);
    config.extraNotes.forEach((note, i) => rows.push([`${i + 1}. ${note}`]));
    rows.push([]);
  }

  rows.push(["Generado por Data Onboarding Center — Platform Admin"]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [60]);
  return ws;
}

function buildDataSheet(config: TemplateDefinition): XLSX.WorkSheet {
  const headers = config.columns.map((c) =>
    c.required ? `${c.key}*` : c.key,
  );
  const examples = config.columns.map((c) => c.example);

  const ws = XLSX.utils.aoa_to_sheet([headers, examples]);
  setColWidths(ws, config.columns.map((c) => Math.max(c.key.length + 4, 20)));
  return ws;
}

function buildFieldsSheet(config: TemplateDefinition): XLSX.WorkSheet {
  const header = ["Columna", "Requerido", "Tipo", "Descripción", "Ejemplo", "Valores permitidos"];
  const rows = config.columns.map((c) => [
    c.key,
    c.required ? "Sí *" : "No",
    c.type,
    c.description,
    c.example,
    c.allowedValues ?? "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  setColWidths(ws, [22, 10, 28, 55, 25, 35]);
  return ws;
}

function buildDependenciesSheet(config: TemplateDefinition): XLSX.WorkSheet {
  const header = ["Dataset previo requerido", "Nota"];

  const rows: unknown[][] =
    config.dependencies.length > 0
      ? config.dependencies.map((d) => [d.dataset, d.note])
      : [["(Ninguna)", "Este dataset no tiene dependencias previas."]];

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  setColWidths(ws, [28, 70]);
  return ws;
}

// ── Exportación principal ─────────────────────────────────────────

/**
 * Genera un workbook Excel (.xlsx) con 4 hojas para el dataset dado.
 * No consulta bases de datos. Solo opera en memoria.
 */
export function generateDataOnboardingTemplate(
  datasetKey: DataOnboardingDatasetKey,
  profileLabel: string,
): Buffer {
  const config = TEMPLATE_CONFIGS[datasetKey];
  if (!config) {
    throw new Error(`No existe configuración de plantilla para el dataset: ${datasetKey}`);
  }

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildInstructionSheet(config, profileLabel), "Instrucciones");
  XLSX.utils.book_append_sheet(wb, buildDataSheet(config),                      "Datos");
  XLSX.utils.book_append_sheet(wb, buildFieldsSheet(config),                    "Campos");
  XLSX.utils.book_append_sheet(wb, buildDependenciesSheet(config),              "Dependencias");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Conjunto de dataset keys que tienen plantilla disponible en E1A */
export const TEMPLATE_AVAILABLE_KEYS = new Set<DataOnboardingDatasetKey>(
  Object.keys(TEMPLATE_CONFIGS) as DataOnboardingDatasetKey[],
);
