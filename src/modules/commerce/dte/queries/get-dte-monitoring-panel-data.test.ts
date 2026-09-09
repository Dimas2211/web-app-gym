// ─────────────────────────────────────────────────────────────────
// commerce/dte — get-dte-monitoring-panel-data.test.ts
//
// FASE IV-C — garantiza: composición correcta de las 3 funciones de
// metering ya certificadas, validación estricta de periodKey (YYYY-MM,
// nunca acepta strings arbitrarios), zero pending funciona, y
// listPendingDteMeteringReservations siempre recibe el tenant efectivo.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getDteMonthlyMeteringStatusSpy,
  listDteMonthlyMeteringEntriesSpy,
  listPendingDteMeteringReservationsSpy,
} = vi.hoisted(() => ({
  getDteMonthlyMeteringStatusSpy: vi.fn(),
  listDteMonthlyMeteringEntriesSpy: vi.fn(),
  listPendingDteMeteringReservationsSpy: vi.fn(),
}));

vi.mock("../services/dte-fiscal-metering.service", () => ({
  getDteMonthlyMeteringStatus: getDteMonthlyMeteringStatusSpy,
  listDteMonthlyMeteringEntries: listDteMonthlyMeteringEntriesSpy,
  listPendingDteMeteringReservations: listPendingDteMeteringReservationsSpy,
}));

import { getDteMonitoringPanelData, isValidPeriodKey } from "./get-dte-monitoring-panel-data";

const FAKE_STATUS = {
  entitlementCode: "fiscal.dte.monthly_issued",
  periodKey: "2026-09",
  timezone: "America/El_Salvador",
  consumed: 10,
  pending: 2,
  occupied: 12,
  limit: 500,
  isUnlimited: false,
  configured: true,
  remainingForNewIssue: 488,
  source: "PLAN",
};

const commercialCtx = { tenantId: "tenant-1" } as never;
const runtimeDb = { __marker: "runtime" } as never;

beforeEach(() => {
  getDteMonthlyMeteringStatusSpy.mockReset();
  listDteMonthlyMeteringEntriesSpy.mockReset();
  listPendingDteMeteringReservationsSpy.mockReset();
});

describe("isValidPeriodKey", () => {
  it("acepta YYYY-MM estricto", () => {
    expect(isValidPeriodKey("2026-09")).toBe(true);
  });
  it("rechaza formatos inválidos/SQL-ish", () => {
    expect(isValidPeriodKey("2026-9")).toBe(false);
    expect(isValidPeriodKey("2026/09")).toBe(false);
    expect(isValidPeriodKey("'; DROP TABLE x; --")).toBe(false);
    expect(isValidPeriodKey(null)).toBe(false);
    expect(isValidPeriodKey(undefined)).toBe(false);
    expect(isValidPeriodKey("")).toBe(false);
  });
});

describe("getDteMonitoringPanelData", () => {
  it("compone status + pending + periodEntries del periodo vigente cuando no se pide uno explícito", async () => {
    getDteMonthlyMeteringStatusSpy.mockResolvedValue(FAKE_STATUS);
    listPendingDteMeteringReservationsSpy.mockResolvedValue([]);
    listDteMonthlyMeteringEntriesSpy.mockResolvedValue([{ dteDocumentId: "doc-1" }]);

    const result = await getDteMonitoringPanelData({
      tenantId: "tenant-1",
      commercialCtx,
      runtimeDb,
    });

    expect(result.status).toBe(FAKE_STATUS);
    expect(result.periodKey).toBe("2026-09");
    expect(listDteMonthlyMeteringEntriesSpy).toHaveBeenCalledWith("tenant-1", "2026-09", runtimeDb);
    expect(result.periodEntries).toEqual([{ dteDocumentId: "doc-1" }]);
  });

  it("usa el periodo solicitado si es válido, en vez del vigente", async () => {
    getDteMonthlyMeteringStatusSpy.mockResolvedValue(FAKE_STATUS);
    listPendingDteMeteringReservationsSpy.mockResolvedValue([]);
    listDteMonthlyMeteringEntriesSpy.mockResolvedValue([]);

    await getDteMonitoringPanelData({
      tenantId: "tenant-1",
      commercialCtx,
      runtimeDb,
      requestedPeriodKey: "2026-08",
    });

    expect(listDteMonthlyMeteringEntriesSpy).toHaveBeenCalledWith("tenant-1", "2026-08", runtimeDb);
  });

  it("periodo solicitado inválido -> ignora y cae al vigente (nunca pasa el string crudo a la query)", async () => {
    getDteMonthlyMeteringStatusSpy.mockResolvedValue(FAKE_STATUS);
    listPendingDteMeteringReservationsSpy.mockResolvedValue([]);
    listDteMonthlyMeteringEntriesSpy.mockResolvedValue([]);

    await getDteMonitoringPanelData({
      tenantId: "tenant-1",
      commercialCtx,
      runtimeDb,
      requestedPeriodKey: "'; DROP TABLE x; --",
    });

    expect(listDteMonthlyMeteringEntriesSpy).toHaveBeenCalledWith("tenant-1", "2026-09", runtimeDb);
  });

  it("periodKey null (timezone inválida/no configurado) -> periodEntries=[] sin llamar la query de entries", async () => {
    getDteMonthlyMeteringStatusSpy.mockResolvedValue({ ...FAKE_STATUS, periodKey: null });
    listPendingDteMeteringReservationsSpy.mockResolvedValue([]);

    const result = await getDteMonitoringPanelData({
      tenantId: "tenant-1",
      commercialCtx,
      runtimeDb,
    });

    expect(result.periodEntries).toEqual([]);
    expect(listDteMonthlyMeteringEntriesSpy).not.toHaveBeenCalled();
  });

  it("zero pending funciona (array vacío, no lanza)", async () => {
    getDteMonthlyMeteringStatusSpy.mockResolvedValue(FAKE_STATUS);
    listPendingDteMeteringReservationsSpy.mockResolvedValue([]);
    listDteMonthlyMeteringEntriesSpy.mockResolvedValue([]);

    const result = await getDteMonitoringPanelData({ tenantId: "tenant-1", commercialCtx, runtimeDb });
    expect(result.pending).toEqual([]);
  });

  it("listPendingDteMeteringReservations siempre recibe el tenant efectivo (tenant isolation)", async () => {
    getDteMonthlyMeteringStatusSpy.mockResolvedValue(FAKE_STATUS);
    listPendingDteMeteringReservationsSpy.mockResolvedValue([]);
    listDteMonthlyMeteringEntriesSpy.mockResolvedValue([]);

    await getDteMonitoringPanelData({ tenantId: "tenant-xyz", commercialCtx, runtimeDb });

    expect(listPendingDteMeteringReservationsSpy).toHaveBeenCalledWith(runtimeDb, { tenantId: "tenant-xyz" });
  });
});
