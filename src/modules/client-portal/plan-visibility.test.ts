import { describe, expect, it } from "vitest";
import { businessDaysSince, plansVisibleForMembership } from "./plan-visibility";

// Política vigente: 3 días hábiles (lun–vie) DESPUÉS del día de vencimiento.
describe("política de visibilidad de planes según membresía", () => {
  it("cuenta días hábiles sin incluir el día de vencimiento y salta fines de semana", () => {
    // vence miércoles 2026-03-04
    expect(businessDaysSince("2026-03-04", "2026-03-04")).toBe(0);
    expect(businessDaysSince("2026-03-04", "2026-03-05")).toBe(1); // jue
    expect(businessDaysSince("2026-03-04", "2026-03-06")).toBe(2); // vie
    expect(businessDaysSince("2026-03-04", "2026-03-08")).toBe(2); // sáb y dom no cuentan
    expect(businessDaysSince("2026-03-04", "2026-03-09")).toBe(3); // lun
  });

  it("con membresía activa siempre visible; sin historial de membresía, visible", () => {
    expect(plansVisibleForMembership({ hasActiveMembership: true, lastExpiredEnd: "2025-01-01", today: "2026-03-09" })).toBe(true);
    expect(plansVisibleForMembership({ hasActiveMembership: false, lastExpiredEnd: null, today: "2026-03-09" })).toBe(true);
  });

  it("vencida: visible hasta 2 días hábiles; desde el tercero se oculta", () => {
    const base = { hasActiveMembership: false, lastExpiredEnd: "2026-03-04" };
    expect(plansVisibleForMembership({ ...base, today: "2026-03-06" })).toBe(true);
    expect(plansVisibleForMembership({ ...base, today: "2026-03-08" })).toBe(true); // fin de semana no suma
    expect(plansVisibleForMembership({ ...base, today: "2026-03-09" })).toBe(false);
  });

  it("vence viernes: el fin de semana no cuenta y el tercer día hábil es el miércoles", () => {
    const base = { hasActiveMembership: false, lastExpiredEnd: "2026-03-06" };
    expect(plansVisibleForMembership({ ...base, today: "2026-03-10" })).toBe(true); // lun+mar = 2
    expect(plansVisibleForMembership({ ...base, today: "2026-03-11" })).toBe(false); // mié = 3
  });
});
