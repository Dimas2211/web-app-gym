"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-support-session-client.tsx
//
// Platform Support Session (F1-A).
// Contenedor operativo de sesión de soporte por perfil de base de
// datos. Todos los módulos son read-only en esta fase — no crea
// ventas, no emite DTE, no cobra caja, no ajusta inventario.
//
// Reglas de seguridad:
// - No renderiza password, encrypted_password ni DATABASE_URL.
// - No renderiza host/puerto de conexión — solo db_name.
// - Los errores vienen sanitizados desde la action.
// - Solo operaciones de lectura (action read-only).
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ShieldAlert,
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
  Boxes,
  Settings,
  ExternalLink,
  FileSpreadsheet,
} from "lucide-react";

import { getSupportSessionDataAction } from "../actions/get-support-session-data.action";
import { SupportDtePanel } from "./support-session/support-dte-panel";
import type {
  PlatformSupportSessionData,
  PlatformSupportSessionModuleKey,
  SafeDatabaseProfileHeader,
} from "../types/platform.types";

interface Props {
  profile: SafeDatabaseProfileHeader;
}

// ── Badges ──────────────────────────────────────────────────────

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

function StatusChip({ value }: { value: string }) {
  const upper = value.toUpperCase();
  const cls =
    upper === "ACTIVE" || upper === "ACCEPTED" || upper === "CONFIRMED" || upper === "CLOSED"
      ? "bg-green-100 text-green-700"
    : upper === "INACTIVE" || upper === "CANCELLED"
      ? "bg-zinc-100 text-zinc-500"
    : upper === "DRAFT" || upper === "OPEN" || upper === "UNPAID"
      ? "bg-amber-100 text-amber-700"
    : upper === "REJECTED"
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

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

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────

const VALID_TAB_KEYS: readonly PlatformSupportSessionModuleKey[] = [
  "resumen", "productos", "clientes", "proveedores", "inventario", "ventas", "dte", "caja", "configuracion",
];

export function PlatformSupportSessionClient({ profile }: Props) {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [data,      setData]         = useState<PlatformSupportSessionData | null>(null);
  const [activeTab, setActiveTab]    = useState<PlatformSupportSessionModuleKey>(() => {
    const tabParam = searchParams.get("tab");
    return VALID_TAB_KEYS.includes(tabParam as PlatformSupportSessionModuleKey)
      ? (tabParam as PlatformSupportSessionModuleKey)
      : "resumen";
  });

  function loadData() {
    setData(null);
    startTransition(async () => {
      const result = await getSupportSessionDataAction(profile.id);
      setData(result);
    });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [profile.id]);

  const success = data?.success === true ? data : null;

  const tabs: { key: PlatformSupportSessionModuleKey; label: string; count?: number }[] = [
    { key: "resumen",       label: "Resumen"                                              },
    { key: "productos",     label: "Productos",     count: success?.summary.products      },
    { key: "clientes",      label: "Clientes",      count: success?.summary.customers     },
    { key: "proveedores",   label: "Proveedores",   count: success?.summary.suppliers     },
    { key: "inventario",    label: "Inventario",    count: success?.summary.inventoryRows },
    { key: "ventas",        label: "Ventas",        count: success?.summary.sales         },
    { key: "dte",           label: "DTE",           count: success?.summary.dteDocuments  },
    { key: "caja",          label: "Caja"                                                 },
    { key: "configuracion", label: "Configuración"                                        },
  ];

  function renderTabContent() {
    if (isPending) {
      return (
        <div className="flex items-center justify-center gap-3 py-20 text-zinc-500">
          <Loader2 size={20} className="animate-spin text-emerald-500" />
          <span className="text-sm">Cargando sesión de soporte…</span>
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
            Cargar sesión de soporte
          </button>
        </div>
      );
    }

    if (!data.success) {
      return (
        <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-lg px-4 py-4">
          <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <p className="text-sm font-medium text-red-700">
              {data.reason === "MISSING_TENANT"
                ? "Tenant operativo no vinculado"
                : data.reason === "INACTIVE_PROFILE"
                  ? "Perfil inactivo"
                  : data.reason === "PROFILE_NOT_FOUND"
                    ? "Perfil no encontrado"
                    : "Error al conectar con la base de datos"}
            </p>
            <p className="text-xs text-red-600">{data.error}</p>
            {data.reason === "MISSING_TENANT" && (
              <Link
                href="/dashboard/platform/database-profiles"
                className="inline-block text-xs text-red-600 underline hover:no-underline"
              >
                Ir a Perfiles de base de datos para detectar tenant
              </Link>
            )}
            {data.reason !== "MISSING_TENANT" && (
              <button
                type="button"
                onClick={loadData}
                className="text-xs text-red-600 underline hover:no-underline"
              >
                Reintentar
              </button>
            )}
          </div>
        </div>
      );
    }

    switch (activeTab) {

      case "resumen":
        return (
          <div className="space-y-5">
            <Section title="Resumen de la base">
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                <MetricCard icon={Building2}   label="Tenants"     value={data.summary.tenants}       color="blue"   />
                <MetricCard icon={MapPin}      label="Locations"   value={data.summary.locations}     color="indigo" />
                <MetricCard icon={Users}       label="Usuarios"    value={data.summary.users}         color="purple" />
                <MetricCard icon={Package}     label="Productos"   value={data.summary.products}      color="zinc"   />
                <MetricCard icon={ShoppingCart} label="Clientes"   value={data.summary.customers}     color="green"  />
                <MetricCard icon={Truck}       label="Proveedores" value={data.summary.suppliers}     color="amber"  />
                <MetricCard icon={Boxes}       label="Inventario"  value={data.summary.inventoryRows} color="indigo" />
                <MetricCard icon={Receipt}     label="Ventas"      value={data.summary.sales}         color="blue"   />
                <MetricCard icon={FileText}    label="DTE"         value={data.summary.dteDocuments}  color="indigo" />
                <MetricCard icon={Landmark}    label="Cajas"       value={data.summary.cashRegisters} color="rose"   />
              </div>
            </Section>

            {data.tenant && (
              <Section title="Tenant / Gym detectado">
                <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-4 py-3 text-sm">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-zinc-800">{data.tenant.name}</span>
                    {data.tenant.slug && <span className="font-mono text-xs text-zinc-500">/{data.tenant.slug}</span>}
                    {data.tenant.status && <StatusChip value={data.tenant.status} />}
                    <span className="ml-auto text-xs font-mono text-zinc-400">{data.header.tenantId}</span>
                  </div>
                </div>
              </Section>
            )}

            {data.locations.length > 0 && (
              <Section title={`Sucursales / Locations (${data.locations.length}${data.summary.locations > data.locations.length ? ` de ${data.summary.locations}` : ""})`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {data.locations.map((loc) => (
                    <div key={loc.id} className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2">
                      <MapPin size={12} className="text-zinc-400 shrink-0" />
                      <span className="text-xs text-zinc-700 font-medium truncate">{loc.name}</span>
                      {loc.status && (
                        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded shrink-0 font-medium ${
                          loc.status === "active" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                        }`}>
                          {loc.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {data.warnings.length > 0 && (
              <Section title="Avisos">
                <div className="space-y-1">
                  {data.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded px-3 py-2">
                      <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-xs text-amber-700">{w}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        );

      case "productos":
        return (
          <ViewerTable
            headers={["Código", "Nombre", "Tipo", "Stockable", "Categoría", "Unidad", "Estado", "Precio venta"]}
            totalCount={data.summary.products}
            emptyMessage="Sin productos registrados."
            rows={data.products.map((p) => [
              <span key="code" className="font-mono text-zinc-600">{p.product_code}</span>,
              <span key="name" className="font-medium">{p.name}</span>,
              <span key="type" className="text-zinc-500">{p.product_type}</span>,
              <span key="stk"  className="text-zinc-500">{p.is_stockable ? "Sí" : "No"}</span>,
              <span key="cat"  className="text-zinc-500">{p.category ?? "—"}</span>,
              <span key="unit" className="text-zinc-500">{p.unit ?? "—"}</span>,
              <StatusChip key="status" value={p.status} />,
              <span key="price" className="tabular-nums">
                {p.sale_price && p.sale_price !== "0" ? `$${Number(p.sale_price).toFixed(2)}` : "—"}
              </span>,
            ])}
          />
        );

      case "clientes":
        return (
          <ViewerTable
            headers={["Código", "Nombre", "ID fiscal", "Email", "Teléfono", "Estado"]}
            totalCount={data.summary.customers}
            emptyMessage="Sin clientes registrados."
            rows={data.customers.map((c) => [
              <span key="code"  className="font-mono text-zinc-600">{c.customer_code}</span>,
              <span key="name"  className="font-medium">{c.name}</span>,
              <span key="tax"   className="font-mono text-zinc-400">{c.tax_id_masked ?? "—"}</span>,
              <span key="email" className="text-zinc-500">{c.email ?? "—"}</span>,
              <span key="phone" className="font-mono text-zinc-500">{c.phone ?? "—"}</span>,
              <StatusChip key="status" value={c.status} />,
            ])}
          />
        );

      case "proveedores":
        return (
          <ViewerTable
            headers={["Código", "Nombre", "ID fiscal", "Email", "Estado"]}
            totalCount={data.summary.suppliers}
            emptyMessage="Sin proveedores registrados."
            rows={data.suppliers.map((s) => [
              <span key="code"  className="font-mono text-zinc-600">{s.supplier_code}</span>,
              <span key="name"  className="font-medium">{s.name}</span>,
              <span key="tax"   className="font-mono text-zinc-400">{s.tax_id_masked ?? "—"}</span>,
              <span key="email" className="text-zinc-500">{s.email ?? "—"}</span>,
              <StatusChip key="status" value={s.status} />,
            ])}
          />
        );

      case "inventario":
        return (
          <ViewerTable
            headers={["Producto", "Código", "Sucursal", "Stock actual", "Reorden", "Estado"]}
            totalCount={data.summary.inventoryRows}
            emptyMessage="Sin registros de inventario."
            rows={data.inventory.map((i) => [
              <span key="name" className="font-medium">{i.product_name}</span>,
              <span key="code" className="font-mono text-zinc-500">{i.product_code}</span>,
              <span key="loc"  className="text-zinc-500">{i.location_name}</span>,
              <span key="stk"  className="tabular-nums">{i.current_stock}</span>,
              <span key="reo"  className="tabular-nums text-zinc-400">{i.reorder_quantity}</span>,
              <span key="status" className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                i.is_active ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
              }`}>
                {i.is_active ? "Activo" : "Inactivo"}
              </span>,
            ])}
          />
        );

      case "ventas":
        return (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Link
                href={`/dashboard/platform/support-session/${profile.id}/sales/new`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5
                           bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
              >
                <ShoppingCart size={12} />
                Nueva venta de prueba
              </Link>
            </div>
            <ViewerTable
            headers={["Código", "Fecha", "Cliente", "Estado", "Pago", "Total"]}
            totalCount={data.summary.sales}
            emptyMessage="Sin ventas registradas."
            rows={data.sales.map((s) => [
              <span key="code" className="font-mono font-semibold text-zinc-700">{s.sale_code}</span>,
              <span key="date" className="text-zinc-400 whitespace-nowrap">
                {s.sale_date ? new Date(s.sale_date).toLocaleDateString("es-SV") : "—"}
              </span>,
              <span key="cust" className="text-zinc-600">{s.customer_name ?? "Consumidor final"}</span>,
              <StatusChip key="status" value={s.status} />,
              <StatusChip key="pay" value={s.payment_status} />,
              <span key="total" className="tabular-nums font-medium">${Number(s.total_amount).toFixed(2)}</span>,
            ])}
            />
          </div>
        );

      case "dte":
        return (
          <div className="space-y-6">
            <SupportDtePanel profileId={profile.id} />

            <Section title="Todos los documentos DTE (visor read-only)">
              <ViewerTable
                headers={["Tipo", "Estado DTE", "Cód. generación", "Nro. control", "Sello", "Fecha"]}
                totalCount={data.summary.dteDocuments}
                emptyMessage="Sin documentos DTE registrados."
                rows={data.dte.map((d) => [
              <span key="type" className="inline-flex px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-semibold">
                {DTE_TYPE_LABELS[d.dte_type_code] ?? d.dte_type_code}
              </span>,
              <span key="status" className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                d.dte_status === "ACCEPTED"      ? "bg-green-100 text-green-700"
                : d.dte_status === "REJECTED"    ? "bg-red-100 text-red-700"
                : d.dte_status === "SENT"        ? "bg-blue-100 text-blue-700"
                : d.dte_status === "INVALIDATED" ? "bg-zinc-200 text-zinc-600"
                : "bg-amber-100 text-amber-700"
              }`}>
                {d.dte_status}
              </span>,
              <span key="gen" className="font-mono text-[10px] text-zinc-400 truncate max-w-[160px] inline-block" title={d.generation_code ?? undefined}>
                {d.generation_code ?? "—"}
              </span>,
              <span key="ctrl" className="font-mono text-[10px] text-zinc-400">{d.control_number ?? "—"}</span>,
              <span key="stamp" className="text-zinc-400">{d.reception_stamp ? "Sí" : "—"}</span>,
              <span key="date" className="text-zinc-400 whitespace-nowrap">
                {d.created_at ? new Date(d.created_at).toLocaleDateString("es-SV") : "—"}
              </span>,
                ])}
              />
            </Section>
          </div>
        );

      case "caja":
        return (
          <ViewerTable
            headers={["Caja", "Sucursal", "Estado", "Apertura", "Cierre", "Monto apertura"]}
            totalCount={data.cashSessions.length}
            emptyMessage="Sin sesiones de caja registradas."
            rows={data.cashSessions.map((cs) => [
              <span key="reg" className="font-medium">{cs.register_name}</span>,
              <span key="loc" className="text-zinc-500">{cs.location_name}</span>,
              <StatusChip key="status" value={cs.status} />,
              <span key="open" className="text-zinc-400 whitespace-nowrap">
                {cs.opened_at ? new Date(cs.opened_at).toLocaleString("es-SV") : "—"}
              </span>,
              <span key="close" className="text-zinc-400 whitespace-nowrap">
                {cs.closed_at ? new Date(cs.closed_at).toLocaleString("es-SV") : "—"}
              </span>,
              <span key="amount" className="tabular-nums">${Number(cs.opening_amount).toFixed(2)}</span>,
            ])}
          />
        );

      case "configuracion":
        return (
          <div className="space-y-5">
            <Section title="Configuración fiscal del tenant">
              <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-4 py-3 text-xs space-y-1">
                <div>
                  <span className="text-zinc-400">Agente de retención:</span>{" "}
                  <span className="font-medium text-zinc-700">
                    {data.fiscalConfig.isRetentionAgent ? "Sí" : "No"}
                  </span>
                </div>
                {data.fiscalConfig.retentionThresholdAmount && (
                  <div>
                    <span className="text-zinc-400">Umbral de retención:</span>{" "}
                    <span className="font-mono text-zinc-700">${Number(data.fiscalConfig.retentionThresholdAmount).toFixed(2)}</span>
                  </div>
                )}
              </div>
            </Section>

            {data.fiscalConfig.issuer ? (
              <Section title="Configuración DTE activa">
                <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-4 flex-wrap text-xs">
                    <div><span className="text-zinc-400">Nombre:</span> <span className="font-medium text-zinc-700">{data.fiscalConfig.issuer.name}</span></div>
                    <div><span className="text-zinc-400">NIT:</span> <span className="font-mono text-zinc-700">{data.fiscalConfig.issuer.nit}</span></div>
                    <div>
                      <span className="text-zinc-400">Ambiente:</span>{" "}
                      <span className={`px-1.5 py-0.5 rounded font-semibold ${
                        data.fiscalConfig.issuer.environment === "PRODUCTION" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {data.fiscalConfig.issuer.environment}
                      </span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      data.fiscalConfig.issuer.is_active ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                    }`}>
                      {data.fiscalConfig.issuer.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>
              </Section>
            ) : (
              <p className="text-xs text-zinc-400">Sin configuración de emisor DTE activa.</p>
            )}

            <Section title="Catálogos">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard icon={Package}  label="Unidades medida"  value={data.catalogSummary.unitsOfMeasure}      color="zinc"   />
                <MetricCard icon={Boxes}    label="Categorías prod." value={data.catalogSummary.productCategories}   color="zinc"   />
                <MetricCard icon={Users}    label="Tipos ident."     value={data.catalogSummary.identificationTypes} color="zinc"   />
                <MetricCard icon={Landmark} label="Act. económicas"  value={data.catalogSummary.economicActivities}  color="zinc"   />
                <MetricCard icon={MapPin}   label="Municipios"       value={data.catalogSummary.municipalities}      color="zinc"   />
                <MetricCard icon={FileText} label="Catálogo DTE MH"  value={data.catalogSummary.dteCatalogItems}     color="indigo" />
                <MetricCard icon={Receipt}  label="Tasas impuesto"   value={data.catalogSummary.taxRates}            color="zinc"   />
              </div>
            </Section>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="space-y-5">

      {/* Banner persistente de sesión de soporte */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
        <ShieldAlert size={15} className="text-indigo-600 shrink-0" />
        <span className="text-xs font-medium text-indigo-800">
          Sesión de soporte por perfil — No estás viendo la base del .env.
        </span>
      </div>

      {/* Warning fuerte si el ambiente es PRODUCTION */}
      {profile.environment === "PRODUCTION" && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={15} className="text-red-600 shrink-0" />
          <span className="text-xs font-semibold text-red-700">
            Ambiente de PRODUCCIÓN. Sesión estrictamente read-only — no se permiten operaciones de escritura en esta fase.
          </span>
        </div>
      )}

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
            <h1 className="text-xl font-bold text-zinc-800">{profile.label}</h1>
            <EnvBadge env={profile.environment} />
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              profile.is_active ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
            }`}>
              {profile.is_active ? "Activo" : "Inactivo"}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
            <span>
              <span className="font-semibold">Organización:</span>{" "}
              {profile.organization.code} — {profile.organization.name}
            </span>
            <span><span className="font-semibold">Base:</span> {profile.db_name}</span>
            <span>
              <span className="font-semibold">Tenant:</span>{" "}
              <span className="font-mono text-zinc-600">{success?.header.tenantId ?? "—"}</span>
            </span>
            <span className="flex items-center gap-1">
              Última prueba: <TestStatusBadge status={profile.last_test_status} />
            </span>
          </div>
        </div>

        {success && (
          <button
            type="button"
            onClick={loadData}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs text-zinc-500 border border-zinc-200
                       rounded-lg px-3 py-1.5 hover:bg-zinc-50 transition-colors disabled:opacity-50 shrink-0"
          >
            {isPending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Actualizar datos
          </button>
        )}
      </div>

      {/* Navegación de herramientas de soporte relacionadas */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href="/dashboard/platform/database-profiles"
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-indigo-200
                     rounded-lg text-indigo-700 hover:bg-indigo-50 transition-colors"
          title="Ejecutar Preflight / Inspector / Detectar tenant desde Perfiles de BD"
        >
          <Settings size={11} />
          Preflight / Inspector (Perfiles de BD)
        </Link>
        <Link
          href={`/dashboard/platform/client-view/${profile.id}`}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-emerald-200
                     rounded-lg text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          <ExternalLink size={11} />
          Visor legado
        </Link>
        <Link
          href={`/dashboard/platform/data-onboarding/${profile.id}`}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-violet-200
                     rounded-lg text-violet-700 hover:bg-violet-50 transition-colors"
        >
          <FileSpreadsheet size={11} />
          Data onboarding
        </Link>
      </div>

      {/* Área principal: tabs + contenido */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
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
              {tab.count !== undefined && success && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === tab.key ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {renderTabContent()}

          {success && activeTab === "resumen" && (
            <div className="mt-5">
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
                <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                <span className="text-xs font-medium text-green-700">Sesión de soporte cargada correctamente</span>
                {data && data.success && data.warnings.length > 0 && (
                  <span className="ml-auto text-xs text-amber-600 font-medium">
                    {data.warnings.length} aviso{data.warnings.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
