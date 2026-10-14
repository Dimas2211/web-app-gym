// ─────────────────────────────────────────────────────────────────
// platform/runtime — organization-access-policy.test.ts
//
// RUNTIME LICENSE ENFORCEMENT — política central pura, `now` inyectado.
// Fechas de licencia = DATE comercial válida durante TODO el día en la
// zona de la organización.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  evaluateOrganizationAccess,
  toStoredCalendarDate,
  getCalendarDateInTimeZone,
  formatStoredCalendarDate,
  describeEffectiveLicenseState,
  getAccessRestrictedMessage,
  getOrganizationAccessWarningMessage,
  type OrganizationAccessInput,
} from "./organization-access-policy";

const SV = "America/El_Salvador"; // UTC-6, sin DST

/** Fecha comercial tal como la persiste <input type=date> → z.coerce.date(). */
const stored = (ymd: string) => new Date(ymd);

/** "Ahora" = 2026-10-13 12:00 en El Salvador (18:00 UTC). */
const NOW = new Date("2026-10-13T18:00:00Z");

function org(overrides: Partial<OrganizationAccessInput> = {}): OrganizationAccessInput {
  return {
    status: "ACTIVE",
    license_status: "ACTIVE",
    billing_cycle: "MONTHLY",
    trial_ends_at: null,
    license_expires_at: null,
    timezone: SV,
    ...overrides,
  };
}

describe("TRIAL — trial_ends_at es autoritativa", () => {
  const trial = (d: string | null) =>
    org({ license_status: "TRIAL", trial_ends_at: d ? stored(d) : null });

  it("fecha ayer → blocked TRIAL_EXPIRED", () => {
    const r = evaluateOrganizationAccess(trial("2026-10-12"), NOW);
    expect(r).toMatchObject({ allowed: false, reason: "TRIAL_EXPIRED", blockedBy: "COMMERCIAL" });
  });

  it("fecha hoy → allowed", () => {
    expect(evaluateOrganizationAccess(trial("2026-10-13"), NOW)).toMatchObject({ allowed: true, reason: "OK" });
  });

  it("fecha mañana → allowed", () => {
    expect(evaluateOrganizationAccess(trial("2026-10-14"), NOW).allowed).toBe(true);
  });

  it("null → legacy allowed + advertencia de configuración incompleta", () => {
    const r = evaluateOrganizationAccess(trial(null), NOW);
    expect(r.allowed).toBe(true);
    expect(r.warnings).toContain("TRIAL_WITHOUT_END_DATE");
  });

  it("no usa license_expires_at para decidir el trial", () => {
    const r = evaluateOrganizationAccess(
      org({ license_status: "TRIAL", trial_ends_at: stored("2026-10-20"), license_expires_at: stored("2020-01-01") }),
      NOW,
    );
    expect(r.allowed).toBe(true);
    const r2 = evaluateOrganizationAccess(
      org({ license_status: "TRIAL", trial_ends_at: stored("2026-10-01"), license_expires_at: stored("2030-01-01") }),
      NOW,
    );
    expect(r2.reason).toBe("TRIAL_EXPIRED");
  });
});

describe("ACTIVE MONTHLY/ANNUAL", () => {
  for (const cycle of ["MONTHLY", "ANNUAL"] as const) {
    const active = (d: string | null) =>
      org({ billing_cycle: cycle, license_expires_at: d ? stored(d) : null });

    it(`${cycle}: expiry ayer → blocked ACTIVE_LICENSE_EXPIRED`, () => {
      expect(evaluateOrganizationAccess(active("2026-10-12"), NOW)).toMatchObject({
        allowed: false,
        reason: "ACTIVE_LICENSE_EXPIRED",
      });
    });
    it(`${cycle}: expiry hoy → allowed`, () => {
      expect(evaluateOrganizationAccess(active("2026-10-13"), NOW).allowed).toBe(true);
    });
    it(`${cycle}: expiry mañana → allowed`, () => {
      expect(evaluateOrganizationAccess(active("2026-10-14"), NOW).allowed).toBe(true);
    });
    it(`${cycle}: null → allowed (compatibilidad)`, () => {
      expect(evaluateOrganizationAccess(active(null), NOW).allowed).toBe(true);
    });
  }
});

describe("LIFETIME", () => {
  it("allowed aunque exista una fecha antigua", () => {
    const r = evaluateOrganizationAccess(
      org({ billing_cycle: "LIFETIME", license_expires_at: stored("2001-01-01") }),
      NOW,
    );
    expect(r).toMatchObject({ allowed: true, reason: "OK" });
  });
});

describe("Estados explícitos de licencia", () => {
  it.each([
    ["SUSPENDED", "LICENSE_SUSPENDED"],
    ["EXPIRED", "LICENSE_EXPIRED"],
    ["CANCELLED", "LICENSE_CANCELLED"],
  ] as const)("%s → blocked %s (aunque las fechas sean futuras)", (status, reason) => {
    const r = evaluateOrganizationAccess(
      org({ license_status: status, license_expires_at: stored("2099-01-01"), trial_ends_at: stored("2099-01-01") }),
      NOW,
    );
    expect(r).toMatchObject({ allowed: false, reason, blockedBy: "COMMERCIAL" });
  });

  it("license_status desconocido/ausente → fail closed", () => {
    const r = evaluateOrganizationAccess(org({ license_status: undefined as unknown as string }), NOW);
    expect(r).toMatchObject({ allowed: false, reason: "LICENSE_STATUS_INVALID" });
  });
});

describe("Organización (capa técnica)", () => {
  it.each([
    ["SUSPENDED", "ORGANIZATION_SUSPENDED"],
    ["CANCELLED", "ORGANIZATION_CANCELLED"],
  ] as const)("%s → blocked %s antes de mirar la licencia", (status, reason) => {
    const r = evaluateOrganizationAccess(org({ status, billing_cycle: "LIFETIME" }), NOW);
    expect(r).toMatchObject({ allowed: false, reason, blockedBy: "TECHNICAL" });
  });

  it("PENDING conserva elegibilidad técnica actual", () => {
    expect(evaluateOrganizationAccess(org({ status: "PENDING" }), NOW).allowed).toBe(true);
  });
});

describe("Timezone — frontera de día", () => {
  const trialEnds15 = org({ license_status: "TRIAL", trial_ends_at: stored("2026-10-15") });

  it("El Salvador: 2026-10-16 03:00 UTC sigue siendo 2026-10-15 local → allowed", () => {
    const r = evaluateOrganizationAccess(trialEnds15, new Date("2026-10-16T03:00:00Z"));
    expect(r.today).toBe("2026-10-15");
    expect(r.allowed).toBe(true);
  });

  it("El Salvador: 2026-10-16 05:59:59 UTC = último segundo del 15 local → allowed", () => {
    expect(evaluateOrganizationAccess(trialEnds15, new Date("2026-10-16T05:59:59Z")).allowed).toBe(true);
  });

  it("El Salvador: 2026-10-16 06:00 UTC = 00:00 del 16 local → blocked", () => {
    const r = evaluateOrganizationAccess(trialEnds15, new Date("2026-10-16T06:00:00Z"));
    expect(r.today).toBe("2026-10-16");
    expect(r.reason).toBe("TRIAL_EXPIRED");
  });

  it("timezone null → fallback UTC determinista + advertencia", () => {
    const r = evaluateOrganizationAccess({ ...trialEnds15, timezone: null }, new Date("2026-10-16T03:00:00Z"));
    expect(r.timeZone).toBe("UTC");
    expect(r.today).toBe("2026-10-16");
    expect(r.reason).toBe("TRIAL_EXPIRED");
    expect(r.warnings).toContain("TIMEZONE_FALLBACK_UTC");
    expect(getOrganizationAccessWarningMessage(r)).toMatch(/UTC/);
  });

  it("timezone inválido → no crash, fallback UTC (sin bypass)", () => {
    const run = () =>
      evaluateOrganizationAccess({ ...trialEnds15, timezone: "Mars/Olympus_Mons" }, new Date("2026-10-20T12:00:00Z"));
    expect(run).not.toThrow();
    expect(run()).toMatchObject({ allowed: false, reason: "TRIAL_EXPIRED", timeZone: "UTC" });
  });

  it("getCalendarDateInTimeZone usa formatToParts (YYYY-MM-DD estable)", () => {
    expect(getCalendarDateInTimeZone(new Date("2026-01-01T05:00:00Z"), SV)).toEqual({
      date: "2025-12-31",
      timeZone: SV,
      fallback: false,
    });
  });
});

describe("Date display — sin desplazamiento de zona", () => {
  it("stored 2026-10-12T00:00:00Z → input/display 2026-10-12 (nunca 2026-10-11)", () => {
    const d = new Date("2026-10-12T00:00:00Z");
    expect(toStoredCalendarDate(d)).toBe("2026-10-12");
    expect(formatStoredCalendarDate(d)).toBe("12/10/2026");
    // Contraste: el formateo ingenuo en El Salvador mostraría el día anterior.
    expect(d.toLocaleDateString("en-CA", { timeZone: SV })).toBe("2026-10-11");
  });

  it("acepta string ISO / YYYY-MM-DD y null", () => {
    expect(toStoredCalendarDate("2026-10-12T00:00:00.000Z")).toBe("2026-10-12");
    expect(toStoredCalendarDate("2026-10-12")).toBe("2026-10-12");
    expect(toStoredCalendarDate(null)).toBeNull();
    expect(formatStoredCalendarDate(null)).toBe("—");
  });
});

describe("Presentación", () => {
  it("estado efectivo separado del configurado", () => {
    const vigente = org({ license_status: "TRIAL", trial_ends_at: stored("2026-10-20") });
    expect(describeEffectiveLicenseState(vigente, evaluateOrganizationAccess(vigente, NOW)).label).toBe(
      "Trial vigente",
    );
    const vencido = org({ license_status: "TRIAL", trial_ends_at: stored("2026-10-01") });
    expect(describeEffectiveLicenseState(vencido, evaluateOrganizationAccess(vencido, NOW)).label).toBe(
      "Trial vencido por fecha",
    );
    const activaVencida = org({ license_expires_at: stored("2026-10-01") });
    expect(
      describeEffectiveLicenseState(activaVencida, evaluateOrganizationAccess(activaVencida, NOW)).label,
    ).toBe("Licencia vencida por fecha");
  });

  it("mensajes de bloqueo sin detalles internos", () => {
    expect(getAccessRestrictedMessage("TRIAL_EXPIRED")).toBe(
      "Tu período de prueba ha finalizado. Contacta a Zolvi para continuar.",
    );
    expect(getAccessRestrictedMessage("LICENSE_SUSPENDED")).toBe(
      "El acceso de esta organización está suspendido. Contacta a Zolvi.",
    );
    expect(getAccessRestrictedMessage("ACTIVE_LICENSE_EXPIRED")).toBe(
      "La licencia de esta organización ha vencido. Contacta a Zolvi.",
    );
    expect(getAccessRestrictedMessage("LICENSE_EXPIRED")).toBe(
      "La licencia de esta organización ha vencido. Contacta a Zolvi.",
    );
    expect(getAccessRestrictedMessage("LICENSE_CANCELLED")).toBe(
      "La licencia de esta organización está cancelada.",
    );
  });
});

describe("Post-auditoría — fail closed ante valores desconocidos", () => {
  it("organization.status desconocido → blocked ORGANIZATION_STATUS_INVALID (capa técnica)", () => {
    const r = evaluateOrganizationAccess(org({ status: "ARCHIVED", billing_cycle: "LIFETIME" }), NOW);
    expect(r).toMatchObject({ allowed: false, reason: "ORGANIZATION_STATUS_INVALID", blockedBy: "TECHNICAL" });
    expect(getAccessRestrictedMessage(r.reason)).not.toContain("ARCHIVED");
    expect(describeEffectiveLicenseState(org({ status: "ARCHIVED" }), r)).toMatchObject({ tone: "blocked" });
  });

  it("ACTIVE + billing_cycle desconocido → blocked BILLING_CYCLE_INVALID", () => {
    const r = evaluateOrganizationAccess(org({ billing_cycle: "WEEKLY" }), NOW);
    expect(r).toMatchObject({ allowed: false, reason: "BILLING_CYCLE_INVALID", blockedBy: "COMMERCIAL" });
    expect(getAccessRestrictedMessage(r.reason)).not.toContain("WEEKLY");
  });

  it.each(["MONTHLY", "ANNUAL", "LIFETIME", "NONE"])("ACTIVE + billing_cycle %s conserva semántica válida", (cycle) => {
    expect(evaluateOrganizationAccess(org({ billing_cycle: cycle }), NOW).allowed).toBe(true);
  });
});
