import { describe, it, expect } from "vitest";
import { hasMeaningfulMhObservations, isMhProcessedObserved } from "./dte-mh-observations.utils";

describe("hasMeaningfulMhObservations", () => {
  it("null/undefined -> false", () => {
    expect(hasMeaningfulMhObservations(null)).toBe(false);
    expect(hasMeaningfulMhObservations(undefined)).toBe(false);
  });

  it("[] (array vacío) -> false", () => {
    expect(hasMeaningfulMhObservations([])).toBe(false);
  });

  it('["",""] (ejemplo oficial "Sin Observaciones") -> false', () => {
    expect(hasMeaningfulMhObservations(["", ""])).toBe(false);
  });

  it('["", " "] (solo espacios) -> false', () => {
    expect(hasMeaningfulMhObservations(["", "   "])).toBe(false);
  });

  it('["error real"] -> true', () => {
    expect(hasMeaningfulMhObservations(["error real"])).toBe(true);
  });

  it("array con objeto con contenido -> true", () => {
    expect(hasMeaningfulMhObservations([{ campo: "x", mensaje: "algo" }])).toBe(true);
  });

  it("array con objeto vacío -> false", () => {
    expect(hasMeaningfulMhObservations([{}])).toBe(false);
  });
});

describe("isMhProcessedObserved — clasificación ACCEPTED vs OBSERVED", () => {
  it("[] -> ACCEPTED (false)", () => {
    expect(isMhProcessedObserved({ observaciones: [] })).toBe(false);
  });

  it('["",""] + codigoMsg 001 + RECIBIDO -> ACCEPTED (false)', () => {
    expect(
      isMhProcessedObserved({ codigoMsg: "001", descripcionMsg: "RECIBIDO", observaciones: ["", ""] }),
    ).toBe(false);
  });

  it('["error real"] -> OBSERVED (true)', () => {
    expect(isMhProcessedObserved({ observaciones: ["error real"] })).toBe(true);
  });

  it("codigoMsg 002 -> OBSERVED (true)", () => {
    expect(isMhProcessedObserved({ codigoMsg: "002", observaciones: [] })).toBe(true);
  });

  it('descripcion "RECIBIDO CON OBSERVACIONES" -> OBSERVED (true)', () => {
    expect(isMhProcessedObserved({ descripcionMsg: "RECIBIDO CON OBSERVACIONES", observaciones: [] })).toBe(true);
  });

  it("sin ninguna evidencia positiva -> ACCEPTED (false)", () => {
    expect(isMhProcessedObserved({ codigoMsg: "001", descripcionMsg: "RECIBIDO", observaciones: null })).toBe(false);
  });
});
