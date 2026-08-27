"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/settings — dte-environment-settings-panel.tsx
//
// Pantalla "Facturación Electrónica" — /dashboard/settings/dte.
// Muestra las configuraciones TEST/PRODUCTION del tenant/location
// activo, estado de credenciales (sanitizado), preflight PRODUCTION,
// y permite: crear/editar cada config, guardar credenciales, y
// activar el ambiente (switch atómico con confirmación).
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import { FlaskConical, Rocket, ShieldCheck, ShieldAlert, ShieldX, KeyRound, Settings2 } from "lucide-react";

import { DteIssuerConfigFormDialog } from "./dte-issuer-config-form-dialog";
import { DteCredentialFormDialog } from "./dte-credential-form-dialog";
import { SwitchDteEnvironmentDialog } from "./switch-dte-environment-dialog";
import type { DteEnvironmentPanelData, DteEnvironmentPanelEntry } from "../../queries/get-dte-environment-panel-data";
import type { DteEnvironment } from "../../types/dte.types";

interface Props {
  data: DteEnvironmentPanelData;
}

type DialogState =
  | { type: "issuer-config"; environment: DteEnvironment }
  | { type: "credential"; environment: DteEnvironment }
  | { type: "switch"; environment: DteEnvironment }
  | null;

function maskNit(nit: string | null | undefined): string {
  if (!nit) return "— sin configurar —";
  if (nit.length <= 4) return "•".repeat(nit.length);
  return `${nit.slice(0, 4)}${"•".repeat(Math.max(0, nit.length - 8))}${nit.slice(-4)}`;
}

function StatusBadge({ isActive, hasConfig }: { isActive: boolean; hasConfig: boolean }) {
  if (!hasConfig) {
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">NO CONFIGURADO</span>;
  }
  return isActive ? (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ACTIVO</span>
  ) : (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">INACTIVO</span>
  );
}

function CredentialBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="text-xs font-medium text-emerald-600">Credenciales configuradas</span>
  ) : (
    <span className="text-xs font-medium text-amber-600">Credenciales no configuradas</span>
  );
}

function PreflightSummary({ status }: { status: "READY" | "WARNING" | "BLOCKED" }) {
  const map = {
    READY:   { icon: ShieldCheck, cls: "text-emerald-600", label: "Preflight: READY" },
    WARNING: { icon: ShieldAlert, cls: "text-amber-600",   label: "Preflight: WARNING" },
    BLOCKED: { icon: ShieldX,     cls: "text-red-600",     label: "Preflight: BLOCKED" },
  } as const;
  const { icon: Icon, cls, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${cls}`}>
      <Icon size={13} /> {label}
    </span>
  );
}

function EnvironmentCard({
  entry, onOpen,
}: {
  entry: DteEnvironmentPanelEntry;
  onOpen: (d: DialogState) => void;
}) {
  const isProd = entry.environment === "PRODUCTION";
  const hasConfig = !!entry.config;
  // F-DTE-ENV — Auditoría TEST/PROD (repair): cada tarjeta refleja SU
  // PROPIA fila `config.is_active`, nunca un cálculo global de "cuál es
  // el único activo". Antes se usaba `active_environment === entry.environment`
  // (el primer match de un `.find()`), que podía mostrar "INACTIVO" en
  // una fila que en la base realmente tenía `is_active: true` — ocultando
  // el estado inconsistente en vez de mostrarlo.
  const isActive = !!entry.config?.is_active;
  const Icon = isProd ? Rocket : FlaskConical;

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isActive ? "border-emerald-300 ring-1 ring-emerald-100" : "border-zinc-200"}`}>
      <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} className={isProd ? "text-red-500" : "text-blue-500"} />
          <h2 className="text-sm font-bold text-zinc-800">
            {isProd ? "PRODUCCIÓN" : "PRUEBAS"}
          </h2>
          <span className="text-xs font-mono text-zinc-400">Código MH: {isProd ? "01" : "00"}</span>
        </div>
        <StatusBadge isActive={isActive} hasConfig={hasConfig} />
      </div>

      <div className="p-5 space-y-3">
        {hasConfig ? (
          <>
            <div className="text-sm">
              <div className="font-medium text-zinc-800">{entry.config!.name}</div>
              <div className="text-xs text-zinc-500 mt-0.5">NIT: {maskNit(entry.config!.nit)}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <div>
                <span className="text-zinc-400">Establecimiento MH</span>
                <div className="font-mono">{entry.config!.cod_estable_mh ?? "— sin configurar —"}</div>
              </div>
              <div>
                <span className="text-zinc-400">Punto de venta MH</span>
                <div className="font-mono">{entry.config!.cod_punto_venta_mh ?? "— sin configurar —"}</div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <CredentialBadge configured={!!entry.credential?.configured} />
              {isProd && entry.preflight && <PreflightSummary status={entry.preflight.status} />}
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-400">
            No existe configuración de emisor para este ambiente todavía.
          </p>
        )}

        {isProd && entry.preflight && entry.preflight.status !== "READY" && (
          <ul className="text-xs text-zinc-500 space-y-1 bg-zinc-50 rounded-lg px-3 py-2">
            {entry.preflight.checks
              .filter((c) => c.status !== "ok")
              .slice(0, 4)
              .map((c) => (
                <li key={c.code} className={c.status === "blocked" ? "text-red-600" : "text-amber-600"}>
                  {c.status === "blocked" ? "✕" : "△"} {c.label}
                </li>
              ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={() => onOpen({ type: "issuer-config", environment: entry.environment })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 border border-zinc-200 rounded-lg px-3 py-1.5 hover:bg-zinc-100 transition-colors"
          >
            <Settings2 size={13} /> {hasConfig ? "Editar datos fiscales" : "Configurar"}
          </button>

          {hasConfig && (
            <button
              type="button"
              onClick={() => onOpen({ type: "credential", environment: entry.environment })}
              className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 border border-zinc-200 rounded-lg px-3 py-1.5 hover:bg-zinc-100 transition-colors"
            >
              <KeyRound size={13} /> Credenciales
            </button>
          )}

          {hasConfig && !isActive && (
            <button
              type="button"
              onClick={() => onOpen({ type: "switch", environment: entry.environment })}
              disabled={isProd && entry.preflight?.status === "BLOCKED"}
              className={`inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isProd ? "bg-red-600 text-white hover:bg-red-700" : "bg-zinc-900 text-white hover:bg-zinc-800"
              }`}
            >
              Activar {isProd ? "PRODUCCIÓN" : "PRUEBAS"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DteEnvironmentSettingsPanel({ data }: Props) {
  const [dialog, setDialog] = useState<DialogState>(null);

  const entryFor = (env: DteEnvironment) => (env === "PRODUCTION" ? data.production : data.test);

  return (
    <div className="space-y-5">
      {/*
        F-DTE-ENV — Auditoría TEST/PROD (repair): el banner solo afirma
        "el ambiente activo es X" cuando active_count === 1 (único caso
        confiable). Con 0 activas no hay ambiente operativo. Con >1
        activas el estado es inválido — se muestra como error explícito,
        nunca se elige una de las dos como "la" activa para no ocultar
        la inconsistencia real de la base.
      */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm px-5 py-4">
        {data.active_count === 1 ? (
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Ambiente activo</p>
            <p className="text-lg font-bold text-zinc-800 mt-0.5">
              {data.active_environment === "PRODUCTION"
                ? "PRODUCCIÓN (código MH 01)"
                : "PRUEBAS (código MH 00)"}
            </p>
          </div>
        ) : data.active_count === 0 ? (
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Ambiente activo</p>
            <p className="text-lg font-bold text-amber-600 mt-0.5">Sin ambiente activo</p>
            <p className="text-xs text-zinc-500 mt-1">
              Ninguna configuración DTE está activa para esta sucursal. No se pueden generar Documentos
              Tributarios Electrónicos hasta activar TEST o PRODUCCIÓN.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold text-red-500 uppercase tracking-wide">Error de configuración</p>
            <p className="text-lg font-bold text-red-700 mt-0.5">
              {data.active_count} configuraciones activas simultáneamente
            </p>
            <p className="text-xs text-red-600 mt-1">
              Estado inválido: se esperaba exactamente 1 configuración activa para esta sucursal. No se puede
              confiar en ningún ambiente hasta corregir esto. Contacte a soporte/administración de la plataforma.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EnvironmentCard entry={data.test} onOpen={setDialog} />
        <EnvironmentCard entry={data.production} onOpen={setDialog} />
      </div>

      {dialog?.type === "issuer-config" && (
        <DteIssuerConfigFormDialog
          environment={dialog.environment}
          existing={entryFor(dialog.environment).config}
          prefillFrom={
            !entryFor(dialog.environment).config && dialog.environment === "PRODUCTION"
              ? data.test.config
              : null
          }
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.type === "credential" && entryFor(dialog.environment).config && (
        <DteCredentialFormDialog
          issuerConfigId={entryFor(dialog.environment).config!.id}
          environment={dialog.environment}
          status={entryFor(dialog.environment).credential}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.type === "switch" && entryFor(dialog.environment).config && (
        <SwitchDteEnvironmentDialog
          targetIssuerConfigId={entryFor(dialog.environment).config!.id}
          targetEnvironment={dialog.environment}
          preflight={dialog.environment === "PRODUCTION" ? data.production.preflight : null}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
