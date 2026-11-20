import { describe, expect, it } from "vitest";
import type { MembershipStatus } from "@prisma/client";
import { effectiveMembershipStatus, membershipExpiringSoon, membershipToday, withMembershipValidity } from "./membership-validity";
const m = (end_date: string, status: MembershipStatus = "active") => ({ status, end_date: new Date(`${end_date}T00:00:00.000Z`) });

describe("vencimiento permanente de membresías GYM", () => {
  it("Doris: vence la anterior y conserva la renovación, sin modificar los registros", () => {
    const old = m("2026-11-08");
    const renewal = m("2026-12-09");
    expect(withMembershipValidity(old, "2026-11-19")).toMatchObject({ status: "expired", stored_status: "active" });
    expect(withMembershipValidity(renewal, "2026-11-19")).toMatchObject({ status: "active", stored_status: "active" });
    expect(old.status).toBe("active");
  });
  it("el último día completo sigue vigente y vence automáticamente a medianoche local", () => {
    const membership = m("2026-11-19");
    const before = membershipToday("America/El_Salvador", new Date("2026-11-20T05:59:59.999Z"));
    const after = membershipToday("America/El_Salvador", new Date("2026-11-20T06:00:00.000Z"));
    expect(effectiveMembershipStatus(membership, before)).toBe("active");
    expect(effectiveMembershipStatus(membership, after)).toBe("expired");
  });
  it("cada gimnasio usa su propio día local, aunque el servidor y el instante sean los mismos", () => {
    const now = new Date("2026-11-20T02:00:00Z");
    expect(effectiveMembershipStatus(m("2026-11-19"), membershipToday("America/El_Salvador", now))).toBe("active");
    expect(effectiveMembershipStatus(m("2026-11-19"), membershipToday("Asia/Tokyo", now))).toBe("expired");
  });
  it.each([null, undefined, "", "Invalid/Zone"])("sin configuración válida (%s) usa el default del producto", zone => {
    expect(membershipToday(zone, new Date("2026-11-20T02:00:00Z"))).toBe("2026-11-19");
  });
  it.each(["cancelled", "suspended", "expired"] as const)("conserva el estado explícito %s", status => {
    expect(effectiveMembershipStatus(m("2026-11-08", status), "2026-11-19")).toBe(status);
    expect(effectiveMembershipStatus(m("2026-12-09", status), "2026-11-19")).toBe(status);
  });
  it("maneja cambios de año, años bisiestos y horario de verano IANA", () => {
    expect(effectiveMembershipStatus(m("2026-12-31"), "2027-01-01")).toBe("expired");
    expect(effectiveMembershipStatus(m("2024-02-29"), "2024-03-01")).toBe("expired");
    expect(membershipToday("America/New_York", new Date("2026-03-09T03:59:00Z"))).toBe("2026-03-08");
    expect(membershipToday("America/New_York", new Date("2026-03-09T04:00:00Z"))).toBe("2026-03-09");
  });
  it("por vencer incluye hoy y el séptimo día pero no membresías vencidas ni el octavo día", () => {
    expect(membershipExpiringSoon("2026-11-18", "2026-11-19")).toBe(false);
    expect(membershipExpiringSoon("2026-11-19", "2026-11-19")).toBe(true);
    expect(membershipExpiringSoon("2026-11-26", "2026-11-19")).toBe(true);
    expect(membershipExpiringSoon("2026-11-27", "2026-11-19")).toBe(false);
  });
});
