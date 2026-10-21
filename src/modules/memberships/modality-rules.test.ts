// GYM-BOOKINGS 3A — reglas puras de modalidad (cliente, plan, membresía).
import { describe, expect, it } from "vitest";
import { membershipSnapshotFromPlan, modalityChangeBlockers, saleModalityFailure } from "./modality-rules";

describe("membershipSnapshotFromPlan", () => {
  it("NORMAL: sessions_total = null aunque el plan tenga límite (OPEN no consume)", () => {
    expect(membershipSnapshotFromPlan({ modality: "NORMAL", sessions_limit: 12 })).toEqual({ modality: "NORMAL", sessions_total: null });
  });
  it("PERSONALIZED / GROUP copian sessions_limit (null = ilimitado)", () => {
    expect(membershipSnapshotFromPlan({ modality: "PERSONALIZED", sessions_limit: 8 })).toEqual({ modality: "PERSONALIZED", sessions_total: 8 });
    expect(membershipSnapshotFromPlan({ modality: "GROUP", sessions_limit: null })).toEqual({ modality: "GROUP", sessions_total: null });
  });
});

describe("saleModalityFailure", () => {
  it("misma modalidad → OK (incluido el caso heredado NORMAL/NORMAL)", () => {
    expect(saleModalityFailure("NORMAL", "NORMAL")).toBeNull();
    expect(saleModalityFailure("GROUP", "GROUP")).toBeNull();
  });
  it("modalidades distintas → rechazo", () => {
    expect(saleModalityFailure("NORMAL", "PERSONALIZED")).toMatch(/Personalizada/);
    expect(saleModalityFailure("GROUP", "NORMAL")).toMatch(/Grupal/);
  });
});

describe("modalityChangeBlockers", () => {
  it("sin dependencias → sin bloqueos", () => {
    expect(modalityChangeBlockers("PERSONALIZED", { currentMemberships: [], futureBookings: [] })).toEqual([]);
  });
  it("membresía vigente de otra modalidad bloquea; de la modalidad destino no", () => {
    expect(modalityChangeBlockers("GROUP", { currentMemberships: [{ modality: "NORMAL" }], futureBookings: [] })).toHaveLength(1);
    expect(modalityChangeBlockers("GROUP", { currentMemberships: [{ modality: "GROUP" }], futureBookings: [] })).toEqual([]);
  });
  it("reservas futuras en sesiones de otro tipo bloquean", () => {
    const r = modalityChangeBlockers("PERSONALIZED", {
      currentMemberships: [],
      futureBookings: [{ session_kind: "OPEN" }, { session_kind: "PERSONALIZED" }],
    });
    expect(r).toEqual(["1 reserva(s) futura(s) confirmada(s) en sesiones de otro tipo"]);
  });
});
