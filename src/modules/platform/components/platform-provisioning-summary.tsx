"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-provisioning-summary.tsx
//
// Panel de resumen antes de desplegar: muestra toda la configuración
// consolidada de la organización en modo solo lectura.
// ─────────────────────────────────────────────────────────────────

import type { ProvisioningConfiguration } from "../types/platform.types";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-zinc-800 break-all">{value ?? "—"}</p>
    </div>
  );
}

interface Props {
  config: ProvisioningConfiguration;
}

export function PlatformProvisioningSummary({ config }: Props) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-5">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
        Provisioning Summary
      </h2>

      {/* Organización */}
      <section>
        <h3 className="text-xs font-semibold text-zinc-500 mb-3">Organización</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Código"         value={config.organization_code} />
          <Field label="Nombre"         value={config.organization_name} />
          <Field label="Razón social"   value={config.legal_name} />
          <Field label="NIT"            value={config.nit} />
          <Field label="País"           value={config.country_code} />
          <Field label="Zona horaria"   value={config.timezone} />
        </div>
      </section>

      <hr className="border-zinc-100" />

      {/* Plan y Vertical */}
      <section>
        <h3 className="text-xs font-semibold text-zinc-500 mb-3">Plan y Vertical</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Vertical"       value={config.vertical ? `${config.vertical.code} — ${config.vertical.name}` : null} />
          <Field label="Plan"           value={config.plan ? `${config.plan.code} — ${config.plan.name}` : null} />
          <Field label="Ciclo billing"  value={config.billing_cycle} />
          <Field label="Licencia"       value={config.license_status} />
        </div>
      </section>

      <hr className="border-zinc-100" />

      {/* Módulos activos */}
      <section>
        <h3 className="text-xs font-semibold text-zinc-500 mb-3">
          Módulos activos ({config.active_modules.length})
        </h3>
        {config.active_modules.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">Sin módulos activos.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {config.active_modules.map((m) => (
              <span
                key={m.code}
                className="text-xs font-mono bg-zinc-100 text-zinc-700 px-2.5 py-1 rounded-md"
              >
                {m.code}
              </span>
            ))}
          </div>
        )}
      </section>

      <hr className="border-zinc-100" />

      {/* Branding */}
      <section>
        <h3 className="text-xs font-semibold text-zinc-500 mb-3">Branding</h3>
        {!config.branding ? (
          <p className="text-sm text-zinc-400 italic">Sin branding configurado.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-zinc-400 mb-0.5">Color primario</p>
              <div className="flex items-center gap-2">
                {config.branding.primary_color ? (
                  <>
                    <span
                      className="w-4 h-4 rounded-full border border-zinc-200"
                      style={{ backgroundColor: config.branding.primary_color }}
                    />
                    <span className="text-sm font-mono text-zinc-700">
                      {config.branding.primary_color}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-zinc-400">—</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-400 mb-0.5">Color secundario</p>
              <div className="flex items-center gap-2">
                {config.branding.secondary_color ? (
                  <>
                    <span
                      className="w-4 h-4 rounded-full border border-zinc-200"
                      style={{ backgroundColor: config.branding.secondary_color }}
                    />
                    <span className="text-sm font-mono text-zinc-700">
                      {config.branding.secondary_color}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-zinc-400">—</span>
                )}
              </div>
            </div>
            <Field label="Dominio personalizado" value={config.branding.custom_domain} />
            <Field label="Logo URL"  value={config.branding.logo_url} />
            <Field label="Favicon URL" value={config.branding.favicon_url} />
          </div>
        )}
      </section>

      <hr className="border-zinc-100" />

      {/* Despliegue */}
      <section>
        <h3 className="text-xs font-semibold text-zinc-500 mb-3">Configuración de despliegue</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tenant ID"            value={config.tenant_id} />
          <Field label="Instance Identifier"  value={config.instance_identifier} />
          <Field label="Deployment URL"       value={config.deployment_url} />
        </div>
      </section>
    </div>
  );
}
