import { describe, it, expect } from "vitest";
import { parseMhFhProcesamiento } from "./dte-mh-fh-procesamiento.utils";

describe("parseMhFhProcesamiento", () => {
  it("formato válido dd/MM/yyyy HH:mm:ss", () => {
    const d = parseMhFhProcesamiento("19/08/2026 23:31:19");
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(7); // agosto = index 7
    expect(d?.getDate()).toBe(19);
    expect(d?.getHours()).toBe(23);
    expect(d?.getMinutes()).toBe(31);
    expect(d?.getSeconds()).toBe(19);
  });

  it("null/undefined/vacío -> null", () => {
    expect(parseMhFhProcesamiento(null)).toBeNull();
    expect(parseMhFhProcesamiento(undefined)).toBeNull();
    expect(parseMhFhProcesamiento("")).toBeNull();
  });

  it("formato inesperado -> null, no inventa fecha", () => {
    expect(parseMhFhProcesamiento("2026-08-19T23:31:19Z")).toBeNull();
    expect(parseMhFhProcesamiento("agosto 19 2026")).toBeNull();
  });

  it("fecha inválida (31/02) -> null, no la 'corrige' silenciosamente", () => {
    expect(parseMhFhProcesamiento("31/02/2026 10:00:00")).toBeNull();
  });

  it("componentes fuera de rango -> null", () => {
    expect(parseMhFhProcesamiento("19/13/2026 10:00:00")).toBeNull();
    expect(parseMhFhProcesamiento("19/08/2026 25:00:00")).toBeNull();
  });
});
