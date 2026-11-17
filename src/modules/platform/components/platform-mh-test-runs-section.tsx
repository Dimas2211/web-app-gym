"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-mh-test-runs-section.tsx
//
// DTE-MH-TEST-RUNS — Organización → Onboarding fiscal → Pruebas de Hacienda.
// Solo ambiente TEST. Plan editable (cantidad y primer correlativo por tipo
// con rango visible), perfiles de receptor ingresados por el operador (sin
// valores inventados), validación previa (dry-run) antes de reservar
// números, seguimiento por ítem y decisiones explícitas del operador.
// No crea ventas, compras, clientes, proveedores, inventario ni caja.
// ─────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState, useTransition } from "react";
import { RefreshCw, Play, Pause, XCircle, FlaskConical } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-styles";
import {
  getMhTestRunPanelAction,
  previewMhTestRunAction,
  createMhTestRunAction,
  advanceMhTestRunNowAction,
  decideMhTestRunItemAction,
  setMhTestRunStatusAction,
  type MhTestRunPanelData,
} from "../actions/mh-test-run.action";
import { MH_TEST_RUN_CONFIRM_TEXT } from "../dte-onboarding/mh-test-runs/mh-test-run.flags";

const INPUT = "w-full h-8 px-2 text-xs border border-zinc-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40";
const LABEL = "block text-[11px] font-semibold text-zinc-600 mb-0.5";

type TypeCode = "01" | "03" | "05" | "11" | "14";
const TYPES: Array<{ code: TypeCode; label: string }> = [
  { code: "01", label: "FE 01" }, { code: "03", label: "CCFE 03" }, { code: "05", label: "NC 05" },
  { code: "11", label: "FEX 11 (servicios)" }, { code: "14", label: "FSE 14" },
];

type Str = Record<string, string>;
const emptyIdentified: Str = { idTypeCode: "13", documentNumber: "", name: "", email: "", phone: "", deptCode: "", municipalityCode: "", addressComplement: "" };
const emptyTaxpayer: Str = { nit: "", nrc: "", name: "", legalName: "", activityCode: "", activityName: "", deptCode: "", municipalityCode: "", addressComplement: "", phone: "", email: "" };
const emptyForeign: Str = { name: "", idTypeCode: "03", documentNumber: "", countryCode: "", addressComplement: "", activityName: "", personType: "2", email: "", phone: "" };
const emptyExcluded: Str = { idTypeCode: "13", documentNumber: "", name: "", activityCode: "", activityName: "", deptCode: "", municipalityCode: "", addressComplement: "", phone: "", email: "" };

const STEP_TONE: Record<string, string> = {
  ACCEPTED: "text-emerald-700", OBSERVED: "text-emerald-700", REJECTED: "text-red-600", FAILED: "text-red-600",
  NEEDS_REVIEW: "text-amber-700", UNCERTAIN: "text-amber-700", SKIPPED: "text-zinc-500", ABANDONED: "text-zinc-500",
};

function nullIfBlank(o: Str): Record<string, string | null> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()]));
}

function ProfileFields({ title, value, onChange, fields }: { title: string; value: Str; onChange: (v: Str) => void; fields: Array<[string, string]> }) {
  return (
    <fieldset className="border border-zinc-100 rounded-lg p-3">
      <legend className="text-[11px] font-semibold text-zinc-500 px-1">{title}</legend>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {fields.map(([k, label]) => (
          <div key={k}>
            <label className={LABEL}>{label}</label>
            <input className={INPUT} value={value[k] ?? ""} onChange={(e) => onChange({ ...value, [k]: e.target.value })} autoComplete="off" />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function PlatformMhTestRunsSection({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<MhTestRunPanelData | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [firsts, setFirsts] = useState<Partial<Record<TypeCode, string>>>({});
  const [invFe, setInvFe] = useState(0);
  const [invCcfe, setInvCcfe] = useState(0);
  const [identified, setIdentified] = useState<Str>(emptyIdentified);
  const [taxpayer, setTaxpayer] = useState<Str>(emptyTaxpayer);
  const [foreign, setForeign] = useState<Str>(emptyForeign);
  const [excluded, setExcluded] = useState<Str>(emptyExcluded);
  const [responsible, setResponsible] = useState<Str>({ name: "", docTypeCode: "13", documentNumber: "" });
  const [contingency, setContingency] = useState<Str>({ contingencyTypeCode: "1", reason: "" });
  const [preview, setPreview] = useState<{ ranges: Array<{ dteTypeCode: string; first: number; last: number; count: number }>; itemCount: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    start(async () => {
      const d = await getMhTestRunPanelAction(organizationId);
      setData(d);
      setFirsts((prev) => {
        const next = { ...prev };
        for (const t of TYPES) if (!next[t.code] && d.nextByType[t.code]) next[t.code] = String(d.nextByType[t.code]);
        return next;
      });
    });
  }, [organizationId]);

  const scenariosByType = useMemo(() => {
    const m = new Map<string, Array<{ code: string; label: string }>>();
    for (const s of data?.scenarios ?? []) m.set(s.dteTypeCode, [...(m.get(s.dteTypeCode) ?? []), { code: s.code, label: s.label }]);
    return m;
  }, [data]);

  const used = (code: string) => (counts[code] ?? 0) > 0;
  const needsIdentified = used("FE01_IDENTIFICADO");
  const needsTaxpayer = used("CCFE03_ESTANDAR") || used("NC05_SOBRE_CCFE") || used("CONT03_CCFE");
  const needsForeign = used("FEX11_SERVICIOS");
  const needsExcluded = used("FSE14_SERVICIOS");
  const needsContingency = used("CONT01_FE") || used("CONT03_CCFE");
  const needsResponsible = needsContingency || invFe > 0 || invCcfe > 0;

  function buildPlan() {
    const blocks = TYPES.map((t) => ({
      dteTypeCode: t.code,
      firstSequence: Number(firsts[t.code] ?? 0),
      scenarios: (scenariosByType.get(t.code) ?? []).map((s) => ({ scenarioCode: s.code, count: counts[s.code] ?? 0 })).filter((s) => s.count > 0),
    })).filter((b) => b.scenarios.length > 0);
    return {
      version: 1,
      blocks,
      invalidations: [
        ...(invFe > 0 ? [{ targetScenarioCode: "FE01_IDENTIFICADO", count: invFe }] : []),
        ...(invCcfe > 0 ? [{ targetScenarioCode: "CCFE03_ESTANDAR", count: invCcfe }] : []),
      ],
      receptors: {
        identified: needsIdentified ? nullIfBlank(identified) : null,
        taxpayer: needsTaxpayer ? nullIfBlank(taxpayer) : null,
        foreign: needsForeign ? nullIfBlank(foreign) : null,
        excludedSubject: needsExcluded ? nullIfBlank(excluded) : null,
      },
      responsible: needsResponsible ? { name: responsible.name.trim(), docTypeCode: responsible.docTypeCode, documentNumber: responsible.documentNumber.trim() } : null,
      contingency: needsContingency ? { contingencyTypeCode: contingency.contingencyTypeCode, reason: contingency.reason.trim() || null } : null,
    };
  }

  function act(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    start(async () => {
      const r = await fn();
      setMessage({ ok: r.ok, text: r.ok ? r.message ?? "Listo." : r.error ?? "Error." });
      const d = await getMhTestRunPanelAction(organizationId);
      setData(d);
    });
  }

  if (!data) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-zinc-500">
          Emite documentos de prueba en ambiente TEST con el motor DTE real (firma y transmisión a Hacienda TEST), sin ventas,
          compras, inventario, caja ni cuota comercial. Nunca se entregan a MariaDB ni aparecen en el Panel Fiscal del cliente.
        </p>
        <button type="button" onClick={load} disabled={pending} className={buttonClasses("outline", "sm")}>
          <FlaskConical size={14} /> Cargar pruebas de Hacienda
        </button>
      </div>
    );
  }

  const active = data.runs.find((r) => ["QUEUED", "RUNNING", "PAUSED", "NEEDS_REVIEW"].includes(r.status));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-semibold ${data.enabled ? "text-emerald-700" : "text-zinc-500"}`}>
          {data.enabled ? "Función habilitada (TEST)" : "Función deshabilitada (DTE_MH_TEST_RUNS_ENABLED)"}
        </span>
        <button type="button" onClick={load} disabled={pending} className={buttonClasses("ghost", "sm")}><RefreshCw size={14} /> Actualizar</button>
      </div>
      {data.error && <p className="text-xs text-red-600">{data.error}</p>}
      {message && <p className={`text-xs ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}

      {!active && data.enabled && data.issuer && (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="zv-table w-full text-[11px]">
              <thead><tr><th>Tipo</th><th>Primer correlativo</th><th>Escenarios (cantidad)</th><th>Siguiente disponible</th></tr></thead>
              <tbody>
                {TYPES.map((t) => (
                  <tr key={t.code}>
                    <td className="font-semibold whitespace-nowrap">{t.label}</td>
                    <td><input className={INPUT} inputMode="numeric" value={firsts[t.code] ?? ""} onChange={(e) => setFirsts({ ...firsts, [t.code]: e.target.value.replace(/\D/g, "") })} /></td>
                    <td className="space-y-1">
                      {(scenariosByType.get(t.code) ?? []).map((s) => (
                        <label key={s.code} className="flex items-center gap-2">
                          <input type="number" min={0} max={200} className={`${INPUT} w-16`} value={counts[s.code] ?? 0}
                            onChange={(e) => setCounts({ ...counts, [s.code]: Math.max(0, Number(e.target.value) || 0) })} />
                          <span>{s.label}</span>
                        </label>
                      ))}
                    </td>
                    <td className="text-zinc-500">{data.nextByType[t.code] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-2 max-w-md">
            <div><label className={LABEL}>Invalidaciones de FE 01 identificado</label><input type="number" min={0} className={INPUT} value={invFe} onChange={(e) => setInvFe(Math.max(0, Number(e.target.value) || 0))} /></div>
            <div><label className={LABEL}>Invalidaciones de CCFE 03 (sin NC)</label><input type="number" min={0} className={INPUT} value={invCcfe} onChange={(e) => setInvCcfe(Math.max(0, Number(e.target.value) || 0))} /></div>
          </div>

          {needsIdentified && <ProfileFields title="Receptor identificado (FE 01)" value={identified} onChange={setIdentified} fields={[["idTypeCode", "Tipo doc (13/36)"], ["documentNumber", "Número"], ["name", "Nombre"], ["email", "Correo"], ["phone", "Teléfono"], ["deptCode", "Depto"], ["municipalityCode", "Municipio"], ["addressComplement", "Dirección"]]} />}
          {needsTaxpayer && <ProfileFields title="Contribuyente (CCFE 03 / NC 05)" value={taxpayer} onChange={setTaxpayer} fields={[["nit", "NIT"], ["nrc", "NRC"], ["name", "Nombre"], ["legalName", "Nombre comercial"], ["activityCode", "Actividad (CAT-019)"], ["activityName", "Descripción actividad"], ["deptCode", "Depto"], ["municipalityCode", "Municipio"], ["addressComplement", "Dirección"], ["phone", "Teléfono"], ["email", "Correo"]]} />}
          {needsForeign && <ProfileFields title="Receptor extranjero (FEX 11)" value={foreign} onChange={setForeign} fields={[["name", "Nombre"], ["idTypeCode", "Tipo doc"], ["documentNumber", "Número"], ["countryCode", "País (CAT-020)"], ["addressComplement", "Dirección"], ["activityName", "Actividad"], ["personType", "Tipo persona (1/2)"], ["email", "Correo"], ["phone", "Teléfono"]]} />}
          {needsExcluded && <ProfileFields title="Sujeto excluido (FSE 14)" value={excluded} onChange={setExcluded} fields={[["idTypeCode", "Tipo doc"], ["documentNumber", "Número"], ["name", "Nombre"], ["activityCode", "Actividad"], ["activityName", "Descripción actividad"], ["deptCode", "Depto"], ["municipalityCode", "Municipio"], ["addressComplement", "Dirección"], ["phone", "Teléfono"], ["email", "Correo"]]} />}
          {needsResponsible && <ProfileFields title="Responsable de eventos" value={responsible} onChange={setResponsible} fields={[["name", "Nombre"], ["docTypeCode", "Tipo doc"], ["documentNumber", "Número"]]} />}
          {needsContingency && <ProfileFields title="Contingencia" value={contingency} onChange={setContingency} fields={[["contingencyTypeCode", "Tipo (CAT-005 1-5)"], ["reason", "Motivo (obligatorio si 5)"]]} />}

          <div className="flex gap-2 flex-wrap items-center">
            <button type="button" disabled={pending} className={buttonClasses("outline", "sm")}
              onClick={() => start(async () => {
                const r = await previewMhTestRunAction(organizationId, buildPlan());
                if (r.ok) { setPreview({ ranges: r.ranges, itemCount: r.itemCount }); setErrors([]); }
                else { setPreview(null); setErrors(r.errors); }
              })}>
              Validar plan (sin reservar)
            </button>
          </div>
          {errors.length > 0 && <ul className="text-xs text-red-600 list-disc pl-4 space-y-0.5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          {preview && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-600">
                {preview.itemCount} ítems. Rangos que se reservarán:{" "}
                {preview.ranges.map((r) => `${r.dteTypeCode}: ${r.first}–${r.last} (${r.count})`).join(" · ")}
              </p>
              <p className="text-xs text-amber-700">
                Al iniciar se reservan estos correlativos TEST y se firman y transmiten documentos reales a Hacienda TEST.
                Escriba “{MH_TEST_RUN_CONFIRM_TEXT}”.
              </p>
              <div className="flex gap-2 max-w-md">
                <input className={INPUT} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
                <button type="button" disabled={pending || confirm !== MH_TEST_RUN_CONFIRM_TEXT} className={buttonClasses("accent", "sm")}
                  onClick={() => { act(() => createMhTestRunAction(organizationId, buildPlan(), confirm)); setConfirm(""); setPreview(null); }}>
                  Iniciar pruebas
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {data.runs.map((run) => (
        <div key={run.id} className="border border-zinc-100 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold">Corrida {run.id.slice(0, 8)}</span>
            <span className={`text-xs ${STEP_TONE[run.status] ?? "text-zinc-600"}`}>{run.status}</span>
            <span className="text-[11px] text-zinc-400">{new Date(run.created_at).toLocaleString()}</span>
            {["QUEUED", "RUNNING"].includes(run.status) && (
              <button type="button" disabled={pending || !data.enabled} className={buttonClasses("ghost", "sm")} onClick={() => act(() => advanceMhTestRunNowAction(organizationId, run.id))}><Play size={13} /> Avanzar ahora</button>
            )}
            {["QUEUED", "RUNNING", "NEEDS_REVIEW"].includes(run.status) && (
              <button type="button" disabled={pending} className={buttonClasses("ghost", "sm")} onClick={() => act(() => setMhTestRunStatusAction(organizationId, run.id, "PAUSE"))}><Pause size={13} /> Pausar</button>
            )}
            {["PAUSED", "NEEDS_REVIEW"].includes(run.status) && (
              <button type="button" disabled={pending || !data.enabled} className={buttonClasses("ghost", "sm")} onClick={() => act(() => setMhTestRunStatusAction(organizationId, run.id, "RESUME"))}><Play size={13} /> Reanudar</button>
            )}
            {["QUEUED", "RUNNING", "PAUSED", "NEEDS_REVIEW"].includes(run.status) && (
              <button type="button" disabled={pending} className={buttonClasses("ghost", "sm")}
                onClick={() => { const c = window.prompt('Escriba "CANCELAR" para cancelar la corrida (los números reservados quedan consumidos).'); if (c) act(() => setMhTestRunStatusAction(organizationId, run.id, "CANCEL", c)); }}>
                <XCircle size={13} /> Cancelar
              </button>
            )}
          </div>
          {run.last_error && <p className="text-[11px] text-red-600">{run.last_error}</p>}
          <div className="overflow-x-auto">
            <table className="zv-table w-full text-[11px]">
              <thead><tr><th>#</th><th>Escenario</th><th>Número de control</th><th>Paso</th><th>MH</th><th>Detalle</th><th>Decisión</th></tr></thead>
              <tbody>
                {run.items.map((it) => {
                  const canDecide = ["NEEDS_REVIEW", "UNCERTAIN", "FAILED"].includes(it.step) && data.enabled;
                  return (
                    <tr key={it.id}>
                      <td>{it.seq}</td>
                      <td className="whitespace-nowrap">{it.scenario_code}</td>
                      <td className="font-mono">{it.control_number ?? "—"}</td>
                      <td className={STEP_TONE[it.step] ?? ""}>{it.step}</td>
                      <td>{it.mh_estado ?? (it.reception_stamp ? "sello" : "—")}</td>
                      <td className="max-w-[260px] truncate" title={it.last_error_message ?? ""}>{it.last_error_code ? `${it.last_error_code}: ${it.last_error_message ?? ""}` : ""}</td>
                      <td>
                        {canDecide && (
                          <div className="flex gap-1 items-center">
                            <input className={`${INPUT} w-36`} placeholder="Nota (≥10)" value={notes[it.id] ?? ""} onChange={(e) => setNotes({ ...notes, [it.id]: e.target.value })} />
                            {it.step !== "FAILED" && <button type="button" disabled={pending} className={buttonClasses("outline", "sm")} onClick={() => act(() => decideMhTestRunItemAction(organizationId, run.id, it.id, "RETRANSMIT_SAME", notes[it.id] ?? ""))}>Retransmitir mismo</button>}
                            {it.step === "FAILED" && <button type="button" disabled={pending} className={buttonClasses("outline", "sm")} onClick={() => act(() => decideMhTestRunItemAction(organizationId, run.id, it.id, "RETRY_STEP", notes[it.id] ?? ""))}>Reintentar paso</button>}
                            <button type="button" disabled={pending} className={buttonClasses("ghost", "sm")} onClick={() => act(() => decideMhTestRunItemAction(organizationId, run.id, it.id, "ABANDON", notes[it.id] ?? ""))}>Abandonar</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
