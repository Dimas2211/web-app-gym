"use client";

import { useActionState, useMemo, useState } from "react";
import { X } from "lucide-react";

import { createPlatformPlanAction } from "../actions/create-platform-plan.action";
import { updatePlatformPlanAction } from "../actions/update-platform-plan.action";
import type {
  PlatformPlanItem,
  PlatformModuleItem,
  PlatformModuleCategory,
  PlatformEntitlementDefinitionItem,
} from "../types/platform.types";

interface Props {
  plan?:                    PlatformPlanItem;
  allModules:                PlatformModuleItem[];
  entitlementDefinitions:   PlatformEntitlementDefinitionItem[];
  onClose:                  () => void;
}

const BILLING_OPTIONS = [
  { value: "MONTHLY",  label: "Mensual" },
  { value: "ANNUAL",   label: "Anual" },
  { value: "LIFETIME", label: "De por vida" },
  { value: "NONE",     label: "Sin facturación" },
] as const;

const CATEGORY_LABELS: Record<PlatformModuleCategory, string> = {
  CORE:        "Core",
  COMMERCE:    "Commerce",
  VERTICAL:    "Vertical",
  INTEGRATION: "Integración",
};

const CATEGORY_ORDER: PlatformModuleCategory[] = ["CORE", "COMMERCE", "VERTICAL", "INTEGRATION"];

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-600 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
    </div>
  );
}

const inputCls = "w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900";

// Estado local del entitlement en edición dentro del form.
interface EntitlementDraft {
  numeric_value: string;   // string controlado del input numérico
  is_unlimited:  boolean;
  configured:    boolean;  // false = no se envía (queda UNCONFIGURED para el plan)
}

export function PlatformPlanFormDialog({ plan, allModules, entitlementDefinitions, onClose }: Props) {
  const isEdit = !!plan;
  const action = isEdit ? updatePlatformPlanAction : createPlatformPlanAction;

  const [state, formAction, isPending] = useActionState(action, undefined);

  const initialModuleIds = useMemo(
    () => new Set((plan?.modules ?? []).filter((m) => m.is_enabled).map((m) => m.module_id)),
    [plan],
  );
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<string>>(initialModuleIds);

  const initialEntitlements = useMemo(() => {
    const map = new Map<string, EntitlementDraft>();
    for (const def of entitlementDefinitions) {
      const existing = plan?.entitlements.find((e) => e.entitlement_definition_id === def.id);
      map.set(def.id, {
        numeric_value: existing && !existing.is_unlimited && existing.numeric_value !== null ? String(existing.numeric_value) : "",
        is_unlimited:  existing?.is_unlimited ?? false,
        configured:    Boolean(existing),
      });
    }
    return map;
  }, [plan, entitlementDefinitions]);
  const [entitlementDrafts, setEntitlementDrafts] = useState<Map<string, EntitlementDraft>>(initialEntitlements);

  function toggleModule(moduleId: string) {
    setSelectedModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId); else next.add(moduleId);
      return next;
    });
  }

  function updateEntitlement(defId: string, patch: Partial<EntitlementDraft>) {
    setEntitlementDrafts((prev) => {
      const next = new Map(prev);
      const current = next.get(defId) ?? { numeric_value: "", is_unlimited: false, configured: false };
      next.set(defId, { ...current, ...patch, configured: true });
      return next;
    });
  }

  // Bloque A (ajuste post-cierre) — espejo entitlement → legacy. Si el
  // plan tiene configurado core.users.max / core.locations.max, ese
  // valor manda: el campo legacy se muestra bloqueado y sincronizado
  // (el server también lo re-deriva al guardar, ver legacy-plan-limits.ts).
  // Sin ese entitlement configurado, el campo legacy sigue siendo editable
  // normalmente (modo "solo legacy", compatibilidad).
  const usersDef     = entitlementDefinitions.find((d) => d.code === "core.users.max");
  const locationsDef = entitlementDefinitions.find((d) => d.code === "core.locations.max");
  const usersDraft     = usersDef     ? entitlementDrafts.get(usersDef.id)     : undefined;
  const locationsDraft = locationsDef ? entitlementDrafts.get(locationsDef.id) : undefined;
  const usersSynced     = Boolean(usersDraft?.configured);
  const locationsSynced = Boolean(locationsDraft?.configured);
  const syncedMaxUsersValue     = usersDraft?.is_unlimited     ? "Ilimitado" : usersDraft?.numeric_value     ?? "";
  const syncedMaxLocationsValue = locationsDraft?.is_unlimited ? "Ilimitado" : locationsDraft?.numeric_value ?? "";

  const modulesJson = JSON.stringify(
    Array.from(selectedModuleIds).map((module_id) => ({ module_id, is_enabled: true })),
  );

  const entitlementsJson = JSON.stringify(
    Array.from(entitlementDrafts.entries())
      .filter(([, d]) => d.configured && (d.is_unlimited || d.numeric_value.trim() !== ""))
      .map(([entitlement_definition_id, d]) => ({
        entitlement_definition_id,
        is_unlimited:  d.is_unlimited,
        numeric_value: d.is_unlimited ? null : Number(d.numeric_value),
      })),
  );

  const byCategory = CATEGORY_ORDER
    .map((cat) => ({ cat, modules: allModules.filter((m) => m.category === cat) }))
    .filter((g) => g.modules.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <h2 className="text-base font-bold text-zinc-800">
            {isEdit ? "Editar plan" : "Nuevo plan"}
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            <X size={18} />
          </button>
        </div>

        <form action={formAction} className="p-5 space-y-6">
          {state?.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {state.error}
            </div>
          )}

          {isEdit && <input type="hidden" name="id" value={plan.id} />}
          <input type="hidden" name="modules_json" value={modulesJson} />
          <input type="hidden" name="entitlements_json" value={entitlementsJson} />

          {/* ── Datos generales ── */}
          <div>
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">Datos generales</h3>
            <div className="grid grid-cols-2 gap-4">
              {!isEdit && (
                <div className="col-span-2">
                  <Field label="Código *" error={state?.errors?.code?.[0]}>
                    <input name="code" type="text" placeholder="ej: commerce-standard" className={inputCls} />
                  </Field>
                </div>
              )}

              <div className="col-span-2">
                <Field label="Nombre *" error={state?.errors?.name?.[0]}>
                  <input name="name" type="text" defaultValue={plan?.name} placeholder="Nombre del plan" className={inputCls} />
                </Field>
              </div>

              <div className="col-span-2">
                <Field label="Descripción" error={state?.errors?.description?.[0]}>
                  <textarea
                    name="description"
                    defaultValue={plan?.description ?? ""}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
                  />
                </Field>
              </div>

              <Field label="Ciclo de facturación" error={state?.errors?.billing_cycle?.[0]}>
                <select name="billing_cycle" defaultValue={plan?.billing_cycle ?? "MONTHLY"} className={`${inputCls} bg-white`}>
                  {BILLING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>

              <div />

              <Field label="Precio mensual (USD)" error={state?.errors?.price_monthly?.[0]}>
                <input name="price_monthly" type="number" step="0.01" min="0"
                  defaultValue={plan?.price_monthly ?? ""} placeholder="0.00" className={inputCls} />
              </Field>

              <Field label="Precio anual (USD)" error={state?.errors?.price_annual?.[0]}>
                <input name="price_annual" type="number" step="0.01" min="0"
                  defaultValue={plan?.price_annual ?? ""} placeholder="0.00" className={inputCls} />
              </Field>

              <Field label="Máx. ubicaciones (legacy)" error={state?.errors?.max_locations?.[0]}>
                {locationsSynced ? (
                  <input type="text" readOnly disabled value={syncedMaxLocationsValue}
                    className={`${inputCls} bg-zinc-100 text-zinc-400`} />
                ) : (
                  <input name="max_locations" type="number" min="1"
                    defaultValue={plan?.max_locations ?? ""} placeholder="Sin límite" className={inputCls} />
                )}
              </Field>

              <Field label="Máx. usuarios (legacy)" error={state?.errors?.max_users?.[0]}>
                {usersSynced ? (
                  <input type="text" readOnly disabled value={syncedMaxUsersValue}
                    className={`${inputCls} bg-zinc-100 text-zinc-400`} />
                ) : (
                  <input name="max_users" type="number" min="1"
                    defaultValue={plan?.max_users ?? ""} placeholder="Sin límite" className={inputCls} />
                )}
              </Field>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">
              &quot;Máx. ubicaciones/usuarios&quot; son campos legacy que se mantienen por compatibilidad.
              Si configura <code>core.locations.max</code> / <code>core.users.max</code> abajo, ese valor
              manda y el campo legacy se sincroniza automáticamente (bloqueado aquí) — nunca quedan como
              dos fuentes independientes.
            </p>
          </div>

          {/* ── Módulos incluidos ── */}
          <div>
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">Módulos incluidos</h3>
            <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-100">
              {byCategory.map(({ cat, modules }) => (
                <div key={cat}>
                  <div className="px-3 py-1.5 bg-zinc-50 text-[11px] font-bold text-zinc-500 uppercase tracking-wide">
                    {CATEGORY_LABELS[cat]}
                  </div>
                  <div className="divide-y divide-zinc-50">
                    {modules.map((m) => (
                      <label key={m.id} className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedModuleIds.has(m.id)}
                          onChange={() => toggleModule(m.id)}
                          className="accent-zinc-900"
                        />
                        <span className="text-zinc-700">{m.name}</span>
                        <span className="font-mono text-[11px] text-zinc-400">{m.code}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Límites / capacidades ── */}
          <div>
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">Límites / capacidades</h3>
            {entitlementDefinitions.length === 0 ? (
              <p className="text-sm text-zinc-400">No hay entitlements activos en el catálogo.</p>
            ) : (
              <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-100">
                {entitlementDefinitions.map((def) => {
                  const draft = entitlementDrafts.get(def.id) ?? { numeric_value: "", is_unlimited: false, configured: false };
                  return (
                    <div key={def.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-700">{def.name}</p>
                        <p className="font-mono text-[11px] text-zinc-400">
                          {def.code} · {def.period_type === "MONTHLY" ? "mensual" : "sin período"}
                        </p>
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="Sin configurar"
                        disabled={draft.is_unlimited}
                        value={draft.numeric_value}
                        onChange={(e) => updateEntitlement(def.id, { numeric_value: e.target.value })}
                        className="w-32 h-8 px-2 text-sm border border-zinc-200 rounded-lg disabled:bg-zinc-100 disabled:text-zinc-400"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-zinc-600 shrink-0">
                        <input
                          type="checkbox"
                          checked={draft.is_unlimited}
                          onChange={(e) => updateEntitlement(def.id, { is_unlimited: e.target.checked, numeric_value: "" })}
                          className="accent-zinc-900"
                        />
                        Ilimitado
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={isPending}
              className="px-4 py-2 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50">
              {isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
