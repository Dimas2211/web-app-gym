// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-summary.tsx
//
// Bloque 7: resumen completo de la organización antes de provisioning.
// Solo visualización — no ejecuta nada.
// ─────────────────────────────────────────────────────────────────

import { Server } from "lucide-react";

import type {
  PlatformOrganizationDetail,
  OrganizationModuleItem,
  PlatformBrandingData,
  PlatformLicenseStatus,
  PlatformOrganizationStatus,
} from "../types/platform.types";

const ORG_STATUS_COLORS: Record<PlatformOrganizationStatus, string> = {
  PENDING:   "bg-yellow-100 text-yellow-700",
  ACTIVE:    "bg-green-100 text-green-700",
  SUSPENDED: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const LICENSE_COLORS: Record<PlatformLicenseStatus, string> = {
  TRIAL:     "bg-blue-100 text-blue-700",
  ACTIVE:    "bg-green-100 text-green-700",
  SUSPENDED: "bg-orange-100 text-orange-700",
  EXPIRED:   "bg-red-100 text-red-700",
  CANCELLED: "bg-zinc-100 text-zinc-500",
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-zinc-100 last:border-0">
      <span className="text-xs text-zinc-500 w-40 shrink-0">{label}</span>
      <span className="text-xs font-medium text-zinc-800 text-right break-all">
        {value ?? <span className="text-zinc-400">—</span>}
      </span>
    </div>
  );
}

interface Props {
  org:        PlatformOrganizationDetail;
  orgModules: OrganizationModuleItem[];
  branding:   PlatformBrandingData | null;
}

export function PlatformDeploymentSummary({ org, orgModules, branding }: Props) {
  const activeModules = orgModules.filter((m) => m.is_active);

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-5">
      <div className="flex items-center gap-2.5">
        <Server size={16} className="text-zinc-400" />
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Deployment summary
        </h2>
      </div>

      <div className="bg-zinc-50 rounded-lg p-4 text-xs text-zinc-500 border border-zinc-100">
        Este resumen es de solo lectura. El provisioning automatizado se implementará en una etapa posterior.
      </div>

      {/* Organización */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">Organización</p>
        <div className="space-y-0">
          <Row label="Nombre"       value={org.name} />
          <Row label="Código"       value={org.code} />
          <Row label="Razón social" value={org.legal_name} />
          <Row label="NIT"          value={org.nit} />
          <Row label="Tenant ID"    value={org.tenant_id} />
          <div className="flex items-start justify-between py-2 border-b border-zinc-100">
            <span className="text-xs text-zinc-500 w-40 shrink-0">Estado org.</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ORG_STATUS_COLORS[org.status]}`}>
              {org.status}
            </span>
          </div>
          <div className="flex items-start justify-between py-2 border-b border-zinc-100 last:border-0">
            <span className="text-xs text-zinc-500 w-40 shrink-0">Licencia</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LICENSE_COLORS[org.license_status]}`}>
              {org.license_status}
            </span>
          </div>
        </div>
      </div>

      {/* Plan y vertical */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">Plan y vertical</p>
        <div className="space-y-0">
          <Row label="Vertical" value={org.vertical ? `${org.vertical.name} (${org.vertical.code})` : null} />
          <Row label="Plan"     value={org.plan?.name} />
          <Row label="Ciclo"    value={org.billing_cycle} />
        </div>
      </div>

      {/* Despliegue */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">Infraestructura</p>
        <div className="space-y-0">
          <Row label="URL despliegue"   value={org.deployment_url} />
          <Row label="Identificador"    value={org.instance_identifier} />
          <Row label="País"             value={org.country_code} />
          <Row label="Zona horaria"     value={org.timezone} />
        </div>
      </div>

      {/* Branding */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">Branding</p>
        {branding ? (
          <div className="space-y-0">
            <Row label="Color primario"   value={branding.primary_color} />
            <Row label="Color secundario" value={branding.secondary_color} />
            <Row label="Logo"             value={branding.logo_url} />
            <Row label="Dominio custom"   value={branding.custom_domain} />
          </div>
        ) : (
          <p className="text-xs text-zinc-400">Sin branding configurado.</p>
        )}
      </div>

      {/* Módulos activos */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">
          Módulos activos ({activeModules.length})
        </p>
        {activeModules.length === 0 ? (
          <p className="text-xs text-zinc-400">Sin módulos activos.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {activeModules.map((m) => (
              <span key={m.id} className="text-xs font-mono bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded">
                {m.module.code}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
