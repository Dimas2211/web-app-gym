// ─────────────────────────────────────────────────────────────────
// platform — platform-organization-settings-panel.tsx
//
// Panel de configuración operativa: deployment_url, instance_identifier,
// branding, módulos activos, vertical, plan.
// Punto de partida para Provisioning futuro.
// ─────────────────────────────────────────────────────────────────

import type {
  PlatformOrganizationDetail,
  OrganizationModuleItem,
  PlatformBrandingData,
} from "../types/platform.types";

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-zinc-800 break-all">{value ?? "—"}</p>
    </div>
  );
}

interface Props {
  org:       PlatformOrganizationDetail;
  orgModules: OrganizationModuleItem[];
  branding:  PlatformBrandingData | null;
}

export function PlatformOrganizationSettingsPanel({ org, orgModules, branding }: Props) {
  const activeModules = orgModules.filter((m) => m.is_active);

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-6">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
        Configuración operativa
      </h2>

      {/* Despliegue */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-3">Despliegue e instancia</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField label="URL de despliegue"          value={org.deployment_url} />
          <InfoField label="Identificador de instancia" value={org.instance_identifier} />
          <InfoField label="Vertical"                   value={org.vertical ? `${org.vertical.name} (${org.vertical.code})` : null} />
          <InfoField label="Plan activo"                value={org.plan?.name} />
        </div>
      </div>

      {/* Branding */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-3">Branding</p>
        {branding ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <InfoField label="Color primario"   value={branding.primary_color} />
            <InfoField label="Color secundario" value={branding.secondary_color} />
            <InfoField label="Logo URL"         value={branding.logo_url} />
            <InfoField label="Dominio custom"   value={branding.custom_domain} />
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Sin branding configurado.</p>
        )}
      </div>

      {/* Módulos activos */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-3">
          Módulos activos ({activeModules.length})
        </p>
        {activeModules.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin módulos activos.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {activeModules.map((m) => (
              <span
                key={m.id}
                className="text-xs font-mono bg-zinc-100 text-zinc-700 px-2 py-1 rounded-md"
              >
                {m.module.code}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
