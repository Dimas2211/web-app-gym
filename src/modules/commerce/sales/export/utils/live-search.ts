// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — live-search.ts
//
// Controlador de búsqueda en vivo sin React (testeable con fake timers):
// mismo comportamiento que SaleCustomerSection — mínimo de caracteres,
// debounce y descarte de respuestas obsoletas (una respuesta de "PR"
// que llega después de "PRUEBA" no reemplaza los resultados vigentes).
// ─────────────────────────────────────────────────────────────────

export const LIVE_SEARCH_MIN_CHARS   = 2;
export const LIVE_SEARCH_DEBOUNCE_MS = 320;

export type LiveSearchState<T> =
  | { status: "idle" }
  | { status: "searching"; query: string }
  | { status: "done"; query: string; items: T[] }
  | { status: "error"; query: string; error: string };

export interface LiveSearchOptions<T> {
  run:        (query: string) => Promise<{ ok: true; items: T[] } | { ok: false; error: string }>;
  onChange:   (state: LiveSearchState<T>) => void;
  minChars?:  number;
  debounceMs?: number;
}

export function createLiveSearch<T>({
  run,
  onChange,
  minChars   = LIVE_SEARCH_MIN_CHARS,
  debounceMs = LIVE_SEARCH_DEBOUNCE_MS,
}: LiveSearchOptions<T>) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;

  function cancel() {
    if (timer) clearTimeout(timer);
    timer = null;
    seq++; // invalida cualquier respuesta en vuelo
  }

  async function execute(query: string, id: number) {
    onChange({ status: "searching", query });
    try {
      const result = await run(query);
      if (id !== seq) return;
      onChange(result.ok
        ? { status: "done", query, items: result.items }
        : { status: "error", query, error: result.error });
    } catch {
      if (id !== seq) return;
      onChange({ status: "error", query, error: "No se pudo completar la búsqueda." });
    }
  }

  function update(raw: string) {
    cancel();
    const query = raw.trim();
    if (query.length < minChars) {
      onChange({ status: "idle" });
      return;
    }
    const id = seq;
    timer = setTimeout(() => { timer = null; void execute(query, id); }, debounceMs);
  }

  return { update, cancel };
}
