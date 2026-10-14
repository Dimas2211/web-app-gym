// ─────────────────────────────────────────────────────────────────
// platform — platform-organizations-license-table.test.tsx
//
// Listado /dashboard/platform/organizations: estado configurado +
// estado EFECTIVO derivado en servidor por la política central, con los
// mismos labels/colores que el detalle (PlatformLicensePanel). Filtros
// sin cambios (licencia filtra por estado configurado).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({ findManyMock: vi.fn(), countMock: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    platformOrganization: { findMany: h.findManyMock, count: h.countMock },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("../actions/update-organization-license.action", () => ({
  updateOrganizationLicenseAction: vi.fn(),
}));

import { listPlatformOrganizationsQuery } from "../queries/list-platform-organizations";
import { PlatformOrganizationsTable } from "./platform-organizations-table";
import { PlatformLicensePanel } from "./platform-license-panel";
import { filterPlatformOrganizations } from "../lib/filter-platform-organizations";
import type {
  PlatformOrganizationDetail,
  PlatformOrganizationListRow,
} from "../types/platform.types";

const SV = "America/El_Salvador";
/** 2026-10-14 12:00 en El Salvador (18:00 UTC). */
const NOW = new Date("2026-10-14T18:00:00Z");
const day = (ymd: string) => new Date(ymd); // persistido como medianoche UTC

function dbRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    code: id,
    name: `Org ${id}`,
    legal_name: null,
    tenant_id: `tenant-${id}`,
    status: "ACTIVE",
    license_status: "ACTIVE",
    billing_cycle: "MONTHLY",
    provisioning_status: "READY",
    country_code: "SV",
    timezone: SV,
    trial_ends_at: null,
    license_expires_at: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
    vertical: { id: "v-gym", code: "GYM", name: "Gimnasio" },
    plan: { id: "p-basic", code: "BASIC", name: "Básico" },
    ...overrides,
  };
}

const CASES = [
  { id: "trial-ok",       row: { license_status: "TRIAL", trial_ends_at: day("2026-10-20") },        label: "Trial vigente",                                      tone: "ok" },
  { id: "trial-expired",  row: { license_status: "TRIAL", trial_ends_at: day("2026-10-13") },        label: "Trial vencido por fecha",                            tone: "blocked" },
  { id: "trial-nodate",   row: { license_status: "TRIAL", trial_ends_at: null },                     label: "Trial sin fecha de fin (configuración incompleta)",  tone: "warning" },
  { id: "active-ok",      row: { license_expires_at: day("2026-11-30") },                            label: "Licencia vigente",                                   tone: "ok" },
  { id: "active-expired", row: { license_expires_at: day("2026-10-01") },                            label: "Licencia vencida por fecha",                         tone: "blocked" },
  { id: "lic-suspended",  row: { license_status: "SUSPENDED" },                                      label: "Licencia suspendida",                                tone: "blocked" },
  { id: "lic-cancelled",  row: { license_status: "CANCELLED" },                                      label: "Licencia cancelada",                                 tone: "blocked" },
  { id: "org-suspended",  row: { status: "SUSPENDED" },                                              label: "Organización suspendida",                            tone: "blocked" },
] as const;

const TONE_CLASS = { ok: "bg-green-100 text-green-700", warning: "bg-amber-100 text-amber-700", blocked: "bg-red-100 text-red-700" };

async function loadRows(rows: ReturnType<typeof dbRow>[], now = NOW): Promise<PlatformOrganizationListRow[]> {
  h.findManyMock.mockResolvedValue(rows);
  h.countMock.mockResolvedValue(rows.length);
  return (await listPlatformOrganizationsQuery({ page_size: 500 }, now)).items;
}

beforeEach(() => vi.clearAllMocks());

describe("listPlatformOrganizationsQuery — estado efectivo derivado en servidor", () => {
  it("selecciona trial_ends_at y license_expires_at", async () => {
    await loadRows([dbRow("a")]);
    expect(h.findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ trial_ends_at: true, license_expires_at: true, timezone: true }),
      }),
    );
  });

  for (const c of CASES) {
    it(`${c.id} → "${c.label}"`, async () => {
      const [item] = await loadRows([dbRow(c.id, c.row)]);
      expect(item.effective_license).toMatchObject({ label: c.label, tone: c.tone });
      expect(item.effective_license.allowed).toBe(c.tone !== "blocked");
    });
  }

  it("resultado plano y serializable (sin Date ni funciones)", async () => {
    const [item] = await loadRows([dbRow("trial-expired", CASES[1].row)]);
    expect(JSON.parse(JSON.stringify(item.effective_license))).toEqual(item.effective_license);
    expect(item.effective_license).toEqual({
      allowed: false,
      reason: "TRIAL_EXPIRED",
      label: "Trial vencido por fecha",
      tone: "blocked",
    });
  });

  it("date-only en America/El_Salvador: el día de vencimiento sigue vigente hasta medianoche local", async () => {
    const row = dbRow("boundary", { license_status: "TRIAL", trial_ends_at: day("2026-10-14") });
    // 2026-10-15 05:59 UTC = 2026-10-14 23:59 local → vigente
    const [late] = await loadRows([row], new Date("2026-10-15T05:59:00Z"));
    expect(late.effective_license.label).toBe("Trial vigente");
    // 2026-10-15 06:00 UTC = 2026-10-15 00:00 local → vencido
    const [next] = await loadRows([row], new Date("2026-10-15T06:00:00Z"));
    expect(next.effective_license.label).toBe("Trial vencido por fecha");
  });

  it("un único now por carga, cada fila en SU timezone", async () => {
    const at = new Date("2026-10-15T03:00:00Z"); // 14 en El Salvador, 15 en UTC
    const rows = [
      dbRow("sv", { license_status: "TRIAL", trial_ends_at: day("2026-10-14"), timezone: SV }),
      dbRow("utc", { license_status: "TRIAL", trial_ends_at: day("2026-10-14"), timezone: "UTC" }),
    ];
    const [sv, utc] = await loadRows(rows, at);
    expect(sv.effective_license.label).toBe("Trial vigente");
    expect(utc.effective_license.label).toBe("Trial vencido por fecha");
  });

  it("no persiste nada: solo lectura (findMany + count)", async () => {
    await loadRows([dbRow("a")]);
    expect(h.findManyMock).toHaveBeenCalledTimes(1);
    expect(h.countMock).toHaveBeenCalledTimes(1);
  });
});

describe("PlatformOrganizationsTable", () => {
  it("conserva status técnico y licencia configurada, y agrega Estado efectivo con colores del detalle", async () => {
    const rows = await loadRows(CASES.map((c) => dbRow(c.id, c.row)));
    const html = renderToStaticMarkup(<PlatformOrganizationsTable items={rows} isLoading={false} />);
    expect(html).toContain(">Status<");
    expect(html).toContain(">Licencia<");
    expect(html).toContain(">Estado efectivo<");
    expect(html).toContain(">TRIAL<");
    expect(html).toContain(">SUSPENDED<");
    for (const c of CASES) {
      expect(html).toContain(`${TONE_CLASS[c.tone]}">${c.label}<`);
    }
  });
});

describe("Tabla y detalle usan resultados equivalentes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  for (const c of CASES) {
    it(`${c.id}: mismo label y color en tabla y en PlatformLicensePanel`, async () => {
      const raw = dbRow(c.id, c.row);
      const [item] = await loadRows([raw]);
      const detail = {
        ...raw,
        suspended_at: null,
        suspension_reason: null,
      } as unknown as PlatformOrganizationDetail;
      const panelHtml = renderToStaticMarkup(<PlatformLicensePanel org={detail} />);
      expect(panelHtml).toContain(`${TONE_CLASS[item.effective_license.tone]}">${item.effective_license.label}<`);
    });
  }
});

describe("filterPlatformOrganizations — sin regresión", () => {
  const NO_FILTERS = { search: "", statusFilter: "", licenseFilter: "", verticalFilter: "", planFilter: "" } as const;

  async function allRows() {
    return loadRows([
      ...CASES.map((c) => dbRow(c.id, c.row)),
      dbRow("other-vertical", { name: "Clínica Norte", vertical: { id: "v-vet", code: "VET", name: "Vet" }, plan: null }),
    ]);
  }

  it("sin filtros → todas", async () => {
    const rows = await allRows();
    expect(filterPlatformOrganizations(rows, NO_FILTERS)).toHaveLength(rows.length);
  });

  it("licencia filtra por estado CONFIGURADO: TRIAL incluye el trial vencido por fecha", async () => {
    const ids = filterPlatformOrganizations(await allRows(), { ...NO_FILTERS, licenseFilter: "TRIAL" }).map((o) => o.id);
    expect(ids).toEqual(["trial-ok", "trial-expired", "trial-nodate"]);
  });

  it("licencia EXPIRED no incluye organizaciones vencidas solo por fecha", async () => {
    expect(filterPlatformOrganizations(await allRows(), { ...NO_FILTERS, licenseFilter: "EXPIRED" })).toEqual([]);
  });

  it("status, búsqueda, vertical y plan mantienen su comportamiento", async () => {
    const rows = await allRows();
    expect(filterPlatformOrganizations(rows, { ...NO_FILTERS, statusFilter: "SUSPENDED" }).map((o) => o.id)).toEqual([
      "org-suspended",
    ]);
    expect(filterPlatformOrganizations(rows, { ...NO_FILTERS, search: "  clínica " }).map((o) => o.id)).toEqual([
      "other-vertical",
    ]);
    expect(filterPlatformOrganizations(rows, { ...NO_FILTERS, search: "TRIAL-OK" }).map((o) => o.id)).toEqual([
      "trial-ok",
    ]);
    expect(filterPlatformOrganizations(rows, { ...NO_FILTERS, verticalFilter: "v-vet" }).map((o) => o.id)).toEqual([
      "other-vertical",
    ]);
    expect(filterPlatformOrganizations(rows, { ...NO_FILTERS, planFilter: "p-basic" })).toHaveLength(CASES.length);
  });
});
