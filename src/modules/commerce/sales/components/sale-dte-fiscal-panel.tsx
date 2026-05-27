"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — sale-dte-fiscal-panel.tsx
//
// Panel Fiscal DTE con layout estabilizado.
// Siempre visible — muestra placeholder cuando no hay documento fiscal.
//
//   Bloque principal fijo (siempre, misma altura):
//     estado, tipo, control, generación, sello, fechas
//
//   Zona secundaria tabs (visible solo cuando showTabs=true):
//     Fiscal | Entrega DTE | Invalidación
//     Controlada desde el padre (sales-client) para no ocupar
//     espacio fijo entre paneles y grilla.
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import type { SaleDetail } from "../types/sale.types";
import { getDteShortCode } from "../utils/dte-type-labels";

// ── Props ─────────────────────────────────────────────────────────

interface SaleDteFiscalPanelProps {
  detail:                          SaleDetail | null;
  showTabs?:                       boolean;
  onDeliverExternal?:              () => void;
  onDeliverExternalInvalidation?:  () => void;
}

// ── Estilos ───────────────────────────────────────────────────────

const lbl      = "block text-[10px] font-medium uppercase tracking-wider text-zinc-500 truncate";
const val      = "block text-xs text-zinc-200 truncate font-mono";
const valPlain = "block text-xs text-zinc-200 truncate";
const stub     = "block text-xs text-zinc-700";

// ── Helpers ───────────────────────────────────────────────────────

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString("es-CL");
}

function dteStatusLabel(s: string): string {
  const map: Record<string, string> = {
    PENDING_GENERATION:   "Pendiente",
    GENERATED:            "Generado",
    SCHEMA_VALIDATED:     "Validado",
    SIGNED:               "Firmado",
    SENT:                 "Enviado",
    ACCEPTED:             "Aceptado ✓",
    REJECTED:             "Rechazado ✗",
    OBSERVED:             "Observado",
    CONTINGENCY_PENDING:  "Contingencia",
    INVALIDATION_PENDING: "Inv. pendiente",
    INVALIDATED:          "Invalidado",
  };
  return map[s] ?? s;
}

function dteStatusCls(s: string): string {
  if (s === "ACCEPTED")                        return "text-emerald-400 font-semibold";
  if (s === "INVALIDATED" || s === "REJECTED") return "text-red-400 font-semibold";
  if (s === "SIGNED" || s === "SENT")          return "text-amber-300 font-semibold";
  if (s === "OBSERVED")                        return "text-orange-400 font-semibold";
  return "text-zinc-400";
}

function invalidationTypeLabel(code: string): string {
  const map: Record<string, string> = {
    "1": "Tipo 1 — Error en emisión",
    "2": "Tipo 2 — Rescindir operación",
    "3": "Tipo 3 — Otro",
  };
  return map[code] ?? `Tipo ${code}`;
}

function invalidationStatusCls(s: string): string {
  if (s === "ACCEPTED")                      return "text-emerald-400";
  if (s === "REJECTED" || s === "CANCELLED") return "text-red-400";
  if (s === "SIGNED" || s === "SENT")        return "text-amber-300";
  return "text-zinc-400";
}

function envLabel(env: string): string {
  return env === "PRODUCTION" ? "PRODUCCIÓN" : "TEST";
}

function envCls(env: string): string {
  return env === "PRODUCTION" ? "text-red-400 font-semibold" : "text-amber-400 font-semibold";
}

// ── Tipos de tab ──────────────────────────────────────────────────

type Tab = "fiscal" | "entrega" | "invalidacion";

const TAB_LABELS: Record<Tab, string> = {
  fiscal:       "Fiscal",
  entrega:      "Entrega DTE",
  invalidacion: "Invalidación",
};

// ── Componente ────────────────────────────────────────────────────

const EXTERNAL_DELIVERY_TYPES = new Set(["01", "03", "05"]);

export function SaleDteFiscalPanel({
  detail,
  showTabs = false,
  onDeliverExternal,
  onDeliverExternalInvalidation,
}: SaleDteFiscalPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("fiscal");

  const dte = detail?.dte_document ?? null;

  // ── Placeholder cuando no hay documento fiscal ─────────────────
  if (!dte || !detail) {
    return (
      <div className="flex-none border-t border-zinc-800 bg-zinc-900/60 px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Panel Fiscal DTE
          </span>
          <span className="text-[10px] text-zinc-700">Sin documento fiscal</span>
        </div>
        <div className="grid grid-cols-5 gap-x-3">
          <div className="min-w-0"><span className={lbl}>Tipo DTE</span><span className={stub}>—</span></div>
          <div className="min-w-0"><span className={lbl}>Nº Control</span><span className={stub}>—</span></div>
          <div className="min-w-0 col-span-2"><span className={lbl}>Código generación</span><span className={stub}>—</span></div>
          <div className="min-w-0"><span className={lbl}>Creado</span><span className={stub}>—</span></div>
        </div>
        <div className="grid grid-cols-5 gap-x-3">
          <div className="min-w-0 col-span-2"><span className={lbl}>Sello recibido</span><span className={stub}>—</span></div>
          <div className="min-w-0"><span className={lbl}>Aceptado</span><span className={stub}>—</span></div>
          <div className="min-w-0"><span className={lbl}>Rechazado</span><span className={stub}>—</span></div>
          <div className="min-w-0"><span className={lbl}>Invalidado</span><span className={stub}>—</span></div>
        </div>
      </div>
    );
  }

  // ── Estado activo (con documento fiscal) ──────────────────────

  const nc        = detail.dte_related_nc;
  const events    = detail.dte_invalidation_events ?? [];
  const extDel    = detail.external_delivery;
  const extInvDel = detail.external_invalidation_delivery;

  const canDeliverExternal =
    dte.dte_status === "ACCEPTED"
    && EXTERNAL_DELIVERY_TYPES.has(dte.dte_type_code)
    && !!dte.reception_stamp
    && !extDel.hasSuccessfulDelivery
    && !!onDeliverExternal;

  const acceptedInvalidationEvent = events.find((ev) => ev.status === "ACCEPTED");
  const canDeliverExternalInvalidation =
    !!acceptedInvalidationEvent
    && !extInvDel.hasSuccessfulDelivery
    && !!onDeliverExternalInvalidation;

  function tabBadge(tab: Tab): string | null {
    if (tab === "entrega") {
      if (!extDel.hasSuccessfulDelivery && extDel.attemptsCount > 0) return "!";
      if (canDeliverExternal || canDeliverExternalInvalidation)        return "•";
    }
    if (tab === "invalidacion" && events.length > 0) return String(events.length);
    return null;
  }

  return (
    <div className="flex-none border-t border-zinc-800 bg-zinc-900/60">

      {/* ── BLOQUE PRINCIPAL FIJO ───────────────────────────────── */}
      <div className="px-3 py-2 space-y-1.5">

        {/* Encabezado */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Panel Fiscal DTE
          </span>
          <span className={`text-[10px] font-medium ${envCls(dte.environment)}`}>
            {envLabel(dte.environment)}
          </span>
          <span className={`text-[10px] font-semibold ${dteStatusCls(dte.dte_status)}`}>
            · {dteStatusLabel(dte.dte_status)}
          </span>
        </div>

        {/* Fila 1: tipo, n° control, código gen, creado */}
        <div className="grid grid-cols-5 gap-x-3">
          <div className="min-w-0">
            <span className={lbl}>Tipo DTE</span>
            <span className={val}>{getDteShortCode(dte.dte_type_code)}</span>
          </div>
          <div className="min-w-0">
            <span className={lbl}>Nº Control</span>
            <span className={val} title={dte.control_number ?? ""}>{dte.control_number ?? "—"}</span>
          </div>
          <div className="min-w-0 col-span-2">
            <span className={lbl}>Código generación</span>
            <span className="block text-xs text-amber-400 font-mono truncate" title={dte.generation_code ?? ""}>
              {dte.generation_code ?? "—"}
            </span>
          </div>
          <div className="min-w-0">
            <span className={lbl}>Creado</span>
            <span className={valPlain}>{fmt(dte.created_at)}</span>
          </div>
        </div>

        {/* Fila 2: sello, fechas fiscales */}
        <div className="grid grid-cols-5 gap-x-3">
          <div className="min-w-0 col-span-2">
            <span className={lbl}>Sello recibido</span>
            <span
              className="block text-xs text-zinc-300 font-mono truncate"
              title={dte.reception_stamp ?? ""}
            >
              {dte.reception_stamp ?? "—"}
            </span>
          </div>
          <div className="min-w-0">
            <span className={lbl}>Aceptado</span>
            <span className={valPlain}>{fmt(dte.accepted_at)}</span>
          </div>
          <div className="min-w-0">
            <span className={lbl}>Rechazado</span>
            <span className={valPlain}>{fmt(dte.rejected_at)}</span>
          </div>
          <div className="min-w-0">
            <span className={lbl}>Invalidado</span>
            <span className={valPlain}>{fmt(dte.invalidated_at)}</span>
          </div>
        </div>

      </div>

      {/* ── ZONA SECUNDARIA TABS (solo cuando showTabs=true) ──────── */}
      {showTabs && (
        <div className="border-t border-zinc-800">

          {/* Barra de tabs */}
          <div className="flex items-center bg-zinc-950/40 border-b border-zinc-800">
            {(["fiscal", "entrega", "invalidacion"] as Tab[]).map((tab) => {
              const badge  = tabBadge(tab);
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`
                    relative h-6 px-3 text-[10px] font-medium transition-colors
                    ${active
                      ? "text-zinc-100 border-b-2 border-zinc-300 -mb-px"
                      : "text-zinc-500 hover:text-zinc-300"
                    }
                  `}
                >
                  {TAB_LABELS[tab]}
                  {badge && (
                    <span className={`ml-1 text-[9px] ${active ? "text-zinc-400" : "text-zinc-600"}`}>
                      ({badge})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Contenido fijo — scroll interno si excede */}
          <div className="h-20 overflow-y-auto px-3 py-1.5">

            {/* ── Tab: Fiscal ──────────────────────────────────── */}
            {activeTab === "fiscal" && (
              <div className="space-y-1.5">
                {dte.rejection_reason && (
                  <div>
                    <span className={lbl}>Motivo de rechazo</span>
                    <span className="block text-xs text-red-300 break-words">{dte.rejection_reason}</span>
                  </div>
                )}
                {nc && (
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-0.5">
                      Nota de Crédito 05 relacionada
                    </span>
                    <div className="grid grid-cols-4 gap-x-2">
                      <div className="min-w-0">
                        <span className={lbl}>Estado NC</span>
                        <span className={`block text-xs truncate ${dteStatusCls(nc.dte_status)}`}>
                          {dteStatusLabel(nc.dte_status)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className={lbl}>Nº Control</span>
                        <span className={val} title={nc.control_number ?? ""}>{nc.control_number ?? "—"}</span>
                      </div>
                      <div className="min-w-0 col-span-2">
                        <span className={lbl}>Cód. gen. NC</span>
                        <span className="block text-xs text-amber-400 font-mono truncate" title={nc.generation_code ?? ""}>
                          {nc.generation_code ?? "—"}
                        </span>
                      </div>
                    </div>
                    {nc.reception_stamp && (
                      <div className="mt-0.5">
                        <span className={lbl}>Sello NC</span>
                        <span className="block text-xs text-zinc-300 font-mono truncate" title={nc.reception_stamp}>
                          {nc.reception_stamp}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {!dte.rejection_reason && !nc && (
                  <span className="text-[10px] text-zinc-600">Sin información complementaria fiscal.</span>
                )}
              </div>
            )}

            {/* ── Tab: Entrega DTE ─────────────────────────────── */}
            {activeTab === "entrega" && (
              <div className="space-y-2">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                      Entrega DTE
                    </span>
                    {extDel.hasSuccessfulDelivery && (
                      <span className="text-[10px] font-medium text-emerald-400 bg-emerald-900/30 border border-emerald-800/50 rounded px-1.5 py-0.5">
                        Entregado ✓
                      </span>
                    )}
                    {!extDel.hasSuccessfulDelivery && extDel.attemptsCount > 0 && (
                      <span className="text-[10px] font-medium text-red-400 bg-red-900/30 border border-red-800/50 rounded px-1.5 py-0.5">
                        Error · {extDel.attemptsCount} intento(s)
                      </span>
                    )}
                    {!extDel.hasSuccessfulDelivery && extDel.attemptsCount === 0 && (
                      <span className="text-[10px] text-zinc-600">Pendiente</span>
                    )}
                  </div>
                  {extDel.lastAttemptAt && (
                    <p className="text-[10px] text-zinc-500">
                      Último intento: <span className="text-zinc-400">{fmt(extDel.lastAttemptAt)}</span>
                    </p>
                  )}
                  {extDel.lastErrorMessage && !extDel.hasSuccessfulDelivery && (
                    <p className="text-[10px] text-red-400 break-words">{extDel.lastErrorMessage}</p>
                  )}
                  {canDeliverExternal && (
                    <button
                      type="button"
                      onClick={onDeliverExternal}
                      className="mt-0.5 h-6 px-2 text-[10px] text-cyan-400 hover:text-cyan-200 border border-cyan-800/50 hover:border-cyan-600 rounded transition-colors"
                    >
                      Entregar DTE
                    </button>
                  )}
                </div>
                {acceptedInvalidationEvent && (
                  <div className="border-t border-zinc-800 pt-1.5">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                        Entrega DTE · Invalidación
                      </span>
                      {extInvDel.hasSuccessfulDelivery && (
                        <span className="text-[10px] font-medium text-emerald-400 bg-emerald-900/30 border border-emerald-800/50 rounded px-1.5 py-0.5">
                          Entregada ✓
                        </span>
                      )}
                      {!extInvDel.hasSuccessfulDelivery && extInvDel.attemptsCount > 0 && (
                        <span className="text-[10px] font-medium text-red-400 bg-red-900/30 border border-red-800/50 rounded px-1.5 py-0.5">
                          Error de entrega
                        </span>
                      )}
                      {!extInvDel.hasSuccessfulDelivery && extInvDel.attemptsCount === 0 && (
                        <span className="text-[10px] text-zinc-600">No enviada</span>
                      )}
                    </div>
                    {extInvDel.lastAttemptAt && (
                      <p className="text-[10px] text-zinc-500">
                        Último intento: <span className="text-zinc-400">{fmt(extInvDel.lastAttemptAt)}</span>
                      </p>
                    )}
                    {extInvDel.lastErrorMessage && !extInvDel.hasSuccessfulDelivery && (
                      <p className="text-[10px] text-red-400 break-words">{extInvDel.lastErrorMessage}</p>
                    )}
                    {canDeliverExternalInvalidation && (
                      <button
                        type="button"
                        onClick={onDeliverExternalInvalidation}
                        className="mt-0.5 h-6 px-2 text-[10px] text-violet-400 hover:text-violet-200 border border-violet-800/50 hover:border-violet-600 rounded transition-colors"
                      >
                        Entregar invalidación DTE
                      </button>
                    )}
                  </div>
                )}
                {!canDeliverExternal && !acceptedInvalidationEvent && !extDel.hasSuccessfulDelivery && extDel.attemptsCount === 0 && (
                  <span className="text-[10px] text-zinc-600">DTE no aceptado aún. Entrega no disponible.</span>
                )}
              </div>
            )}

            {/* ── Tab: Invalidación ────────────────────────────── */}
            {activeTab === "invalidacion" && (
              <div>
                {events.length === 0 ? (
                  <span className="text-[10px] text-zinc-600">Sin eventos de invalidación.</span>
                ) : (
                  <div className="space-y-1">
                    {events.map((ev) => (
                      <div key={ev.id} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-zinc-500">{invalidationTypeLabel(ev.invalidation_type_code)}</span>
                          <span className={`text-[10px] font-medium ${invalidationStatusCls(ev.status)}`}>{ev.status}</span>
                          <span className="text-[10px] text-zinc-600">{fmt(ev.created_at)}</span>
                        </div>
                        {ev.reason && (
                          <p className="text-[10px] text-zinc-400 break-words">{ev.reason}</p>
                        )}
                        {ev.mh_estado && (
                          <p className="text-[10px] text-zinc-500">
                            MH: <span className="text-zinc-300">{ev.mh_estado}</span>
                            {ev.mh_descripcion_msg && (
                              <> — <span className="text-zinc-400">{ev.mh_descripcion_msg}</span></>
                            )}
                          </p>
                        )}
                        {ev.mh_sello_recibido && (
                          <p className="text-[10px] text-zinc-500">
                            Sello: <span className="text-zinc-300 font-mono break-all">{ev.mh_sello_recibido}</span>
                          </p>
                        )}
                        {ev.last_error && ev.status !== "ACCEPTED" && (
                          <p className="text-[10px] text-red-400 break-words">{ev.last_error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
