// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2A — booking-policy.test.ts
// Defaults alineados con el schema (DMMF), fallo cerrado y no regresión
// para OPEN/NORMAL.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  GYM_BOOKING_POLICY_DEFAULTS,
  isValidIanaTimeZone,
  policyAppliesTo,
  resolveGymBookingPolicy,
  sessionKindReadiness,
  type GymBookingSettingsRow,
} from "./booking-policy";

const gymSettingsModel = Prisma.dmmf.datamodel.models.find((m) => m.name === "GymSettings")!;

function row(overrides: Partial<GymBookingSettingsRow> = {}): GymBookingSettingsRow {
  return { ...GYM_BOOKING_POLICY_DEFAULTS, ...overrides };
}

describe("GYM_BOOKING_POLICY_DEFAULTS", () => {
  it("coincide con los @default de GymSettings en schema.prisma", () => {
    for (const [field, value] of Object.entries(GYM_BOOKING_POLICY_DEFAULTS)) {
      const f = gymSettingsModel.fields.find((x) => x.name === field);
      expect(f, field).toBeDefined();
      if (value === null) {
        expect(f!.isRequired, field).toBe(false);
        expect(f!.hasDefaultValue, field).toBe(false);
      } else {
        expect(f!.hasDefaultValue, field).toBe(true);
        expect(f!.default, field).toBe(value);
      }
    }
  });

  it("usa los defaults de la iniciativa (14 días, 120 min, tardía consume, cupo 1, flags apagados)", () => {
    const p = resolveGymBookingPolicy(null);
    expect(p).toMatchObject({
      bookingHorizonDays: 14,
      cancelMinLeadMinutes: 120,
      lateCancelConsumesSession: true,
      personalizedDefaultCapacity: 1,
      personalizedBookingEnabled: false,
      groupBookingEnabled: false,
      applyPolicyToOpen: false,
      timezone: null,
      fromDefaults: true,
    });
  });
});

describe("resolveGymBookingPolicy", () => {
  it("respeta los valores configurados por gimnasio", () => {
    const p = resolveGymBookingPolicy(row({ booking_horizon_days: 7, cancel_min_lead_minutes: 60, timezone: "America/El_Salvador" }));
    expect(p.bookingHorizonDays).toBe(7);
    expect(p.cancelMinLeadMinutes).toBe(60);
    expect(p.timezone).toBe("America/El_Salvador");
    expect(p.fromDefaults).toBe(false);
  });

  it("descarta zonas horarias inválidas (fallo cerrado posterior)", () => {
    expect(resolveGymBookingPolicy(row({ timezone: "Mars/Olympus" })).timezone).toBeNull();
    expect(resolveGymBookingPolicy(row({ timezone: "" })).timezone).toBeNull();
    expect(isValidIanaTimeZone("UTC")).toBe(true);
    expect(isValidIanaTimeZone(null)).toBe(false);
  });
});

describe("sessionKindReadiness (R18)", () => {
  it("OPEN siempre opera, aunque no haya timezone ni flags", () => {
    expect(sessionKindReadiness(resolveGymBookingPolicy(null), "OPEN")).toEqual({ ok: true });
  });

  it("PERSONALIZED/GROUP fallan cerrados con el flag apagado", () => {
    const p = resolveGymBookingPolicy(row({ timezone: "UTC" }));
    expect(sessionKindReadiness(p, "PERSONALIZED")).toEqual({ ok: false, code: "MODALITY_DISABLED" });
    expect(sessionKindReadiness(p, "GROUP")).toEqual({ ok: false, code: "MODALITY_DISABLED" });
  });

  it("PERSONALIZED/GROUP fallan cerrados sin timezone aunque el flag esté activo", () => {
    const p = resolveGymBookingPolicy(row({ personalized_booking_enabled: true, group_booking_enabled: true }));
    expect(sessionKindReadiness(p, "PERSONALIZED")).toEqual({ ok: false, code: "TIMEZONE_NOT_CONFIGURED" });
    expect(sessionKindReadiness(p, "GROUP")).toEqual({ ok: false, code: "TIMEZONE_NOT_CONFIGURED" });
  });

  it("los flags son independientes por modalidad", () => {
    const p = resolveGymBookingPolicy(row({ timezone: "UTC", group_booking_enabled: true }));
    expect(sessionKindReadiness(p, "GROUP")).toEqual({ ok: true });
    expect(sessionKindReadiness(p, "PERSONALIZED")).toEqual({ ok: false, code: "MODALITY_DISABLED" });
  });
});

describe("policyAppliesTo (corrección B: sin regresión NORMAL/OPEN)", () => {
  it("no aplica horizonte ni ventana de cancelación a OPEN por defecto", () => {
    const p = resolveGymBookingPolicy(null);
    expect(policyAppliesTo(p, "OPEN")).toBe(false);
    expect(policyAppliesTo(p, "PERSONALIZED")).toBe(true);
    expect(policyAppliesTo(p, "GROUP")).toBe(true);
  });

  it("solo aplica a OPEN con activación explícita apply_policy_to_open", () => {
    expect(policyAppliesTo(resolveGymBookingPolicy(row({ apply_policy_to_open: true })), "OPEN")).toBe(true);
  });
});
