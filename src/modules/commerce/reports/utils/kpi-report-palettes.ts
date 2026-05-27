// ─────────────────────────────────────────────────────────────────
// commerce/reports — kpi-report-palettes.ts
//
// Paletas de colores para el PDF ejecutivo de commerce KPI.
// Cada paleta tiene colores claramente contrastantes entre sí,
// de modo que gráficas comparativas (e.g. Productos vs Servicios)
// sean legibles sin depender del color para diferenciar categorías.
//
// Uso:
//   - getRandomKpiReportPalette()  → llama solo en cliente (Math.random)
//   - getDefaultKpiReportPalette() → seguro en SSR
//   - getKpiReportPaletteByIndex() → cuando el índice ya se eligió
// ─────────────────────────────────────────────────────────────────

export interface KpiReportPaletteColors {
  /** Ventas, top productos, segmento A en comparativos */
  primary:    string;
  /** Compras, top servicios (contrasta fuerte vs primary), segmento B */
  secondary:  string;
  /** Distribución de servicios, tercer grupo */
  tertiary:   string;
  /** Compras por proveedor, cuarto grupo */
  quaternary: string;
  /** Elementos neutros sin relevancia especial */
  neutral:    string;
}

export interface KpiReportPalette {
  name:   string;
  colors: KpiReportPaletteColors;
}

export const KPI_REPORT_PALETTES: KpiReportPalette[] = [
  {
    name: "Azul / Naranja",
    colors: {
      primary:    "#2563EB", // blue-600
      secondary:  "#F97316", // orange-500  — alto contraste vs azul
      tertiary:   "#16A34A", // green-600
      quaternary: "#7C3AED", // violet-700
      neutral:    "#64748B", // slate-500
    },
  },
  {
    name: "Verde / Morado",
    colors: {
      primary:    "#059669", // emerald-600
      secondary:  "#7C3AED", // violet-700  — alto contraste vs verde
      tertiary:   "#DC2626", // red-600
      quaternary: "#0891B2", // cyan-600
      neutral:    "#64748B",
    },
  },
  {
    name: "Índigo / Ámbar",
    colors: {
      primary:    "#4F46E5", // indigo-600
      secondary:  "#D97706", // amber-600   — alto contraste vs índigo
      tertiary:   "#0F766E", // teal-700
      quaternary: "#BE123C", // rose-700
      neutral:    "#64748B",
    },
  },
  {
    name: "Cian / Carmesí",
    colors: {
      primary:    "#0891B2", // cyan-600
      secondary:  "#E11D48", // rose-600    — alto contraste vs cian
      tertiary:   "#65A30D", // lime-600
      quaternary: "#9333EA", // purple-600
      neutral:    "#64748B",
    },
  },
];

// ── Selectors ─────────────────────────────────────────────────────

/** Paleta aleatoria. Llamar solo en cliente (usa Math.random). */
export function getRandomKpiReportPalette(): KpiReportPalette {
  const idx = Math.floor(Math.random() * KPI_REPORT_PALETTES.length);
  return KPI_REPORT_PALETTES[idx]!;
}

/** Paleta por índice, segura en cualquier contexto. */
export function getKpiReportPaletteByIndex(index: number): KpiReportPalette {
  return KPI_REPORT_PALETTES[((index % KPI_REPORT_PALETTES.length) + KPI_REPORT_PALETTES.length) % KPI_REPORT_PALETTES.length]!;
}

/** Primera paleta. Segura en SSR, usada como fallback. */
export function getDefaultKpiReportPalette(): KpiReportPalette {
  return KPI_REPORT_PALETTES[0]!;
}

// ── Hex → RGB tuple (for jsPDF) ──────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  const r     = parseInt(clean.slice(0, 2), 16);
  const g     = parseInt(clean.slice(2, 4), 16);
  const b     = parseInt(clean.slice(4, 6), 16);
  return [
    Number.isNaN(r) ? 0 : r,
    Number.isNaN(g) ? 0 : g,
    Number.isNaN(b) ? 0 : b,
  ];
}

/** Pre-resuelve todos los colores de una paleta a tuplas RGB. */
export interface ResolvedPalette {
  primary:    [number, number, number];
  secondary:  [number, number, number];
  tertiary:   [number, number, number];
  quaternary: [number, number, number];
  neutral:    [number, number, number];
}

export function resolvePalette(palette: KpiReportPalette): ResolvedPalette {
  return {
    primary:    hexToRgb(palette.colors.primary),
    secondary:  hexToRgb(palette.colors.secondary),
    tertiary:   hexToRgb(palette.colors.tertiary),
    quaternary: hexToRgb(palette.colors.quaternary),
    neutral:    hexToRgb(palette.colors.neutral),
  };
}
