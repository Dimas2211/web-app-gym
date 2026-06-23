"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-client-view-client.tsx
//
// Visor read-only de base de datos cliente (C6).
// Carga y muestra datos de una base cliente seleccionada desde
// Platform Admin. No modifica datos ni ejecuta migraciones o seeds.
//
// Reglas de seguridad:
// - No renderiza password, encrypted_password ni DATABASE_URL.
// - Los errores vienen sanitizados desde la action.
// - Solo operaciones de lectura (action read-only).
// - No ejecuta writes, seeds ni migraciones.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
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
  Server,
  Hash,
} from "lucide-react";

import { getClientViewDataAction } from "../actions/get-client-view-data.action";
import type {
  ClientViewData,
  SafeDatabaseProfileHeader,
} from "../types/platform.types";

interface Props {
  profile: SafeDatabaseProfileHeader;
}

type TabKey =
  | "resumen"
  | "productos"
  | "clientes"
  | "proveedores"
  | "ventas"
  | "dte"
  | "caja"
  | "catalogos";

// ── Badge de ambiente ─────────────────────────────────────────────

function EnvBadge({ env }: { env: string }) {
  const cls: Record<string, string> = {
    LOCAL:      "bg-zinc-100 text-zinc-600",
    SANDBOX:    "bg-amber-100 text-amber-700",
    TEST:       "bg-sky-100 text-sky-700",
    STAGING:    "bg-orange-100 text-orange-700",
    PRODUCTION: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cls[env] ?? cls.LOCAL}`}>
      {env}
    </span>
  );
}

// ── Badge de estado de conexión ───────────────────────────────────

function TestStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    UNTESTED: { cls: "bg-zinc-100 text-zinc-500",   label: "Sin probar" },
    SUCCESS:  { cls: "bg-green-100 text-green-700", label: "Exitosa"    },
    FAILED:   { cls: "bg-red-100 text-red-700",     label: "Fallida"    },
  };
  const { cls, label } = cfg[status] ?? cfg.UNTESTED;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Tarjeta de métrica ────────────────────────────────────────────

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

// ── Encabezado de sección ─────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

// ── Tabla genérica read-only ──────────────────────────────────────

function ViewerTable({
  headers,
  rows,
  emptyMessage,
  totalCount,
}: {
  headers:      string[];
  rows:         React.ReactNode[][];
  emptyMessage: string;
  totalCount:   number;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-zinc-400 py-4 text-center">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      {totalCount > rows.length && (
        <p className="text-xs text-zinc-400">
          Mostrando {rows.length} de {totalCount} registros
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-100 text-zinc-400 uppercase tracking-wide">
              {headers.map((h) => (
                <th key={h} className="pb-2 text-left font-semibold pr-4 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {rows.map((cells, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-zinc-50/50 transition-colors">
                {cells.map((cell, cellIdx) => (
                  <td key={cellIdx} className="py-2 pr-4 text-zinc-700 align-top">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Badges de estado ─────────────────────────────────────────────

function StatusChip({ value }: { value: string }) {
  const upper = value.toUpperCase();
  const cls =
    upper === "ACTIVE" || upper === "ACTIVE" || value === "active"
      ? "bg-green-100 text-green-700"
    : upper === "INACTIVE" || value === "inactive" || upper === "CANCELLED"
      ? "bg-zinc-100 text-zinc-500"
    : upper === "CONFIRMED"
      ? "bg-green-100 text-green-700"
    : upper === "DRAFT"
      ? "bg-amber-100 text-amber-700"
    : upper === "CANCELLED"
      ? "bg-red-100 text-red-700"
    : "bg-zinc-100 text-zinc-600";

  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>
      {value}
    </span>
  );
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

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────

export function PlatformClientViewClient({ profile }: Props) {
  const [isPending,  startTransition] = useTransition();
  const [data,       setData]         = useState<ClientViewData | null>(null);
  const [activeTab,  setActiveTab]    = useState<TabKey>("resumen");

  function loadData() {
    setData(null);
    startTransition(async () => {
      const result = await getClientViewDataAction(profile.id);
      setData(result);
    });
  }

  // Carga automática al montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [profile.id]);

  // ── Tabs con contadores dinámicos ─────────────────────────────

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "resumen",      label: "Resumen"                                                     },
    { key: "productos",    label: "Productos",   count: data?.summary.products                  },
    { key: "clientes",     label: "Clientes",    count: data?.summary.customers                 },
    { key: "proveedores",  label: "Proveedores", count: data?.summary.suppliers                 },
    { key: "ventas",       label: "Ventas",      count: data?.summary.sales                     },
    { key: "dte",          label: "DTE",         count: data?.summary.dteDocuments              },
    { key: "caja",         label: "Caja",        count: data?.summary.cashRegisters             },
    { key: "catalogos",    label: "Catálogos"                                                   },
  ];

  // ── Renderizado del contenido de cada tab ────────────────────

  function renderTabContent() {
    if (isPending) {
      return (
        <div className="flex items-center justify-center gap-3 py-20 text-zinc-500">
          <Loader2 size={20} className="animate-spin text-emerald-500" />
          <span className="text-sm">Cargando datos de la base cliente…</span>
        </div>
      );
    }

    if (!data) {
      return (
        <div className="flex justify-center py-16">
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700
                       text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
          >
            <Database size={15} />
            Cargar datos
          </button>
        </div>
      );
    }

    if (!data.success && data.error) {
      return (
        <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-lg px-4 py-4">
          <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <p className="text-sm font-medium text-red-700">Error al conectar con la base de datos</p>
            <p className="text-xs text-red-600">{data.error}</p>
            <button
              type="button"
              onClick={loadData}
              className="text-xs text-red-600 underline hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    if (!data.success) return null;

    switch (activeTab) {

      // ──────────────────────────────────────────────────────────
      case "resumen":
        return (
          <div className="space-y-5">

            {/* Métricas principales */}
            <Section title="Resumen de la base">
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                <MetricCard icon={Building2}   label="Tenants"     value={data.summary.tenants}       color="blue"   />
                <MetricCard icon={MapPin}       label="Locations"   value={data.summary.locations}     color="indigo" />
                <MetricCard icon={Users}        label="Usuarios"    value={data.summary.users}         color="purple" />
                <MetricCard icon={Package}      label="Productos"   value={data.summary.products}      color="zinc"   />
                <MetricCard icon={ShoppingCart} label="Clientes"    value={data.summary.customers}     color="green"  />
                <MetricCard icon={Truck}        label="Proveedores" value={data.summary.suppliers}     color="amber"  />
                <MetricCard icon={Receipt}      label="Ventas"      value={data.summary.sales}         color="blue"   />
                <MetricCard icon={FileText}     label="DTE"         value={data.summary.dteDocuments}  color="indigo" />
                <MetricCard icon={Landmark}     label="Cajas"       value={data.summary.cashRegisters} color="rose"   />
              </div>
            </Section>

            {/* Tenant detectado */}
            {data.tenant && (
              <Section title="Tenant / Gym detectado">
                <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-4 py-3 text-sm">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-zinc-800">{data.tenant.name}</span>
                    {data.tenant.slug && (
                      <span className="font-mono text-xs text-zinc-500">/{data.tenant.slug}</span>
                    )}
                    {data.tenant.status && (
                      <StatusChip value={data.tenant.status} />
                    )}
                    <span className="ml-auto text-xs font-mono text-zinc-400">{data.tenant.id}</span>
                  </div>
                </div>
              </Section>
            )}

            {/* Sucursales */}
            {data.locations.length > 0 && (
              <Section title={`Sucursales / Locations (${data.locations.length}${data.summary.locations > data.locations.length ? `  de ${data.summary.locations}` : ""})`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {data.locations.map((loc) => (
                    <div key={loc.id}
                         className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2">
                      <MapPin size={12} className="text-zinc-400 shrink-0" />
                      <span className="text-xs text-zinc-700 font-medium truncate">{loc.name}</span>
                      {loc.status && (
                        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded shrink-0 font-medium ${
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

            {/* DTE config activa */}
            {data.dteConfig && (
              <Section title="Configuración DTE activa">
                <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-4 flex-wrap text-xs">
                    <div>
                      <span className="text-zinc-400">Nombre:</span>{" "}
                      <span className="font-medium text-zinc-700">{data.dteConfig.name}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400">NIT:</span>{" "}
                      <span className="font-mono text-zinc-700">{data.dteConfig.nit}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400">Ambiente:</span>{" "}
                      <span className={`px-1.5 py-0.5 rounded font-semibold ${
                        data.dteConfig.environment === "PRODUCTION"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {data.dteConfig.environment}
                      </span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      data.dteConfig.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-zinc-100 text-zinc-500"
                    }`}>
                      {data.dteConfig.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>
              </Section>
            )}
          </div>
        );

      // ──────────────────────────────────────────────────────────
      case "productos":
        return (
          <ViewerTable
            headers={["Código", "Nombre", "SKU", "Estado", "Precio venta"]}
            totalCount={data.summary.products}
            emptyMessage="Sin productos registrados."
            rows={data.products.map((p) => [
              <span key="code" className="font-mono text-zinc-600">{p.product_code}</span>,
              <span key="name" className="font-medium">{p.name}</span>,
              <span key="sku"  className="font-mono text-zinc-400">{p.sku ?? "—"}</span>,
              <StatusChip key="status" value={p.status} />,
              <span key="price" className="tabular-nums">
                {p.sale_price && p.sale_price !== "0"
                  ? `$${Number(p.sale_price).toFixed(2)}`
                  : "—"}
              </span>,
            ])}
          />
        );

      // ──────────────────────────────────────────────────────────
      case "clientes":
        return (
          <ViewerTable
            headers={["Código", "Nombre", "Email", "Teléfono", "Estado"]}
            totalCount={data.summary.customers}
            emptyMessage="Sin clientes registrados."
            rows={data.customers.map((c) => [
              <span key="code"  className="font-mono text-zinc-600">{c.customer_code}</span>,
              <span key="name"  className="font-medium">{c.name}</span>,
              <span key="email" className="text-zinc-500">{c.email ?? "—"}</span>,
              <span key="phone" className="font-mono text-zinc-500">{c.phone ?? "—"}</span>,
              <StatusChip key="status" value={c.status} />,
            ])}
          />
        );

      // ──────────────────────────────────────────────────────────
      case "proveedores":
        return (
          <ViewerTable
            headers={["Nombre", "Email", "Teléfono", "Estado"]}
            totalCount={data.summary.suppliers}
            emptyMessage="Sin proveedores registrados."
            rows={data.suppliers.map((s) => [
              <span key="name"  className="font-medium">{s.name}</span>,
              <span key="email" className="text-zinc-500">{s.email ?? "—"}</span>,
              <span key="phone" className="font-mono text-zinc-500">{s.phone ?? "—"}</span>,
              <StatusChip key="status" value={s.status} />,
            ])}
          />
        );

      // ──────────────────────────────────────────────────────────
      case "ventas":
        return (
          <ViewerTable
            headers={["Código", "Estado", "Total", "Fecha"]}
            totalCount={data.summary.sales}
            emptyMessage="Sin ventas registradas."
            rows={data.sales.map((s) => [
              <span key="code"   className="font-mono font-semibold text-zinc-700">{s.sale_code}</span>,
              <StatusChip key="status" value={s.status} />,
              <span key="total"  className="tabular-nums font-medium">
                ${Number(s.total_amount).toFixed(2)}
              </span>,
              <span key="date"   className="text-zinc-400 whitespace-nowrap">
                {s.created_at ? new Date(s.created_at).toLocaleDateString("es-SV") : "—"}
              </span>,
            ])}
          />
        );

      // ──────────────────────────────────────────────────────────
      case "dte":
        return (
          <ViewerTable
            headers={["Tipo", "Estado DTE", "Fecha"]}
            totalCount={data.summary.dteDocuments}
            emptyMessage="Sin documentos DTE registrados."
            rows={data.dteDocuments.map((d) => [
              <span key="type"
                    className="inline-flex px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-semibold">
                {DTE_TYPE_LABELS[d.dte_type_code] ?? d.dte_type_code}
              </span>,
              <span key="status" className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                d.dte_status === "ACCEPTED"    ? "bg-green-100 text-green-700"
                : d.dte_status === "REJECTED"  ? "bg-red-100 text-red-700"
                : d.dte_status === "SENT"      ? "bg-blue-100 text-blue-700"
                : d.dte_status === "INVALIDATED" ? "bg-zinc-200 text-zinc-600"
                : "bg-amber-100 text-amber-700"
              }`}>
                {d.dte_status}
              </span>,
              <span key="date" className="text-zinc-400 whitespace-nowrap">
                {d.created_at ? new Date(d.created_at).toLocaleDateString("es-SV") : "—"}
              </span>,
            ])}
          />
        );

      // ──────────────────────────────────────────────────────────
      case "caja":
        return (
          <ViewerTable
            headers={["Código", "Nombre", "Estado"]}
            totalCount={data.summary.cashRegisters}
            emptyMessage="Sin cajas registradas."
            rows={data.cashRegisters.map((r) => [
              <span key="code" className="font-mono text-zinc-600">{r.code}</span>,
              <span key="name" className="font-medium">{r.name}</span>,
              <span key="status"
                    className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      r.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-zinc-100 text-zinc-500"
                    }`}>
                {r.is_active ? "Activa" : "Inactiva"}
              </span>,
            ])}
          />
        );

      // ──────────────────────────────────────────────────────────
      case "catalogos":
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard icon={Package}  label="Unidades medida"  value={data.catalogSummary.unitsOfMeasure}      color="zinc"   />
            <MetricCard icon={BookOpen} label="Categorías prod." value={data.catalogSummary.productCategories}   color="zinc"   />
            <MetricCard icon={Hash}     label="Tipos ident."     value={data.catalogSummary.identificationTypes} color="zinc"   />
            <MetricCard icon={Landmark} label="Act. económicas"  value={data.catalogSummary.economicActivities}  color="zinc"   />
            <MetricCard icon={MapPin}   label="Municipios"       value={data.catalogSummary.municipalities}      color="zinc"   />
            <MetricCard icon={FileText} label="Catálogo DTE MH"  value={data.catalogSummary.dteCatalogItems}     color="indigo" />
            <MetricCard icon={Receipt}  label="Tasas impuesto"   value={data.catalogSummary.taxRates}            color="zinc"   />
          </div>
        );

      default:
        return null;
    }
  }

  // ── Render principal ──────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header: volver + info del perfil */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <Link
            href="/dashboard/platform/database-profiles"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
          >
            <ArrowLeft size={13} />
            Volver a perfiles de base de datos
          </Link>

          <div className="flex items-center gap-2">
            <Database size={18} className="text-emerald-500" />
            <h1 className="text-xl font-bold text-zinc-800">{profile.label}</h1>
            <EnvBadge env={profile.environment} />
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              profile.is_active
                ? "bg-green-100 text-green-700"
                : "bg-zinc-100 text-zinc-500"
            }`}>
              {profile.is_active ? "Activo" : "Inactivo"}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
            <span>
              <span className="font-semibold">{profile.organization.code}</span>
              {" — "}{profile.organization.name}
            </span>
            <span className="flex items-center gap-1">
              <Server size={11} />
              <span className="font-mono">
                {profile.db_host}{profile.db_port ? `:${profile.db_port}` : ""}
              </span>
              <span className="text-zinc-400">/ {profile.db_name}</span>
            </span>
            <span className="flex items-center gap-1 text-zinc-400">
              Usuario: <span className="font-mono text-zinc-600">{profile.db_user}</span>
            </span>
            <span>SSL: {profile.ssl_mode}</span>
            <span className="flex items-center gap-1">
              Última prueba:
              <TestStatusBadge status={profile.last_test_status} />
            </span>
          </div>
        </div>

        {/* Botón actualizar — solo visible cuando hay datos */}
        {data?.success && (
          <button
            type="button"
            onClick={loadData}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs text-zinc-500 border border-zinc-200
                       rounded-lg px-3 py-1.5 hover:bg-zinc-50 transition-colors disabled:opacity-50 shrink-0"
          >
            {isPending
              ? <Loader2 size={11} className="animate-spin" />
              : <RefreshCw size={11} />}
            Actualizar datos
          </button>
        )}
      </div>

      {/* Banner de advertencia read-only */}
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
        <AlertTriangle size={13} className="text-amber-500 shrink-0" />
        <span className="text-xs text-amber-700">
          Visor read-only. No modifica datos, no ejecuta migraciones ni seeds.
        </span>
      </div>

      {/* Área principal: tabs + contenido */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">

        {/* Barra de tabs */}
        <div className="flex items-center gap-0 border-b border-zinc-100 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap
                          border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-emerald-500 text-emerald-700 bg-emerald-50/50"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && data?.success && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === tab.key
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-zinc-100 text-zinc-500"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Contenido del tab activo */}
        <div className="p-5">
          {renderTabContent()}

          {/* Banner éxito + avisos */}
          {data?.success && activeTab === "resumen" && (
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
                <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                <span className="text-xs font-medium text-green-700">
                  Datos cargados correctamente
                </span>
                {data.warnings.length > 0 && (
                  <span className="ml-auto text-xs text-amber-600 font-medium">
                    {data.warnings.length} aviso{data.warnings.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {data.warnings.length > 0 && (
                <div className="space-y-1">
                  {data.warnings.map((w, i) => (
                    <div key={i}
                         className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded px-3 py-2">
                      <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-xs text-amber-700">{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
