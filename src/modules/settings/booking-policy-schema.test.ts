// GYM-BOOKINGS 3A — schema de la política de reservas (GymSettings).
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { GYM_BOOKING_POLICY_DEFAULTS } from "@/modules/classes/booking/booking-policy";
import { GYM_BOOKING_POLICY_LIMITS, gymBookingPolicySchema } from "./schemas";

const valid = { ...GYM_BOOKING_POLICY_DEFAULTS, timezone: "America/El_Salvador" };

describe("gymBookingPolicySchema", () => {
  it("acepta los defaults de 2A (flags apagados, sin timezone)", () => {
    const r = gymBookingPolicySchema.safeParse({ ...GYM_BOOKING_POLICY_DEFAULTS });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.personalized_booking_enabled).toBe(false);
      expect(r.data.group_booking_enabled).toBe(false);
      expect(r.data.apply_policy_to_open).toBe(false);
    }
  });
  it("timezone IANA válida → OK; inválida → rechazo", () => {
    expect(gymBookingPolicySchema.safeParse(valid).success).toBe(true);
    const bad = gymBookingPolicySchema.safeParse({ ...valid, timezone: "GMT-6 local" });
    expect(bad.success).toBe(false);
    expect(bad.success ? null : bad.error.flatten().fieldErrors.timezone).toBeTruthy();
  });
  it("habilitar PERSONALIZED o GROUP sin timezone → rechazo (R18)", () => {
    for (const flag of ["personalized_booking_enabled", "group_booking_enabled"] as const) {
      const r = gymBookingPolicySchema.safeParse({ ...GYM_BOOKING_POLICY_DEFAULTS, [flag]: true });
      expect(r.success).toBe(false);
    }
  });
  it("rangos: fuera de límites → rechazo; números como texto del formulario → coerción", () => {
    for (const [field, { min, max }] of Object.entries(GYM_BOOKING_POLICY_LIMITS)) {
      expect(gymBookingPolicySchema.safeParse({ ...valid, [field]: min - 1 }).success).toBe(false);
      expect(gymBookingPolicySchema.safeParse({ ...valid, [field]: max + 1 }).success).toBe(false);
      expect(gymBookingPolicySchema.safeParse({ ...valid, [field]: String(min) }).success).toBe(true);
    }
    expect(gymBookingPolicySchema.safeParse({ ...valid, booking_horizon_days: "1.5" }).success).toBe(false);
  });
  it("los defaults de columna caen dentro de los límites (sin defaults duplicados)", () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "GymSettings")!;
    for (const field of Object.keys(GYM_BOOKING_POLICY_LIMITS) as (keyof typeof GYM_BOOKING_POLICY_LIMITS)[]) {
      const col = model.fields.find((f) => f.name === field)!;
      const def = col.default as number;
      expect(def).toBe(GYM_BOOKING_POLICY_DEFAULTS[field]);
      expect(def).toBeGreaterThanOrEqual(GYM_BOOKING_POLICY_LIMITS[field].min);
      expect(def).toBeLessThanOrEqual(GYM_BOOKING_POLICY_LIMITS[field].max);
    }
  });
});
