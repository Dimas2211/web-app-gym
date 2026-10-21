import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gymBookingErrorMessage } from "./booking-messages";
import type { GymBookingErrorCode } from "./booking-contracts";

// Todos los códigos del contrato, leídos del propio archivo de tipos: si se
// agrega uno sin mensaje, este test falla (además del chequeo de tipos).
const contract = readFileSync(path.join(__dirname, "booking-contracts.ts"), "utf8");
const union = contract.slice(contract.indexOf("export type GymBookingErrorCode"), contract.indexOf("export interface GymBookingActor"));
const CODES = [...union.matchAll(/\|\s*"([A-Z_]+)"/g)].map((m) => m[1]) as GymBookingErrorCode[];

describe("gymBookingErrorMessage", () => {
  it("cada código del contrato tiene mensaje de staff y de portal, sin filtrar el código", () => {
    expect(CODES.length).toBeGreaterThan(30);
    for (const code of CODES) {
      for (const audience of ["staff", "portal"] as const) {
        const msg = gymBookingErrorMessage(code, audience);
        expect(msg, code).toMatch(/\S/);
        expect(msg, code).not.toContain(code);
      }
    }
  });

  it("conserva los textos heredados de las acciones", () => {
    expect(gymBookingErrorMessage("SESSION_FULL")).toBe("No hay cupo disponible en esta clase.");
    expect(gymBookingErrorMessage("SESSION_FULL", "portal")).toBe("Esta clase ya no tiene cupo disponible.");
    expect(gymBookingErrorMessage("NO_ELIGIBLE_MEMBERSHIP", "portal")).toBe("No tienes una membresía activa vigente para reservar clases.");
    expect(gymBookingErrorMessage("ALREADY_BOOKED")).toBe("El cliente ya tiene una reserva confirmada para esta clase.");
  });

  it("usa el detalle de negocio del servicio cuando no hay texto específico de portal", () => {
    expect(gymBookingErrorMessage("SESSION_STARTED", "portal", "No puedes reservar una clase pasada.")).toBe("No puedes reservar una clase pasada.");
    expect(gymBookingErrorMessage("SESSION_FULL", "staff", "SESSION_FULL")).toBe("No hay cupo disponible en esta clase.");
  });
});
