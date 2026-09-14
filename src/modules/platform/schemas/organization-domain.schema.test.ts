// ─────────────────────────────────────────────────────────────────
// platform/schemas — organization-domain.schema.test.ts
//
// FASE VI-C — ETAPA T. No modifica dominios existentes; solo valida
// entradas nuevas de create/update.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { organizationDomainSchema } from "./organization-domain.schema";

describe("organizationDomainSchema", () => {
  it("acepta hostname puro y lo normaliza a minúsculas", () => {
    expect(organizationDomainSchema.parse("TrustMe.GetZolvi.com")).toBe("trustme.getzolvi.com");
  });

  it("acepta null/undefined/'' (organización sin dominio propio)", () => {
    expect(organizationDomainSchema.parse(null)).toBeNull();
    expect(organizationDomainSchema.parse(undefined)).toBeUndefined();
    expect(organizationDomainSchema.parse("")).toBe("");
  });

  it("rechaza valores con protocolo", () => {
    expect(() => organizationDomainSchema.parse("https://trustme.getzolvi.com")).toThrow();
  });

  it("rechaza valores con path", () => {
    expect(() => organizationDomainSchema.parse("trustme.getzolvi.com/login")).toThrow();
  });

  it("rechaza valores con puerto (no aplica a un dominio almacenado)", () => {
    expect(() => organizationDomainSchema.parse("trustme.getzolvi.com:443")).toThrow();
  });
});
