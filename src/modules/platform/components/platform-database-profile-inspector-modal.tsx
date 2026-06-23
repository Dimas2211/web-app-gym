"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-database-profile-inspector-modal.tsx
//
// Inspector read-only de base de datos cliente (C4).
// Muestra resumen operativo obtenido por inspectDatabaseProfileAction.
//
// Reglas de seguridad:
// - No renderiza password, encrypted_password ni DATABASE_URL.
// - Los errores vienen ya sanitizados desde la action.
// - Solo muestra datos read-only. No ejecuta writes.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition, useEffect } from "react";
import {
  X,
  Database,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Building2,
  MapPin,
  Users,
  Package,
  ShoppingCart,
  Truck,
  Receipt,
  FileText,
  Landmark,
  BookOpen,
  RefreshCw,
} from "lucide-react";

import { inspectDatabaseProfileAction } from "../actions/inspect-database-profile.action";
import type { DatabaseProfileInspectionResult } from "../types/platform.types";

interface Props {
  profileId:       string;
  profileLabel:    string;
  onClose:         () => void;
}

// ── Componente de tarjeta de métrica ─────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  color = "zinc",
}: {
  icon:   React.ElementType;
  label:  string;
  value:  number | string;
  color?: "zinc" | "blue" | "green" | "amber" | "purple" | "indigo" | "rose";
}) {
  const colorMap = {
    zinc:   "bg-zinc-50   text-zinc-500   border-zinc-100",
    blue:   "bg-blue-50   text-blue-500   border-blue-100",
    green:  "bg-green-50  text-green-600  border-green-100",
    amber:  "bg-amber-50  text-amber-600  border-amber-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    rose:   "bg-rose-50   text-rose-600   border-rose-100",
  };
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${colorMap[color]}`}>
      <Icon size={15} className="shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 truncate">{label}</p>
        <p className="text-sm font-bold text-zinc-800">{value}</p>
      </div>
    </div>
  );
}

// ── Componente de sección con título ─────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

// ── Inspector Modal ───────────────────────────────────────────────

export function PlatformDatabaseProfileInspectorModal({
  profileId,
  profileLabel,
  onClose,
}: Props) {
  const [isPending,   startTransition] = useTransition();
  const [result,      setResult]       = useState<DatabaseProfileInspectionResult | null>(null);

  // Cerrar con Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleInspect() {
    setResult(null);
    startTransition(async () => {
      const res = await inspectDatabaseProfileAction(profileId);
      setResult(res);
    });
  }

  const DTE_TYPE_LABELS: Record<string, string> = {
    "01": "FE",
    "03": "CCFE",
    "05": "NC",
    "06": "ND",
    "09": "Donación",
    "11": "Fac. Suj. Excl.",
    "14": "Fac. Export.",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-4xl mx-4 bg-white rounded-2xl shadow-2xl border border-zinc-200">

        {/* Cabecera */}
        <div className="flex items-start justify-between p-5 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Database size={16} className="text-blue-500" />
              <h2 className="text-sm font-bold text-zinc-800">
                Inspector — {profileLabel}
              </h2>
            </div>
            <p className="text-xs text-zinc-500">
              Vista read-only de la base cliente. No modifica datos ni ejecuta migraciones.
            </p>
            {result?.tenantIdUsed && (
              <p className="text-xs text-zinc-400 mt-1">
                Tenant:{" "}
                <span className="font-mono text-zinc-600">{result.tenantIdUsed}</span>
                {result.organizationName && (
                  <> · <span className="text-zinc-500">{result.organizationName}</span></>
                )}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {result?.success && (
              <button
                type="button"
                onClick={handleInspect}
                disabled={isPending}
                className="flex items-center gap-1.5 text-xs text-zinc-500 border border-zinc-200
                           rounded-lg px-3 py-1.5 hover:bg-zinc-50 transition-colors disabled:opacity-50"
              >
                {isPending
                  ? <Loader2 size={11} className="animate-spin" />
                  : <RefreshCw size={11} />}
                Actualizar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-5 space-y-5">

          {/* Estado inicial — botón cargar */}
          {!result && !isPending && (
            <div className="flex justify-center py-8">
              <button
                type="button"
                onClick={handleInspect}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700
                           text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
              >
                <Database size={15} />
                Cargar inspección
              </button>
            </div>
          )}

          {/* Cargando */}
          {isPending && (
            <div className="flex items-center justify-center gap-3 py-12 text-zinc-500">
              <Loader2 size={20} className="animate-spin text-blue-500" />
              <span className="text-sm">Inspeccionando base de datos…</span>
            </div>
          )}

          {/* Error de conexión */}
          {result && !result.success && result.error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="text-sm font-medium text-red-700">Error al inspeccionar</p>
                <p className="text-xs text-red-600">{result.error}</p>
                <button
                  type="button"
                  onClick={handleInspect}
                  disabled={isPending}
                  className="text-xs text-red-600 underline hover:no-underline disabled:opacity-50"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {/* Resultado exitoso */}
          {result?.success && (
            <div className="space-y-5">

              {/* Banner de éxito */}
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
                <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                <span className="text-xs font-medium text-green-700">
                  Inspección completada correctamente
                </span>
                {result.warnings.length > 0 && (
                  <span className="ml-auto text-xs text-amber-600 font-medium">
                    {result.warnings.length} aviso{result.warnings.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Grid de métricas de resumen */}
              <Section title="Resumen de la base">
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  <MetricCard icon={Building2}  label="Tenants"      value={result.summary.tenants}       color="blue"   />
                  <MetricCard icon={MapPin}      label="Locations"    value={result.summary.locations}     color="indigo" />
                  <MetricCard icon={Users}       label="Usuarios"     value={result.summary.users}         color="purple" />
                  <MetricCard icon={Package}     label="Productos"    value={result.summary.products}      color="zinc"   />
                  <MetricCard icon={ShoppingCart} label="Clientes"   value={result.summary.customers}     color="green"  />
                  <MetricCard icon={Truck}       label="Proveedores"  value={result.summary.suppliers}     color="amber"  />
                  <MetricCard icon={Receipt}     label="Ventas"       value={result.summary.sales}         color="blue"   />
                  <MetricCard icon={FileText}    label="DTE"          value={result.summary.dteDocuments}  color="indigo" />
                  <MetricCard icon={Landmark}    label="Cajas"        value={result.summary.cashRegisters} color="rose"   />
                </div>
              </Section>

              {/* Tenant detectado */}
              {result.tenant && (
                <Section title="Tenant / Gym detectado">
                  <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-4 py-3 text-sm">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-semibold text-zinc-800">{result.tenant.name}</span>
                      {result.tenant.slug && (
                        <span className="font-mono text-xs text-zinc-500">/{result.tenant.slug}</span>
                      )}
                      {result.tenant.status && (
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          result.tenant.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}>
                          {result.tenant.status}
                        </span>
                      )}
                      <span className="ml-auto text-xs font-mono text-zinc-400">{result.tenant.id}</span>
                    </div>
                  </div>
                </Section>
              )}

              {/* Sucursales */}
              {result.locations.length > 0 && (
                <Section title={`Sucursales / Locations (${result.locations.length})`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {result.locations.map((loc) => (
                      <div key={loc.id}
                           className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2">
                        <MapPin size={12} className="text-zinc-400 shrink-0" />
                        <span className="text-xs text-zinc-700 font-medium truncate">{loc.name}</span>
                        {loc.status && (
                          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                            loc.status === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-zinc-100 text-zinc-500"
                          }`}>
                            {loc.status}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Usuarios admin */}
              {result.admins.length > 0 && (
                <Section title={`Administradores (${result.admins.length})`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-100 text-zinc-400 uppercase tracking-wide">
                          <th className="pb-1.5 text-left font-semibold pr-3">Nombre</th>
                          <th className="pb-1.5 text-left font-semibold pr-3">Email</th>
                          <th className="pb-1.5 text-left font-semibold">Rol</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {result.admins.map((u) => (
                          <tr key={u.id}>
                            <td className="py-1.5 pr-3 font-medium text-zinc-700">{u.name}</td>
                            <td className="py-1.5 pr-3 text-zinc-500 font-mono">{u.email}</td>
                            <td className="py-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-semibold">
                                {u.role}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              {/* Dos columnas: ventas + DTE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

                {/* Ventas recientes */}
                <Section title="Ventas recientes">
                  {result.recentSales.length === 0 ? (
                    <p className="text-xs text-zinc-400 py-2">Sin ventas registradas.</p>
                  ) : (
                    <div className="space-y-1">
                      {result.recentSales.map((s) => (
                        <div key={s.id}
                             className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 rounded px-3 py-1.5">
                          <span className="font-mono text-xs text-zinc-700 font-semibold">{s.sale_code}</span>
                          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            s.status === "CONFIRMED" ? "bg-green-100 text-green-700"
                            : s.status === "CANCELLED" ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                          }`}>
                            {s.status}
                          </span>
                          <span className="text-xs text-zinc-500 font-medium shrink-0">
                            ${Number(s.total_amount).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* DTE recientes */}
                <Section title="DTE recientes">
                  {result.recentDte.length === 0 ? (
                    <p className="text-xs text-zinc-400 py-2">Sin documentos DTE registrados.</p>
                  ) : (
                    <div className="space-y-1">
                      {result.recentDte.map((d) => (
                        <div key={d.id}
                             className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 rounded px-3 py-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold shrink-0">
                            {DTE_TYPE_LABELS[d.dte_type_code] ?? d.dte_type_code}
                          </span>
                          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            d.dte_status === "ACCEPTED"     ? "bg-green-100 text-green-700"
                            : d.dte_status === "REJECTED"   ? "bg-red-100 text-red-700"
                            : d.dte_status === "SENT"       ? "bg-blue-100 text-blue-700"
                            : d.dte_status === "INVALIDATED" ? "bg-zinc-200 text-zinc-600"
                            : "bg-amber-100 text-amber-700"
                          }`}>
                            {d.dte_status}
                          </span>
                          {d.created_at && (
                            <span className="text-[10px] text-zinc-400 shrink-0">
                              {new Date(d.created_at).toLocaleDateString("es-SV")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

              </div>

              {/* Configuración DTE */}
              {result.dteConfig && (
                <Section title="Configuración DTE activa">
                  <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-4 flex-wrap text-xs">
                      <div>
                        <span className="text-zinc-400">Nombre:</span>{" "}
                        <span className="font-medium text-zinc-700">{result.dteConfig.name}</span>
                      </div>
                      <div>
                        <span className="text-zinc-400">NIT:</span>{" "}
                        <span className="font-mono text-zinc-700">{result.dteConfig.nit}</span>
                      </div>
                      <div>
                        <span className="text-zinc-400">Ambiente:</span>{" "}
                        <span className={`px-1.5 py-0.5 rounded font-semibold ${
                          result.dteConfig.environment === "PRODUCTION"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {result.dteConfig.environment}
                        </span>
                      </div>
                      <div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          result.dteConfig.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}>
                          {result.dteConfig.is_active ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                    </div>
                  </div>
                </Section>
              )}

              {/* Catálogos */}
              <Section title="Catálogos">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  <MetricCard icon={Package}  label="Unidades medida" value={result.catalogSummary.unitsOfMeasure}      color="zinc"   />
                  <MetricCard icon={BookOpen} label="Categorías"      value={result.catalogSummary.productCategories}   color="zinc"   />
                  <MetricCard icon={FileText} label="Tipos ident."    value={result.catalogSummary.identificationTypes} color="zinc"   />
                  <MetricCard icon={Landmark} label="Act. económicas" value={result.catalogSummary.economicActivities}  color="zinc"   />
                  <MetricCard icon={MapPin}   label="Municipios"      value={result.catalogSummary.municipalities}      color="zinc"   />
                  <MetricCard icon={FileText} label="Cat. DTE MH"     value={result.catalogSummary.dteCatalogItems}     color="indigo" />
                  <MetricCard icon={Receipt}  label="Tasas impuesto"  value={result.catalogSummary.taxRates}            color="zinc"   />
                </div>
              </Section>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <Section title="Avisos">
                  <div className="space-y-1">
                    {result.warnings.map((w, i) => (
                      <div key={i}
                           className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded px-3 py-2">
                        <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
                        <span className="text-xs text-amber-700">{w}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
