"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-bundle-viewer.tsx
//
// Visor del Deployment Bundle. Muestra el JSON estructurado
// y permite descargarlo.
// ─────────────────────────────────────────────────────────────────

import { useState }                from "react";
import { ChevronDown, ChevronUp }  from "lucide-react";
import type { DeploymentBundle }   from "../types/platform.types";

interface Props {
  bundle: DeploymentBundle;
}

interface SectionProps {
  title:    string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-50 hover:bg-zinc-100 transition-colors text-sm font-medium text-zinc-700"
      >
        {title}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="px-4 py-3 bg-white">
          {children}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3 py-1 text-sm">
      <span className="text-zinc-500 w-40 shrink-0">{label}</span>
      <span className="text-zinc-800 font-mono">{value ?? <span className="text-zinc-400 italic">—</span>}</span>
    </div>
  );
}

export function PlatformDeploymentBundleViewer({ bundle }: Props) {
  return (
    <div className="space-y-3">

      <Section title="Organización" defaultOpen>
        <Row label="ID"           value={bundle.organization.id} />
        <Row label="Código"       value={bundle.organization.code} />
        <Row label="Nombre"       value={bundle.organization.name} />
        <Row label="Razón social" value={bundle.organization.legal_name} />
        <Row label="NIT"          value={bundle.organization.nit} />
        <Row label="Tenant ID"    value={bundle.organization.tenant_id} />
        <Row label="País"         value={bundle.organization.country_code} />
        <Row label="Zona horaria" value={bundle.organization.timezone} />
      </Section>

      <Section title="Vertical">
        <Row label="Código" value={bundle.vertical?.code} />
        <Row label="Nombre" value={bundle.vertical?.name} />
      </Section>

      <Section title="Plan">
        <Row label="Código"           value={bundle.plan?.code} />
        <Row label="Nombre"           value={bundle.plan?.name} />
        <Row label="Ciclo facturación" value={bundle.plan?.billing_cycle} />
        <Row label="Precio mensual"   value={bundle.plan?.price_monthly?.toString()} />
        <Row label="Precio anual"     value={bundle.plan?.price_annual?.toString()} />
        <Row label="Máx. sedes"       value={bundle.plan?.max_locations?.toString()} />
        <Row label="Máx. usuarios"    value={bundle.plan?.max_users?.toString()} />
      </Section>

      <Section title="Branding">
        <Row label="Color primario"   value={bundle.branding?.primary_color} />
        <Row label="Color secundario" value={bundle.branding?.secondary_color} />
        <Row label="Logo URL"         value={bundle.branding?.logo_url} />
        <Row label="Favicon URL"      value={bundle.branding?.favicon_url} />
        <Row label="Dominio custom"   value={bundle.branding?.custom_domain} />
      </Section>

      <Section title="Licencia">
        <Row label="Estado licencia"  value={bundle.license.license_status} />
        <Row label="Ciclo"            value={bundle.license.billing_cycle} />
        <Row label="Trial hasta"      value={bundle.license.trial_ends_at?.toISOString()} />
        <Row label="Expira"           value={bundle.license.license_expires_at?.toISOString()} />
      </Section>

      <Section title={`Módulos activos (${bundle.modules.length})`}>
        {bundle.modules.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">Sin módulos activos.</p>
        ) : (
          <div className="space-y-1">
            {bundle.modules.map((m) => (
              <div key={m.code} className="flex items-center gap-3 text-sm py-0.5">
                <span className="font-mono text-zinc-700 w-36">{m.code}</span>
                <span className="text-zinc-600">{m.name}</span>
                <span className="ml-auto text-xs text-zinc-400">{m.category} · {m.version}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Configuración">
        <Row label="Deployment URL"  value={bundle.configuration.deployment_url} />
        <Row label="Instance ID"     value={bundle.configuration.instance_identifier} />
      </Section>

      <Section title="Metadata">
        <Row label="Versión bundle"  value={bundle.metadata.bundle_version} />
        <Row label="Generado"        value={new Date(bundle.metadata.generated_at).toLocaleString("es-SV")} />
        <Row label="Generado por"    value={bundle.metadata.generated_by} />
      </Section>

    </div>
  );
}
