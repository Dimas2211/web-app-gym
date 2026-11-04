"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-json-actions.tsx
//
// Acciones compactas READ-ONLY "Ver JSON" / "Descargar JSON" para
// cualquier DTE saliente (01, 03, 05, 11, 14, …). Implementación única
// reutilizada por Sales, Purchases y la vista global DTE.
//
// Siempre consulta GET /api/dte/outgoing/:id/json — el JSON persistido
// en servidor, nunca reconstruido en cliente. No modifica nada.
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, X, Copy, Download, Braces } from "lucide-react";
import {
  dteStatusLabel, dteStatusCls, envLabel, envCls, dteTypeLabelFull,
} from "../utils/dte-status.utils";
import { serializeDteJsonDocument } from "../utils/dte-json-file.utils";

interface DteJsonActionsProps {
  /** id interno de DteOutgoingDocument. */
  dteId:          string;
  /** false → acciones deshabilitadas (json_document NULL). */
  hasJson:        boolean;
  /** Prefijo opcional para distinguir documentos (p.ej. "NC"). */
  labelPrefix?:   string;
  /** Altura reducida (h-4) para encabezados compactos. */
  compact?:       boolean;
  className?:     string;
}

interface JsonViewData {
  id:              string;
  dte_type_code:   string;
  generation_code: string | null;
  control_number:  string | null;
  environment:     string;
  dte_status:      string;
  file_name:       string;
  json_document:   unknown;
}

export const DTE_JSON_MISSING_HINT = "Todavía no existe un JSON generado para este DTE.";

const btnSize = "h-5 px-1.5";
const btnCompactSize = "h-4 px-1";
const btnBase =
  "inline-flex items-center gap-1 text-[10px] leading-none text-zinc-400 hover:text-zinc-200 " +
  "border border-zinc-700 hover:border-zinc-500 rounded transition-colors " +
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-zinc-400 disabled:hover:border-zinc-700";
const btn = `${btnBase} ${btnSize}`;

function jsonUrl(dteId: string, download: boolean): string {
  const base = `/api/dte/outgoing/${encodeURIComponent(dteId)}/json`;
  return download ? `${base}?download=1` : base;
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

export function DteJsonActions({ dteId, hasJson, labelPrefix, compact, className }: DteJsonActionsProps) {
  const [open, setOpen]               = useState(false);
  const [loading, setLoading]         = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [data, setData]               = useState<JsonViewData | null>(null);
  const [copied, setCopied]           = useState(false);

  // Cambio de DTE seleccionado → descartar lo cargado del anterior.
  useEffect(() => {
    setOpen(false);
    setData(null);
    setError(null);
    setCopied(false);
  }, [dteId]);

  const triggerBtn = `${btnBase} ${compact ? btnCompactSize : btnSize}`;
  const prefix = labelPrefix ? `${labelPrefix} · ` : "";
  const disabledTitle = hasJson ? undefined : DTE_JSON_MISSING_HINT;

  async function handleView() {
    setOpen(true);
    setError(null);
    setCopied(false);
    if (data?.id === dteId) return;
    setLoading(true);
    try {
      const res = await fetch(jsonUrl(dteId, false), { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) { setError(await readError(res)); setData(null); return; }
      const body = (await res.json()) as { ok: boolean; data?: JsonViewData; error?: string };
      if (!body.ok || !body.data) { setError(body.error ?? "Respuesta inválida."); return; }
      setData(body.data);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(jsonUrl(dteId, true), { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) { setError(await readError(res)); if (!open) setOpen(true); return; }
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
      setError("No se pudo descargar el JSON del DTE.");
      if (!open) setOpen(true);
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(serializeDteJsonDocument(data.json_document));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("No se pudo copiar al portapapeles.");
    }
  }

  const pretty = data ? serializeDteJsonDocument(data.json_document) : "";

  return (
    <>
      <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
        <button
          type="button"
          onClick={handleView}
          disabled={!hasJson}
          title={disabledTitle ?? `${prefix}Ver JSON original almacenado`}
          className={triggerBtn}
        >
          <Braces className="h-3 w-3" />
          {prefix}Ver JSON
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!hasJson || downloading}
          title={disabledTitle ?? `${prefix}Descargar JSON original (.json)`}
          className={triggerBtn}
        >
          {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          {prefix}Descargar JSON
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
            aria-label="JSON original del DTE"
            className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-zinc-800">
              <div className="min-w-0 space-y-0.5">
                <h2 className="text-sm font-semibold text-zinc-100">JSON original del DTE</h2>
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

            <div className="flex-1 min-h-0 px-4 py-3">
              {loading && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando JSON almacenado…
                </div>
              )}
              {error && (
                <p className="text-xs text-red-400 break-words">{error}</p>
              )}
              {!loading && data && (
                <pre className="h-full max-h-[60vh] overflow-auto text-[11px] leading-relaxed text-zinc-300 font-mono bg-zinc-950/70 border border-zinc-800 rounded p-3 whitespace-pre select-text">
                  {pretty}
                </pre>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-zinc-800">
              <span className="text-[10px] text-zinc-600">
                Solo lectura · documento persistido. No incluye firma JWS, respuesta MH ni credenciales.
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleCopy} disabled={!data} className={btn}>
                  <Copy className="h-3 w-3" />
                  {copied ? "Copiado ✓" : "Copiar"}
                </button>
                <button type="button" onClick={handleDownload} disabled={!data || downloading} className={btn}>
                  {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  Descargar JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
