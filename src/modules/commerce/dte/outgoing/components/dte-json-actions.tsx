"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-json-actions.tsx
//
// Acciones compactas READ-ONLY "Ver JSON" / "Descargar JSON" para
// cualquier DTE saliente (01, 03, 05, 11, 14, …). Implementación única
// reutilizada por Sales, Purchases y la vista global DTE.
//
// Dos variantes, ambas resueltas en servidor (GET /api/dte/outgoing/:id/json):
//   - external: payload completo de entrega externa (MariaDB) —
//     buildExternalDtePayload(): campos DTE + codigoEmpresa + responseMH
//     + token. Es la principal cuando el DTE ya fue entregado.
//   - fiscal:   json_document original persistido.
// Nunca se reconstruye nada en cliente. No modifica nada.
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, X, Copy, Download, Braces } from "lucide-react";
import {
  dteStatusLabel, dteStatusCls, envLabel, envCls, dteTypeLabelFull,
} from "../utils/dte-status.utils";
import {
  serializeDteJsonDocument,
  serializeExternalDtePayloadForInsert,
} from "../utils/dte-json-file.utils";

type Variant = "external" | "fiscal";

interface DteJsonActionsProps {
  /** id interno de DteOutgoingDocument. */
  dteId:              string;
  /** false → acciones deshabilitadas (json_document NULL). */
  hasJson:            boolean;
  /** true si el DTE tiene entrega externa exitosa → variante principal = JSON completo. */
  externalDelivered?: boolean;
  /** Prefijo opcional para distinguir documentos (p.ej. "NC"). */
  labelPrefix?:       string;
  /** Altura reducida (h-4) para encabezados compactos. */
  compact?:           boolean;
  className?:         string;
}

interface JsonViewData {
  variant:         Variant;
  mode?:           "RECONSTRUCTED" | "PREVIEW";
  id:              string;
  dte_type_code:   string;
  generation_code: string | null;
  control_number:  string | null;
  environment:     string;
  dte_status:      string;
  delivery?: {
    delivered_at:    string;
    target_database: string | null;
    target_table:    string | null;
    insert_id:       string | null;
  } | null;
  file_name:       string;
  json_document:   unknown;
}

export const DTE_JSON_MISSING_HINT = "Todavía no existe un JSON generado para este DTE.";

const VARIANT_LABEL: Record<Variant, string> = {
  external: "JSON completo (entrega externa)",
  fiscal:   "JSON fiscal original",
};

const btnSize = "h-5 px-1.5";
const btnCompactSize = "h-4 px-1";
const btnBase =
  "inline-flex items-center gap-1 text-[10px] leading-none text-zinc-400 hover:text-zinc-200 " +
  "border border-zinc-700 hover:border-zinc-500 rounded transition-colors " +
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-zinc-400 disabled:hover:border-zinc-700";
const btn = `${btnBase} ${btnSize}`;

function jsonUrl(dteId: string, variant: Variant, download: boolean): string {
  const qs = new URLSearchParams();
  if (variant === "external") qs.set("variant", "external");
  if (download) qs.set("download", "1");
  const q = qs.toString();
  return `/api/dte/outgoing/${encodeURIComponent(dteId)}/json${q ? `?${q}` : ""}`;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch { /* cuerpo no JSON */ }
  return `Error ${res.status} al obtener el JSON del DTE.`;
}

function fileNameFromDisposition(header: string | null): string | null {
  const m = header?.match(/filename="([^"]+)"/);
  return m?.[1] ?? null;
}

/** Mismo contenido que el archivo descargado de cada variante. */
function serializeForVariant(d: JsonViewData): string {
  return d.variant === "external"
    ? serializeExternalDtePayloadForInsert(d.json_document)
    : serializeDteJsonDocument(d.json_document);
}

function fmt(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-CL");
}

type Cache = Record<Variant, JsonViewData | null>;
type Errors = Record<Variant, string | null>;
const EMPTY_CACHE: Cache = { external: null, fiscal: null };
const EMPTY_ERRORS: Errors = { external: null, fiscal: null };

export function DteJsonActions({
  dteId, hasJson, externalDelivered = false, labelPrefix, compact, className,
}: DteJsonActionsProps) {
  const primary: Variant = externalDelivered ? "external" : "fiscal";

  const [open, setOpen]               = useState(false);
  const [variant, setVariant]         = useState<Variant>(primary);
  const [loading, setLoading]         = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [cache, setCache]             = useState<Cache>(EMPTY_CACHE);
  const [errors, setErrors]           = useState<Errors>(EMPTY_ERRORS);
  const [copied, setCopied]           = useState(false);

  // Cambio de DTE seleccionado → descartar lo cargado del anterior.
  useEffect(() => {
    setOpen(false);
    setCache(EMPTY_CACHE);
    setErrors(EMPTY_ERRORS);
    setCopied(false);
  }, [dteId]);

  const triggerBtn = `${btnBase} ${compact ? btnCompactSize : btnSize}`;
  const prefix = labelPrefix ? `${labelPrefix} · ` : "";
  const disabledTitle = hasJson ? undefined : DTE_JSON_MISSING_HINT;

  function setErr(v: Variant, msg: string | null) {
    setErrors((e) => ({ ...e, [v]: msg }));
  }

  async function load(v: Variant) {
    setErr(v, null);
    if (cache[v]?.id === dteId) return;
    setLoading(true);
    try {
      const res = await fetch(jsonUrl(dteId, v, false), { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) { setErr(v, await readError(res)); return; }
      const body = (await res.json()) as { ok: boolean; data?: JsonViewData; error?: string };
      if (!body.ok || !body.data) { setErr(v, body.error ?? "Respuesta inválida."); return; }
      setCache((c) => ({ ...c, [v]: body.data! }));
    } catch {
      setErr(v, "No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  function openAt(v: Variant) {
    setOpen(true);
    setCopied(false);
    setVariant(v);
    void load(v);
  }

  async function download(v: Variant) {
    setDownloading(true);
    setErr(v, null);
    try {
      const res = await fetch(jsonUrl(dteId, v, true), { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) {
        setErr(v, await readError(res));
        if (!open) { setVariant(v); setOpen(true); }
        return;
      }
      const blob = await res.blob();
      const name = fileNameFromDisposition(res.headers.get("Content-Disposition")) ?? `DTE_${dteId}.json`;
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setErr(v, "No se pudo descargar el JSON del DTE.");
      if (!open) { setVariant(v); setOpen(true); }
    } finally {
      setDownloading(false);
    }
  }

  const data  = cache[variant];
  const error = errors[variant];

  async function handleCopy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(serializeForVariant(data));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr(variant, "No se pudo copiar al portapapeles.");
    }
  }

  const pretty = data ? serializeDteJsonDocument(data.json_document) : "";
  const downloadLabel = primary === "external" ? "Descargar JSON completo" : "Descargar JSON";
  const variantOrder: Variant[] = primary === "external" ? ["external", "fiscal"] : ["fiscal", "external"];

  return (
    <>
      <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
        <button
          type="button"
          onClick={() => openAt(primary)}
          disabled={!hasJson}
          title={disabledTitle ?? `${prefix}Ver ${VARIANT_LABEL[primary]}`}
          className={triggerBtn}
        >
          <Braces className="h-3 w-3" />
          {prefix}Ver JSON
        </button>
        <button
          type="button"
          onClick={() => download(primary)}
          disabled={!hasJson || downloading}
          title={disabledTitle ?? `${prefix}Descargar ${VARIANT_LABEL[primary]} (.json)`}
          className={triggerBtn}
        >
          {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          {prefix}{downloadLabel}
        </button>
      </span>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="JSON del DTE"
            className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-zinc-800">
              <div className="min-w-0 space-y-0.5">
                <h2 className="text-sm font-semibold text-zinc-100">JSON del DTE</h2>
                {data && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                    <span className="text-zinc-300">
                      {dteTypeLabelFull(data.dte_type_code)}
                      <span className="ml-1 font-mono text-zinc-500">{data.dte_type_code}</span>
                    </span>
                    <span className={envCls(data.environment)}>{envLabel(data.environment)}</span>
                    <span className={dteStatusCls(data.dte_status)}>{dteStatusLabel(data.dte_status)}</span>
                    <span className="font-mono text-amber-400 break-all">{data.generation_code ?? "—"}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-zinc-200"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Selector de variante */}
            <div className="flex items-center border-b border-zinc-800 bg-zinc-950/40 px-2">
              {variantOrder.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setVariant(v); setCopied(false); void load(v); }}
                  className={`h-7 px-3 text-[11px] font-medium transition-colors ${
                    variant === v
                      ? "text-zinc-100 border-b-2 border-zinc-300 -mb-px"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {VARIANT_LABEL[v]}
                </button>
              ))}
            </div>

            {/* Rótulo de trazabilidad (solo variante externa) */}
            {variant === "external" && data?.mode && (
              <div className={`mx-4 mt-3 rounded border px-2.5 py-1.5 text-[11px] space-y-0.5 ${
                data.mode === "RECONSTRUCTED"
                  ? "border-cyan-800/50 bg-cyan-950/30 text-cyan-200"
                  : "border-amber-800/50 bg-amber-950/30 text-amber-200"
              }`}>
                <p className="font-semibold">
                  {data.mode === "RECONSTRUCTED"
                    ? "Payload de entrega externa reconstruido"
                    : "Vista previa del JSON de entrega externa"}
                </p>
                <p className="text-[10px] opacity-80">
                  {data.mode === "RECONSTRUCTED"
                    ? "Generado a partir de los datos fiscales almacenados con el mismo constructor usado en la entrega. No es una copia histórica persistida del registro insertado."
                    : "Este DTE aún no registra una entrega externa exitosa. Así se vería el JSON a enviar."}
                </p>
                {data.delivery && (
                  <p className="text-[10px] font-mono opacity-80">
                    Entregado {fmt(data.delivery.delivered_at)} · {data.delivery.target_database ?? "—"}.{data.delivery.target_table ?? "—"} · insertId {data.delivery.insert_id ?? "—"}
                  </p>
                )}
              </div>
            )}

            <div className="flex-1 min-h-0 px-4 py-3">
              {loading && !data && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando JSON…
                </div>
              )}
              {error && (
                <p className="text-xs text-red-400 break-words">{error}</p>
              )}
              {data && (
                <pre className="h-full max-h-[55vh] overflow-auto text-[11px] leading-relaxed text-zinc-300 font-mono bg-zinc-950/70 border border-zinc-800 rounded p-3 whitespace-pre select-text">
                  {pretty}
                </pre>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-zinc-800">
              <span className="text-[10px] text-zinc-600">
                {variant === "external"
                  ? "Solo lectura · incluye token JWS completo. Archivo idéntico al JSON del INSERT externo."
                  : "Solo lectura · documento persistido. No incluye firma JWS ni respuesta MH."}
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleCopy} disabled={!data} className={btn}>
                  <Copy className="h-3 w-3" />
                  {copied ? "Copiado ✓" : "Copiar"}
                </button>
                <button type="button" onClick={() => download(variant)} disabled={!data || downloading} className={btn}>
                  {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  Descargar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
