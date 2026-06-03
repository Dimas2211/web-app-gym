"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-organization-detail.tsx
//
// Encabezado + info general de una organización.
// Incluye botón para cambiar estado y botón de edición completa.
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import Link         from "next/link";
import { ArrowLeft, RefreshCw, Pencil } from "lucide-react";

import { ChangeOrganizationStatusDialog }    from "./change-organization-status-dialog";
import { PlatformOrganizationEditForm }      from "./platform-organization-edit-form";
import type {
  PlatformOrganizationDetail,
  PlatformOrganizationStatus,
  PlatformLicenseStatus,
  PlatformVerticalItem,
  PlatformPlanItem,
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

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
      <p className="text-sm text-zinc-800 font-medium break-all">{value ?? "—"}</p>
    </div>
  );
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-SV", {
    year:  "numeric",
    month: "long",
    day:   "numeric",
  });
}

interface Props {
  org:       PlatformOrganizationDetail;
  verticals: PlatformVerticalItem[];
  plans:     PlatformPlanItem[];
}

export function PlatformOrganizationDetail({ org, verticals, plans }: Props) {
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showEditForm, setShowEditForm]         = useState(false);

  return (
    <div className="space-y-5">

      {/* Navegación */}
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/platform/organizations"
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <ArrowLeft size={15} />
          Organizaciones
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-sm font-medium text-zinc-700">{org.name}</span>
      </div>

      {/* Encabezado */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-zinc-800">{org.name}</h1>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${ORG_STATUS_COLORS[org.status]}`}>
                {org.status}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${LICENSE_COLORS[org.license_status]}`}>
                {org.license_status}
              </span>
            </div>
            {org.legal_name && (
              <p className="text-sm text-zinc-500 mt-0.5">{org.legal_name}</p>
            )}
            <p className="text-xs font-mono text-zinc-400 mt-1">
              Código: {org.code}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEditForm(true)}
              className="flex items-center gap-2 text-sm font-semibold text-zinc-600 border border-zinc-200 px-3 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              <Pencil size={14} />
              Editar
            </button>
            <button
              type="button"
              onClick={() => setShowStatusDialog(true)}
              className="flex items-center gap-2 text-sm font-semibold text-zinc-600 border border-zinc-200 px-3 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              <RefreshCw size={14} />
              Estado
            </button>
          </div>
        </div>
      </div>

      {/* Información general */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
          Información general
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
          <InfoField label="NIT"              value={org.nit} />
          <InfoField label="Tenant ID"        value={org.tenant_id} />
          <InfoField label="Dominio"          value={org.domain} />
          <InfoField label="País"             value={org.country_code} />
          <InfoField label="Zona horaria"     value={org.timezone} />
          <InfoField label="Ciclo de facturación" value={org.billing_cycle} />
          <InfoField label="Vertical"         value={org.vertical?.name} />
          <InfoField label="Plan"             value={org.plan?.name} />
        </div>
      </div>

      {/* Información de licencia */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
          Licencia y fechas
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
          <InfoField label="Trial hasta"         value={formatDate(org.trial_ends_at)} />
          <InfoField label="Licencia vence"      value={formatDate(org.license_expires_at)} />
          <InfoField label="Creada"              value={formatDate(org.created_at)} />
          <InfoField label="Última actualización" value={formatDate(org.updated_at)} />
        </div>
      </div>

      {/* Diálogos */}
      {showStatusDialog && (
        <ChangeOrganizationStatusDialog
          orgId={org.id}
          currentStatus={org.status}
          orgName={org.name}
          onClose={() => setShowStatusDialog(false)}
        />
      )}
      {showEditForm && (
        <PlatformOrganizationEditForm
          org={org}
          verticals={verticals}
          plans={plans}
          onClose={() => setShowEditForm(false)}
        />
      )}
    </div>
  );
}
