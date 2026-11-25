"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-mh-test-profile-panel.tsx
//
// MH20 (Fase 8) — dentro del onboarding fiscal existente (no es un panel
// nuevo): selección del perfil normativo de la corrida, readiness por
// escenario (READY/BLOCKED con su causa), preset configurable MF 2.0 y
// vista de la cadena de corridas de ≤ 200 ítems. Solo prepara el plan;
// la validación previa y la creación siguen en la sección existente.
// Una validación local NUNCA se presenta como aceptación de Hacienda.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { buttonClasses } from "@/components/ui/button-styles";
import {
  previewMhTestPresetAction,
  type MhTestPresetResult,
  type MhTestRunPanelData,
} from "../actions/mh-test-run.action";
import type { MhTestChainSegment, MhTestDocKind } from "../dte-onboarding/mh-test-runs/mh-test-minimums";

const DOC_KINDS: Array<{ kind: MhTestDocKind; label: string }> = [
  { kind: "FE", label: "FE" }, { kind: "CCF", label: "CCF" }, { kind: "NC", label: "NC" },
  { kind: "FEX", label: "FEX (servicios)" }, { kind: "FSE", label: "FSE" },
];
const PRESET: Record<MhTestDocKind, number> = { FE: 90, CCF: 75, NC: 50, FEX: 90, FSE: 25 };

export type MhTestProfile = "MH_1_2" | "MH_2_0";

export function PlatformMhTestProfilePanel(props: {
  data:            MhTestRunPanelData;
  profile:         MhTestProfile;
  onProfileChange: (p: MhTestProfile) => void;
  firsts:          Partial<Record<"01" | "03" | "05" | "11" | "14", string>>;
  onApplySegment:  (segment: MhTestChainSegment, chainId: string) => void;
}) {
  const { data, profile } = props;
  const [pending, start] = useTransition();
  const [applicable, setApplicable] = useState<Record<MhTestDocKind, boolean>>({ FE: true, CCF: true, NC: true, FEX: false, FSE: false });
  const [qty, setQty] = useState<Record<MhTestDocKind, number>>(PRESET);
  const [events, setEvents] = useState(5);
  const [result, setResult] = useState<MhTestPresetResult | null>(null);
  const [chainId, setChainId] = useState<string>("");
  const readiness = data.readiness[profile];

  function calc() {
    start(async () => {
      const firstSequenceByType = Object.fromEntries(
        Object.entries(props.firsts).filter(([, v]) => v).map(([k, v]) => [k, Number(v)]),
      );
      const r = await previewMhTestPresetAction({
        profile,
        applicableDocs: DOC_KINDS.filter((d) => applicable[d.kind]).map((d) => d.kind),
        quantities: qty, eventsPerApplicable: events, firstSequenceByType,
      });
      setResult(r);
      setChainId(`chain-${Date.now().toString(36)}`);
    });
  }

  return (
    <fieldset className="border border-zinc-100 rounded-lg p-3 space-y-3" data-testid="mh-test-profile-panel">
      <legend className="text-[11px] font-semibold text-zinc-500 px-1">Perfil normativo y preset de la corrida</legend>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <label className="font-semibold text-zinc-600" htmlFor="mh-test-profile">Perfil</label>
        <select id="mh-test-profile" className="h-8 px-2 text-xs border border-zinc-200 rounded-md" value={profile}
          onChange={(e) => { props.onProfileChange(e.target.value === "MH_2_0" ? "MH_2_0" : "MH_1_2"); setResult(null); }}>
          <option value="MH_1_2">MH 1.2 (vigente)</option>
          <option value="MH_2_0">{data.mh20Gate.length === 0 ? "MH 2.0 (TEST, habilitado)" : "MH 2.0 (solo validación previa)"}</option>
        </select>
        {profile === "MH_2_0" && (
          <span className="text-amber-700">
            {data.mh20Gate.length === 0
              ? "MH 2.0 habilitado para esta organización solo en TEST. Una validación local no equivale a aceptación de Hacienda."
              : "Con MH 2.0 solo se ejecuta la validación local (dry-run). No se reservan correlativos, no se transmite nada y una validación local no equivale a aceptación de Hacienda."}
          </span>
        )}
        {!data.m4Applied && <span className="text-zinc-500">· Cadenas y perfil persistido requieren M4 en el Control Plane.</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="zv-table w-full text-[11px]">
          <thead><tr><th>Escenario</th><th>Versión</th><th>Estado</th><th>Depende de</th><th>Bloqueo</th></tr></thead>
          <tbody>
            {readiness.map((r) => (
              <tr key={r.kind}>
                <td className="whitespace-nowrap">{r.label}</td>
                <td>{r.version ? `v${r.version}` : "—"}</td>
                <td className={r.status === "READY" ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>{r.status}</td>
                <td>{r.dependsOn.join(", ") || "—"}</td>
                <td className="text-zinc-500">{r.blocker ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 items-end text-xs">
        {DOC_KINDS.map((d) => (
          <label key={d.kind} className="flex items-center gap-1">
            <input type="checkbox" checked={applicable[d.kind]} onChange={(e) => setApplicable({ ...applicable, [d.kind]: e.target.checked })} />
            <span>{d.label}</span>
            <input type="number" min={0} className="w-16 h-7 px-1 border border-zinc-200 rounded" value={qty[d.kind]}
              onChange={(e) => setQty({ ...qty, [d.kind]: Math.max(0, Number(e.target.value) || 0) })} disabled={!applicable[d.kind]} />
          </label>
        ))}
        <label className="flex items-center gap-1">
          <span>Eventos por evento aplicable</span>
          <input type="number" min={0} className="w-14 h-7 px-1 border border-zinc-200 rounded" value={events} onChange={(e) => setEvents(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <button type="button" className={buttonClasses("outline", "sm")} disabled={pending} onClick={calc}>Calcular preset y cadena</button>
      </div>

      {result && !result.ok && <ul className="text-xs text-red-600 list-disc pl-4">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {result?.quantities && result.quantities.blockedEvents.length > 0 && (
        <ul className="text-xs text-amber-700 list-disc pl-4">
          {result.quantities.blockedEvents.map((b) => <li key={b.kind}>{b.kind}: {b.requested} solicitados — {b.blocker}</li>)}
        </ul>
      )}
      {result?.ok && (
        <div className="space-y-1 text-xs">
          <p className="text-zinc-600">
            {result.segments.length} corrida(s) encadenada(s). Cada una se crea al terminar la anterior; sin números repetidos ni huecos.
          </p>
          <ul className="space-y-1">
            {result.segments.map((s) => (
              <li key={s.index} className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">Corrida {s.index}/{s.total}</span>
                <span className="text-zinc-500">
                  {s.itemCount} ítems · {s.blocks.map((b) => `${b.dteTypeCode}: ${b.firstSequence}–${b.firstSequence + b.scenarios.reduce((a, x) => a + x.count, 0) - 1}`).join(" · ")}
                  {s.invalidations.length > 0 && ` · invalidaciones ${s.invalidations.reduce((a, x) => a + x.count, 0)}`}
                </span>
                <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => props.onApplySegment(s, chainId)}>Cargar en el plan</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  );
}
