"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-organization-entitlements-panel.tsx (Bloque A)
//
// Muestra los límites/capacidades EFECTIVOS de una organización
// (plan + overrides) y permite editar el override por entitlement.
// Solo administración comercial — NO aplica enforcement de runtime.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";

import { setOrganizationEntitlementOverrideAction } from "../actions/set-organization-entitlement-override.action";
import type { EffectiveEntitlement } from "../types/platform.types";

interface Props {
  organizationId: string;
  entitlements:   EffectiveEntitlement[];
  planName:       string | null;
}

const SOURCE_LABELS: Record<EffectiveEntitlement["source"], string> = {
  PLAN:                   "Origen: plan",
  ORGANIZATION_OVERRIDE:  "Origen: override organización",
  UNCONFIGURED:           "Sin configurar",
};

function fmtValue(e: EffectiveEntitlement): string {
  if (e.source === "UNCONFIGURED") return "—";
  if (e.is_unlimited) return "Ilimitado";
  return e.numeric_value === null ? "—" : String(e.numeric_value);
}

function EditRow({ organizationId, entitlement, onDone }: {
  organizationId: string;
  entitlement:    EffectiveEntitlement;
  onDone:         () => void;
}) {
  const [numericValue, setNumericValue] = useState(
    entitlement.is_unlimited || entitlement.numeric_value === null ? "" : String(entitlement.numeric_value),
  );
  const [isUnlimited, setIsUnlimited] = useState(entitlement.is_unlimited && entitlement.source === "ORGANIZATION_OVERRIDE");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(clear: boolean) {
    setError(null);
    const fd = new FormData();
    fd.set("organization_id", organizationId);
    fd.set("entitlement_definition_id", entitlement.entitlement_definition_id);
    fd.set("clear", clear ? "true" : "false");
    fd.set("is_unlimited", isUnlimited ? "true" : "false");
    if (numericValue) fd.set("numeric_value", numericValue);

    startTransition(async () => {
      const result = await setOrganizationEntitlementOverrideAction(undefined, fd);
      if (result?.error) { setError(result.error); return; }
      onDone();
    });
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50">
      <input
        type="number" min="0" placeholder="Valor"
        disabled={isUnlimited}
        value={numericValue}
        onChange={(e) => setNumericValue(e.target.value)}
        className="w-24 h-8 px-2 text-sm border border-zinc-200 rounded-lg disabled:bg-zinc-100"
      />
      <label className="flex items-center gap-1 text-xs text-zinc-600">
        <input type="checkbox" checked={isUnlimited} onChange={(e) => setIsUnlimited(e.target.checked)} className="accent-zinc-900" />
        Ilimitado
      </label>
      <button type="button" disabled={isPending} onClick={() => submit(false)}
        className="text-xs font-semibold px-2 py-1 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50">
        Guardar override
      </button>
      {entitlement.source === "ORGANIZATION_OVERRIDE" && (
        <button type="button" disabled={isPending} onClick={() => submit(true)}
          className="text-xs font-semibold px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">
          Quitar override
        </button>
      )}
      <button type="button" onClick={onDone} className="text-zinc-400 hover:text-zinc-700 ml-auto">
        <X size={14} />
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function PlatformOrganizationEntitlementsPanel({ organizationId, entitlements, planName }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Límites / capacidades efectivas
        </h2>
        <p className="text-[11px] text-zinc-400 mt-0.5">
          Plan asignado: {planName ?? "Sin plan"}. Los overrides no se copian automáticamente del plan — solo aplican como excepción.
        </p>
      </div>

      <div className="divide-y divide-zinc-100">
        {entitlements.length === 0 && (
          <p className="text-sm text-zinc-400 px-5 py-6 text-center">No hay entitlements en el catálogo.</p>
        )}
        {entitlements.map((e) => (
          <div key={e.entitlement_definition_id}>
            <div className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-zinc-800">{e.name}</p>
                <p className="text-[11px] font-mono text-zinc-400">{e.code}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-zinc-800">{fmtValue(e)}</p>
                <p className="text-[11px] text-zinc-400">{SOURCE_LABELS[e.source]}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingId(editingId === e.entitlement_definition_id ? null : e.entitlement_definition_id)}
                className="ml-4 text-zinc-400 hover:text-zinc-700"
                title="Editar override"
              >
                <Pencil size={14} />
              </button>
            </div>
            {editingId === e.entitlement_definition_id && (
              <EditRow organizationId={organizationId} entitlement={e} onDone={() => setEditingId(null)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
