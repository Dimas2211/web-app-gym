import type { ReactNode } from "react";

/*
 * Iconos de módulo del sitio público getzolvi.com (trazo 1.75, viewBox 24).
 * Solo presentación: se asocian al href de cada item del sidebar, sin tocar
 * la configuración de navegación ni sus reglas de acceso.
 */
const PATHS = {
  box: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  truck: (
    <>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.5L20 8H6" />
      <circle cx="10" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>
  ),
  cash: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  store: (
    <>
      <path d="M3 9 4 4h16l1 5" />
      <path d="M4 9v11h16V9" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 3 4 6v6c0 4.5 3.2 7.7 8 9 4.8-1.3 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  bars: (
    <>
      <path d="M4 20V10" />
      <path d="M12 20V4" />
      <path d="M20 20v-7" />
    </>
  ),
  branches: (
    <>
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M12 7v4M5 17v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 14.5h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4h6v3H9z" />
      <path d="M9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  gym: (
    <>
      <path d="M12 8h8a2 2 0 0 1 2 2v1a5 5 0 0 1-5 5h-4" />
      <circle cx="7" cy="13" r="5" />
      <path d="M12 8V4h-3" />
    </>
  ),
  export: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  gauge: (
    <>
      <path d="M3.5 18a9 9 0 1 1 17 0" />
      <path d="m12 14 3.5-3.5" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 21v-3h6v3" />
      <path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h.01M16 15h.01" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  columns: (
    <>
      <rect x="4" y="4" width="4" height="16" rx="1" />
      <rect x="10" y="4" width="4" height="16" rx="1" />
      <rect x="16" y="4" width="4" height="16" rx="1" />
    </>
  ),
  plusCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  checklist: (
    <>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  rocket: (
    <>
      <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1Z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2Z" />
      <path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0" />
      <path d="M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8Z" />
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  dot: <circle cx="12" cy="12" r="3" />,
} satisfies Record<string, ReactNode>;

export type ModuleIconName = keyof typeof PATHS;

// Orden importa: el primer prefijo que coincide gana (rutas más específicas primero).
const HREF_ICONS: [string, ModuleIconName][] = [
  ["/dashboard/clients", "users"],
  ["/dashboard/memberships", "card"],
  ["/dashboard/trainers", "gym"],
  ["/dashboard/classes", "calendar"],
  ["/dashboard/weekly-plans", "clipboard"],
  ["/dashboard/reports", "bars"],
  ["/dashboard/products", "box"],
  ["/dashboard/inventory", "layers"],
  ["/dashboard/suppliers", "store"],
  ["/dashboard/customers", "users"],
  ["/dashboard/purchases", "truck"],
  ["/dashboard/sales/export", "export"],
  ["/dashboard/sales", "cart"],
  ["/dashboard/cash", "cash"],
  ["/dashboard/dte", "shieldCheck"],
  ["/dashboard/settings/dte", "shieldCheck"],
  ["/dashboard/users", "users"],
  ["/dashboard/branches", "branches"],
  ["/dashboard/settings", "gear"],
  ["/dashboard/platform/organizations", "building"],
  ["/dashboard/platform/plans", "tag"],
  ["/dashboard/platform/modules", "grid"],
  ["/dashboard/platform/verticals", "columns"],
  ["/dashboard/platform/provisioning", "plusCircle"],
  ["/dashboard/platform/deployment-preparation", "checklist"],
  ["/dashboard/platform/deployment-exports", "download"],
  ["/dashboard/platform/deployments", "rocket"],
  ["/dashboard/platform/manual-deployment", "wrench"],
  ["/dashboard/platform/database-profiles", "database"],
  ["/dashboard/platform", "gauge"],
];

export function moduleIconForHref(href: string): ModuleIconName {
  return HREF_ICONS.find(([prefix]) => href.startsWith(prefix))?.[1] ?? "dot";
}

// Descripciones cortas para las tarjetas del inicio (textos de getzolvi.com
// cuando el módulo aparece en el sitio). Coincidencia exacta por href.
const HREF_DESCRIPTIONS: Record<string, string> = {
  "/dashboard/clients": "Ficha centralizada del socio, conectada a membresías y asistencia.",
  "/dashboard/memberships/client-memberships": "Planes, altas, fechas de inicio y vencimientos.",
  "/dashboard/trainers": "Entrenadores, disponibilidad y ausencias por sucursal.",
  "/dashboard/classes": "Clases grupales y sesiones con cupos, reservas y asistencia.",
  "/dashboard/weekly-plans/client-plans": "Rutinas generales o personalizadas por alumno.",
  "/dashboard/weekly-plans/seguimiento": "Avance y registros de entrenamiento de tus alumnos.",
  "/dashboard/reports": "Indicadores de socios, membresías y entrenamiento.",
  "/dashboard/products": "Catálogo maestro con categorías, líneas, precios, impuestos y unidades de medida.",
  "/dashboard/inventory": "Existencias por sucursal y ubicación, con movimientos auditables y alertas de stock bajo.",
  "/dashboard/suppliers": "Maestro independiente con datos tributarios y contactos, reutilizado por compras.",
  "/dashboard/customers": "Maestro central con información fiscal, de contacto e historial de la operación.",
  "/dashboard/purchases": "Del proveedor a la entrada de inventario, con trazabilidad de qué, a quién y cuánto costó.",
  "/dashboard/sales": "Borrador, cliente, descuentos, impuestos, pago y descuento de stock en un solo ciclo.",
  "/dashboard/sales/export": "Facturas de exportación y sus documentos fiscales.",
  "/dashboard/cash": "Apertura, movimientos, efectivo esperado, cierre con diferencias y corte de caja.",
  "/dashboard/dte/outgoing": "Documentos tributarios emitidos y su estado ante Hacienda.",
  "/dashboard/dte/monitoring": "Seguimiento del estado de cada documento y su consumo.",
  "/dashboard/settings/dte": "Generación, firma y transmisión del DTE conectada directamente a la venta.",
  "/dashboard/dte/correlatives": "Numeración de control por tipo de documento y sucursal.",
  "/dashboard/reports/commerce": "Ventas por período, producto, cliente o usuario. Stock, compras y cortes de caja.",
  "/dashboard/users": "Cada persona ve lo que necesita para hacer su trabajo.",
  "/dashboard/branches": "Operación independiente por ubicación, con visión global de la organización.",
  "/dashboard/settings": "Parámetros generales, seguridad y preferencias del sistema.",
  "/dashboard/platform": "Vista general de la plataforma y sus organizaciones.",
  "/dashboard/platform/organizations": "Clientes de la plataforma, su licencia, dominio y entorno.",
  "/dashboard/platform/plans": "Planes comerciales con los módulos y límites que incluyen.",
  "/dashboard/platform/modules": "Catálogo de módulos disponibles para activar por plan.",
  "/dashboard/platform/verticals": "Industrias soportadas, como Gym o Commerce.",
  "/dashboard/platform/provisioning": "Alta controlada de nuevas organizaciones y su base inicial.",
  "/dashboard/platform/deployment-preparation": "Revisión previa antes de desplegar un cliente.",
  "/dashboard/platform/deployment-exports": "Paquetes de configuración exportados para despliegue.",
  "/dashboard/platform/deployments": "Historial y estado de los despliegues realizados.",
  "/dashboard/platform/manual-deployment": "Registro de despliegues ejecutados manualmente.",
  "/dashboard/platform/database-profiles": "Conexiones de base de datos de los entornos dedicados.",
};

export function moduleDescriptionForHref(href: string): string | undefined {
  return HREF_DESCRIPTIONS[href];
}

export function ModuleIcon({ name, className }: { name: ModuleIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
