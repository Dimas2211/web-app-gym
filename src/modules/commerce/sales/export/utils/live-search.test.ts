// ─────────────────────────────────────────────────────────────────
// commerce/sales/export/utils — live-search.test.ts
//
// FEX11-LOOKUPS-FINAL-FIX — búsqueda en vivo del receptor extranjero:
// mínimo 2 caracteres, debounce automático (sin botón "Buscar") y
// descarte de respuestas obsoletas.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLiveSearch, LIVE_SEARCH_DEBOUNCE_MS, type LiveSearchState } from "./live-search";

type Result = { ok: true; items: string[] } | { ok: false; error: string };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("createLiveSearch", () => {
  it("debounce entre 300 y 350 ms", () => {
    expect(LIVE_SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
    expect(LIVE_SEARCH_DEBOUNCE_MS).toBeLessThanOrEqual(350);
  });

  it("no busca con menos de 2 caracteres", async () => {
    const run = vi.fn<(q: string) => Promise<Result>>();
    const states: LiveSearchState<string>[] = [];
    const live = createLiveSearch<string>({ run, onChange: (s) => states.push(s) });

    live.update("P");
    live.update(" P ");
    await vi.advanceTimersByTimeAsync(1000);

    expect(run).not.toHaveBeenCalled();
    expect(states.every((s) => s.status === "idle")).toBe(true);
  });

  it("busca automáticamente tras el debounce, una sola vez por ráfaga de tecleo", async () => {
    const run = vi.fn<(q: string) => Promise<Result>>().mockResolvedValue({ ok: true, items: ["PRUEBA FEX 1"] });
    const states: LiveSearchState<string>[] = [];
    const live = createLiveSearch<string>({ run, onChange: (s) => states.push(s) });

    live.update("PR");
    live.update("PRU");
    live.update("PRUEBA");
    await vi.advanceTimersByTimeAsync(LIVE_SEARCH_DEBOUNCE_MS - 1);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("PRUEBA");
    expect(states.at(-1)).toEqual({ status: "done", query: "PRUEBA", items: ["PRUEBA FEX 1"] });
  });

  it("una respuesta obsoleta no reemplaza la búsqueda más reciente", async () => {
    const slowPr  = deferred<Result>();
    const fastNew = deferred<Result>();
    const run = vi.fn((q: string) => (q === "PR" ? slowPr.promise : fastNew.promise));
    const states: LiveSearchState<string>[] = [];
    const live = createLiveSearch<string>({ run, onChange: (s) => states.push(s) });

    live.update("PR");
    await vi.advanceTimersByTimeAsync(LIVE_SEARCH_DEBOUNCE_MS);
    live.update("PRUEBA");
    await vi.advanceTimersByTimeAsync(LIVE_SEARCH_DEBOUNCE_MS);

    fastNew.resolve({ ok: true, items: ["PRUEBA FEX 1"] });
    await vi.advanceTimersByTimeAsync(0);
    slowPr.resolve({ ok: true, items: ["PRIMERO", "PROVEEDOR"] });
    await vi.advanceTimersByTimeAsync(0);

    expect(run).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual({ status: "done", query: "PRUEBA", items: ["PRUEBA FEX 1"] });
    expect(states.some((s) => s.status === "done" && s.query === "PR")).toBe(false);
  });

  it("borrar por debajo del mínimo invalida una respuesta en vuelo", async () => {
    const pending = deferred<Result>();
    const states: LiveSearchState<string>[] = [];
    const live = createLiveSearch<string>({ run: () => pending.promise, onChange: (s) => states.push(s) });

    live.update("PRUEBA");
    await vi.advanceTimersByTimeAsync(LIVE_SEARCH_DEBOUNCE_MS);
    live.update("");
    pending.resolve({ ok: true, items: ["PRUEBA FEX 1"] });
    await vi.advanceTimersByTimeAsync(0);

    expect(states.at(-1)).toEqual({ status: "idle" });
  });

  it("propaga el error de la action como estado error", async () => {
    const states: LiveSearchState<string>[] = [];
    const live = createLiveSearch<string>({
      run: vi.fn<(q: string) => Promise<Result>>().mockResolvedValue({ ok: false, error: "boom" }),
      onChange: (s) => states.push(s),
    });

    live.update("PRUEBA");
    await vi.advanceTimersByTimeAsync(LIVE_SEARCH_DEBOUNCE_MS);

    expect(states.at(-1)).toEqual({ status: "error", query: "PRUEBA", error: "boom" });
  });
});
