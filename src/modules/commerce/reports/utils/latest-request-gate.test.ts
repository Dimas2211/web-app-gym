import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLatestRequestGate } from "./latest-request-gate";

describe("createLatestRequestGate", () => {
  it("una consulta nueva invalida las anteriores", () => {
    const gate = createLatestRequestGate();
    const first = gate.begin();
    expect(first()).toBe(true);
    const second = gate.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("respuestas fuera de orden: queda el último periodo elegido", async () => {
    const gate = createLatestRequestGate();
    let shown: string | null = null;
    const deferred = () => {
      let resolve!: (v: string) => void;
      const promise = new Promise<string>((r) => (resolve = r));
      return { promise, resolve };
    };
    async function query(p: Promise<string>) {
      const isLatest = gate.begin();
      const value = await p;
      if (isLatest()) shown = value;
    }

    const hoy = deferred();
    const mes = deferred();
    const a = query(hoy.promise); // "Hoy" (lento)
    const b = query(mes.promise); // "Mes" (último elegido)
    mes.resolve("mes");
    await b;
    hoy.resolve("hoy"); // llega tarde
    await a;

    expect(shown).toBe("mes");
  });
});

// Regresión UI: si la consulta más reciente falla, no se deben mostrar
// los datos conservados de un periodo consultado anteriormente.
describe("CommerceReportsClient — error de última consulta", () => {
  it("oculta el dashboard previo si existe error de la consulta actual", () => {
    const source = readFileSync(new URL("../components/commerce-reports-client.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/\{!loading\s*&&\s*error\s*&&\s*\(/);
    expect(source).toMatch(/\{!loading\s*&&\s*!error\s*&&\s*data\s*&&\s*\(/);
  });
});
