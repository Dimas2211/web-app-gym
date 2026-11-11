"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-fiscal-onboarding-panel.tsx
//
// FISCAL-ONBOARDING — panel único en el detalle de la organización:
// Configuración fiscal → Firmador → MariaDB opcional → Verificaciones →
// Activación. Carga el estado bajo demanda (lee el runtime del cliente)
// para no ralentizar la página. Nunca recibe ni muestra secretos.
// ─────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState, useTransition } from "react";
import { CheckCircle2, Circle, AlertTriangle, XCircle, MinusCircle, ShieldCheck, RefreshCw } from "lucide-react";

import { buttonClasses } from "@/components/ui/button-styles";
import {
  getFiscalOnboardingStatusAction,
  saveSignerSpecAction,
  runSignerProvisioningAction,
  registerSignerCredentialAction,
  confirmMhAuthorizationAction,
  saveMariaDbIntegrationAction,
  testMariaDbIntegrationAction,
  setMariaDbFlagsAction,
  listDeliveryJobsAction,
  processDeliveryOutboxAction,
  reconcileDeliveryJobAction,
  activateFiscalEnvironmentAction,
  type DeliveryJobRow,
} from "../actions/fiscal-onboarding.action";
import type { FiscalOnboardingStatus, OnboardingStepStatus } from "../dte-onboarding/fiscal-onboarding-status.service";
import type { SignerProvisioningMode, SignerProvisioningRunResult } from "../dte-onboarding/signer-provisioning.service";
import { presentSignerState, type Tone } from "../dte-onboarding/signer-provisioning.presenter";

const TONE: Record<Tone, string> = { ok: "text-emerald-700", warning: "text-amber-700", error: "text-red-600", neutral: "text-zinc-500" };

type Env = "TEST" | "PRODUCTION";

const INPUT = "w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40";
const LABEL = "block text-xs font-semibold text-zinc-600 mb-1";

function StepIcon({ status }: { status: OnboardingStepStatus }) {
  if (status === "done") return <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />;
  if (status === "blocked") return <XCircle size={16} className="text-red-600 shrink-0" />;
  if (status === "warning") return <AlertTriangle size={16} className="text-amber-500 shrink-0" />;
  if (status === "optional") return <MinusCircle size={16} className="text-zinc-400 shrink-0" />;
  return <Circle size={16} className="text-zinc-300 shrink-0" />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-zinc-100 px-5 py-4 space-y-3">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Feedback({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`text-xs rounded-lg px-3 py-2 border ${msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
      {msg.text}
    </div>
  );
}

export function PlatformFiscalOnboardingPanel({ organizationId }: { organizationId: string }) {
  const [env, setEnv] = useState<Env>("TEST");
  const [status, setStatus] = useState<FiscalOnboardingStatus | null>(null);
  const [jobs, setJobs] = useState<DeliveryJobRow[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastRun, setLastRun] = useState<SignerProvisioningRunResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Formularios
  const [spec, setSpec] = useState({ slug: "", hostname: "", cpanelUser: "", signerNit: "", issuerConfigId: "", preferredPort: "" });
  const [applyConfirm, setApplyConfirm] = useState("");
  const [rollbackRunId, setRollbackRunId] = useState("");
  const [rollbackConfirm, setRollbackConfirm] = useState("");
  const [mdb, setMdb] = useState({ host: "", port: "3306", database: "", table: "", invalidationTable: "", user: "", password: "" });
  const [mhRef, setMhRef] = useState("");
  const [activateConfirm, setActivateConfirm] = useState("");

  const load = useCallback((probe = false) => {
    startTransition(async () => {
      const res = await getFiscalOnboardingStatusAction(organizationId, env, probe);
      if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
      setStatus(res.status);
      const s = res.status.signer;
      setSpec({
        slug: s.slug ?? "", hostname: s.hostname ?? "", cpanelUser: s.cpanel_user ?? "", signerNit: s.signer_nit ?? "",
        issuerConfigId: s.issuer_config_id ?? res.status.runtime.issuer?.id ?? "", preferredPort: s.port ? String(s.port) : "",
      });
      const m = res.status.mariadb;
      setMdb({
        host: m.host ?? "", port: String(m.port ?? 3306), database: m.database ?? "", table: m.table ?? "",
        invalidationTable: m.invalidation_table ?? "", user: m.user ?? "", password: "",
      });
      setJobs(await listDeliveryJobsAction(organizationId));
    });
  }, [organizationId, env]);

  useEffect(() => { load(false); }, [load]);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, reload = true) => {
    startTransition(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Listo.") : (r.error ?? "Error.") });
      if (reload) load(false);
    });
  };

  const runMode = (mode: SignerProvisioningMode, opts: { confirm?: string; rollbackRunId?: string } = {}) => {
    startTransition(async () => {
      const r = await runSignerProvisioningAction(organizationId, env, mode, opts);
      setLastRun(r);
      setMsg({ ok: r.ok, text: r.ok ? `${mode} completado · estado del aprovisionamiento: ${r.status ?? "—"}.` : `${mode}: ${r.error ?? r.code ?? "falló"}` });
      load(false);
    });
  };

  const s = status?.signer;
  const sp = s?.exists ? presentSignerState(s) : null;
  const resourceId = s?.resource_id ?? "";
  const applyRuns = (s?.recent_runs ?? []).filter((r) => r.mode === "APPLY");

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 flex flex-wrap items-center gap-3">
        <ShieldCheck size={16} className="text-zinc-400" />
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Onboarding fiscal DTE</h2>
        <div className="flex gap-1 ml-auto">
          {(["TEST", "PRODUCTION"] as const).map((e) => (
            <button key={e} type="button" onClick={() => { setEnv(e); setLastRun(null); setMsg(null); }}
              className={buttonClasses(env === e ? "primary" : "outline", "sm")}>
              {e === "TEST" ? "Pruebas (TEST)" : "Producción"}
            </button>
          ))}
          <button type="button" onClick={() => load(env === "PRODUCTION")} disabled={pending} className={buttonClasses("ghost", "sm")}>
            <RefreshCw size={14} /> {env === "PRODUCTION" ? "Verificar PRODUCCIÓN" : "Actualizar"}
          </button>
        </div>
      </div>

      <div className="px-5 py-3 space-y-2">
        {pending && !status && <p className="text-sm text-zinc-400">Cargando estado…</p>}
        {status && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-dark">Estado {env}:</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status.readyTest || status.readyProd ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-700"}`}>
              {status.state}
            </span>
            {env === "TEST" && !status.readyTest && <span className="text-xs text-zinc-500">TEST aún no listo.</span>}
            {env === "PRODUCTION" && !status.readyProd && <span className="text-xs text-red-600">PRODUCCIÓN bloqueada ({status.blockers.length} bloqueo/s).</span>}
          </div>
        )}
        <Feedback msg={msg} />
      </div>

      {status && (
        <>
          <Section title="Verificaciones">
            <ul className="space-y-1.5">
              {status.steps.map((st) => (
                <li key={st.code} className="flex items-start gap-2 text-sm">
                  <StepIcon status={st.status} />
                  <div>
                    <span className="text-zinc-800">{st.label}</span>
                    {st.detail && <p className="text-xs text-zinc-500 break-words">{st.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={`Firmador ${env}`}>
            <div className="text-xs text-zinc-600 flex flex-wrap gap-x-4 gap-y-1">
              <span>Estado: <b>{s?.status}</b></span>
              {s?.container_name && <span>Contenedor: {s.container_name}</span>}
              {s?.port && <span>Puerto: 127.0.0.1:{s.port}</span>}
              {s?.api_key_fingerprint && <span>API Key huella: {s.api_key_fingerprint}</span>}
              {s?.signer_url && <span>URL: {s.signer_url}</span>}
              {!s?.executor_configured && <span className="text-amber-600">Ejecutor VPS no configurado (solo PLAN disponible).</span>}
            </div>
            {sp && (
              <dl className="text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-zinc-500">Última inspección</dt>
                <dd className={TONE[sp.inspection.tone]}>{sp.inspection.text}{sp.inspection.at && <span className="text-zinc-400"> · {sp.inspection.at.toLocaleString()}</span>}</dd>
                <dt className="text-zinc-500">Aprovisionamiento</dt>
                <dd className={TONE[sp.provisioning.tone]}>{sp.provisioning.text}</dd>
                {sp.pending.length > 0 && (<>
                  <dt className="text-zinc-500">Pendiente</dt>
                  <dd className="text-amber-700">{sp.pending.join(" · ")}</dd>
                </>)}
                {sp.lastApply && (<>
                  <dt className="text-zinc-500">Último APPLY</dt>
                  <dd className={`${TONE[sp.lastApply.tone]} break-words`}>{sp.lastApply.text}<span className="text-zinc-400"> · {sp.lastApply.at.toLocaleString()}</span></dd>
                </>)}
                {sp.lastError && !sp.lastError.fromLastApply && (<>
                  <dt className="text-zinc-500">Último error registrado</dt>
                  <dd className={`${sp.lastError.historical ? "text-zinc-500" : "text-red-600"} break-words`}>
                    {sp.lastError.text} <span className="text-zinc-400">({sp.lastError.origin}{sp.lastError.historical ? "; histórico, posterior INSPECT exitoso" : ""})</span>
                  </dd>
                </>)}
              </dl>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className={LABEL}>Slug</label><input className={INPUT} value={spec.slug} onChange={(e) => setSpec({ ...spec, slug: e.target.value })} placeholder="metatraining" autoComplete="off" /></div>
              <div><label className={LABEL}>Hostname</label><input className={INPUT} value={spec.hostname} onChange={(e) => setSpec({ ...spec, hostname: e.target.value })} placeholder={`firmador-cliente-${env === "PRODUCTION" ? "prod" : "test"}.getzolvi.com`} autoComplete="off" /></div>
              <div><label className={LABEL}>Usuario cPanel</label><input className={INPUT} value={spec.cpanelUser} onChange={(e) => setSpec({ ...spec, cpanelUser: e.target.value })} autoComplete="off" /></div>
              <div><label className={LABEL}>NIT del certificado</label><input className={INPUT} value={spec.signerNit} onChange={(e) => setSpec({ ...spec, signerNit: e.target.value })} autoComplete="off" /></div>
              <div><label className={LABEL}>DteIssuerConfig ({env})</label><input className={INPUT} value={spec.issuerConfigId} onChange={(e) => setSpec({ ...spec, issuerConfigId: e.target.value })} autoComplete="off" /></div>
              <div><label className={LABEL}>Puerto preferido (opcional)</label><input className={INPUT} value={spec.preferredPort} onChange={(e) => setSpec({ ...spec, preferredPort: e.target.value })} placeholder="auto 8120-8199" autoComplete="off" /></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} className={buttonClasses("primary", "sm")}
                onClick={() => run(() => saveSignerSpecAction(organizationId, env, { ...spec, preferredPort: spec.preferredPort ? Number(spec.preferredPort) : null }))}>
                Guardar especificación
              </button>
              {(["INSPECT", "PLAN", "VERIFY"] as const).map((m) => (
                <button key={m} type="button" disabled={pending || !s?.exists} className={buttonClasses("outline", "sm")} onClick={() => runMode(m)}>{m}</button>
              ))}
              <button type="button" disabled={pending || !s?.exists} className={buttonClasses("outline", "sm")}
                onClick={() => run(() => registerSignerCredentialAction(organizationId, env))}>
                Registrar credencial del firmador
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={LABEL}>APPLY — escriba <code>APPLY {resourceId || "<id>"}</code></label>
                <div className="flex gap-2">
                  <input className={INPUT} value={applyConfirm} onChange={(e) => setApplyConfirm(e.target.value)} autoComplete="off" />
                  <button type="button" disabled={pending || !s?.exists || applyConfirm !== `APPLY ${resourceId}`} className={buttonClasses("accent", "sm")}
                    onClick={() => { runMode("APPLY", { confirm: applyConfirm }); setApplyConfirm(""); }}>APPLY</button>
                </div>
              </div>
              <div className="space-y-1">
                <label className={LABEL}>ROLLBACK de un APPLY propio — <code>ROLLBACK {resourceId || "<id>"}</code></label>
                <div className="flex gap-2">
                  <select className={INPUT} value={rollbackRunId} onChange={(e) => setRollbackRunId(e.target.value)}>
                    <option value="">Run APPLY…</option>
                    {applyRuns.map((r) => <option key={r.id} value={r.id}>{new Date(r.started_at).toLocaleString()} · {r.status}</option>)}
                  </select>
                  <input className={INPUT} value={rollbackConfirm} onChange={(e) => setRollbackConfirm(e.target.value)} autoComplete="off" />
                  <button type="button" disabled={pending || !rollbackRunId || rollbackConfirm !== `ROLLBACK ${resourceId}`} className={buttonClasses("danger", "sm")}
                    onClick={() => { runMode("ROLLBACK", { confirm: rollbackConfirm, rollbackRunId }); setRollbackConfirm(""); }}>ROLLBACK</button>
                </div>
              </div>
            </div>

            {lastRun && (
              <div className="bg-zinc-50 rounded-lg p-3 text-xs space-y-2">
                <p className="font-semibold">Última ejecución: {lastRun.mode} · {lastRun.ok ? "OK" : "con errores"}</p>
                {lastRun.plan && (
                  <>
                    {lastRun.plan.blockers.map((b) => <p key={b.code + b.message} className="text-red-600">⛔ {b.code}: {b.message}</p>)}
                    {lastRun.plan.warnings.map((w) => <p key={w.code + w.message} className="text-amber-600">⚠ {w.code}: {w.message}</p>)}
                    <ul className="list-disc ml-4">{lastRun.plan.operations.map((o) => <li key={o.op}>{o.op}: {o.action}{o.detail ? ` — ${o.detail}` : ""}</li>)}</ul>
                  </>
                )}
                {lastRun.steps && <ul className="list-disc ml-4">{lastRun.steps.map((x, i) => <li key={i}>{x.op}: {x.status}{x.detail ? ` — ${x.detail}` : ""}</li>)}</ul>}
                {(lastRun.checks ?? []).concat(lastRun.remoteChecks ?? []).map((c, i) => (
                  <p key={i} className={c.status === "ok" ? "text-emerald-700" : c.status === "warning" ? "text-amber-600" : "text-red-600"}>{c.code}: {c.status}{c.detail ? ` — ${c.detail}` : ""}</p>
                ))}
              </div>
            )}

            {(s?.recent_runs.length ?? 0) > 0 && (
              <details className="text-xs text-zinc-500">
                <summary className="cursor-pointer">Bitácora ({s?.recent_runs.length})</summary>
                <ul className="mt-1 space-y-0.5">
                  {s?.recent_runs.map((r) => <li key={r.id}>{new Date(r.started_at).toLocaleString()} · {r.mode} · {r.status}{r.error_message ? ` — ${r.error_message}` : ""} <span className="text-zinc-400">({r.id})</span></li>)}
                </ul>
              </details>
            )}
          </Section>

          <Section title="MariaDB externa (opcional)">
            <div className="text-xs text-zinc-600 flex flex-wrap gap-x-4 gap-y-1">
              <span>{status.mariadb.configured ? "Configurada" : "NOT_CONFIGURED (no bloquea emisión)"}</span>
              {status.mariadb.configured && <span>Activa: <b>{status.mariadb.is_active ? "sí" : "no"}</b></span>}
              {status.mariadb.configured && <span>Automática: <b>{status.mariadb.auto_delivery_enabled ? "sí" : "no"}</b></span>}
              {status.mariadb.configured && <span>Prueba: {status.mariadb.last_test_status}{status.mariadb.last_test_message ? ` — ${status.mariadb.last_test_message}` : ""}</span>}
            </div>
            <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); run(() => saveMariaDbIntegrationAction(organizationId, mdb)); setMdb({ ...mdb, password: "" }); }}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2"><label className={LABEL}>Host</label><input className={INPUT} value={mdb.host} onChange={(e) => setMdb({ ...mdb, host: e.target.value })} autoComplete="off" /></div>
              <div><label className={LABEL}>Puerto</label><input className={INPUT} value={mdb.port} onChange={(e) => setMdb({ ...mdb, port: e.target.value })} autoComplete="off" /></div>
              <div><label className={LABEL}>Base</label><input className={INPUT} value={mdb.database} onChange={(e) => setMdb({ ...mdb, database: e.target.value })} autoComplete="off" /></div>
              <div><label className={LABEL}>Tabla DTE</label><input className={INPUT} value={mdb.table} onChange={(e) => setMdb({ ...mdb, table: e.target.value })} autoComplete="off" /></div>
              <div><label className={LABEL}>Tabla invalidaciones</label><input className={INPUT} value={mdb.invalidationTable} onChange={(e) => setMdb({ ...mdb, invalidationTable: e.target.value })} autoComplete="off" /></div>
              <div><label className={LABEL}>Usuario INSERT-only</label><input className={INPUT} value={mdb.user} onChange={(e) => setMdb({ ...mdb, user: e.target.value })} autoComplete="off" /></div>
              <div><label className={LABEL}>Contraseña MariaDB {status.mariadb.has_password && <span className="text-emerald-600">(guardada)</span>}</label>
                <input type="password" name="mariadb-insert-password" className={INPUT} value={mdb.password} onChange={(e) => setMdb({ ...mdb, password: e.target.value })} autoComplete="new-password" placeholder="en blanco = conservar" /></div>
              <div className="sm:col-span-4 flex flex-wrap gap-2">
                <button type="submit" disabled={pending} className={buttonClasses("primary", "sm")}>Guardar destino</button>
                <button type="button" disabled={pending || !status.mariadb.configured} className={buttonClasses("outline", "sm")} onClick={() => run(() => testMariaDbIntegrationAction(organizationId))}>Probar (sin insertar)</button>
                <button type="button" disabled={pending || !status.mariadb.configured} className={buttonClasses("outline", "sm")}
                  onClick={() => run(() => setMariaDbFlagsAction(organizationId, { is_active: !status.mariadb.is_active }))}>
                  {status.mariadb.is_active ? "Deshabilitar entrega" : "Habilitar entrega"}
                </button>
                <button type="button" disabled={pending || !status.mariadb.is_active} className={buttonClasses("outline", "sm")}
                  onClick={() => run(() => setMariaDbFlagsAction(organizationId, { auto_delivery_enabled: !status.mariadb.auto_delivery_enabled }))}>
                  {status.mariadb.auto_delivery_enabled ? "Desactivar automática" : "Activar entrega automática"}
                </button>
                <button type="button" disabled={pending || !status.mariadb.auto_delivery_enabled} className={buttonClasses("ghost", "sm")}
                  onClick={() => startTransition(async () => {
                    const r = await processDeliveryOutboxAction(organizationId);
                    setMsg(r.ok ? { ok: true, text: `Outbox: ${r.summary.discovered.enqueued} encolados, ${r.summary.delivered} entregados, ${r.summary.failed} fallidos, ${r.summary.uncertain} inciertos, ${r.summary.expiredLeasesMarkedUncertain} leases vencidos.` } : { ok: false, text: r.error });
                    load(false);
                  })}>
                  Procesar pendientes
                </button>
              </div>
            </form>

            {jobs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="zv-table w-full text-xs">
                  <thead><tr className="bg-zinc-50"><th className="text-left px-2 py-1">DTE</th><th className="text-left px-2 py-1">Amb.</th><th className="text-left px-2 py-1">Estado</th><th className="text-left px-2 py-1">Intentos</th><th className="text-left px-2 py-1">Último error</th><th></th></tr></thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id} className="border-b border-zinc-50">
                        <td className="px-2 py-1 font-mono">{j.generation_code ?? j.dte_document_id}</td>
                        <td className="px-2 py-1">{j.environment}</td>
                        <td className={`px-2 py-1 font-semibold ${j.status === "UNCERTAIN" ? "text-red-600" : j.status === "DELIVERED" || j.status === "RECONCILED_DELIVERED" ? "text-emerald-700" : ""}`}>{j.status}</td>
                        <td className="px-2 py-1">{j.attempts}</td>
                        <td className="px-2 py-1 break-words max-w-[280px]">{j.last_error_code ?? ""}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          {j.status === "UNCERTAIN" && (
                            <>
                              <button type="button" className={buttonClasses("outline", "sm")} disabled={pending}
                                onClick={() => { const note = window.prompt("Evidencia del receptor: el DTE SÍ está en su sistema (referencia):"); if (note) run(() => reconcileDeliveryJobAction(organizationId, j.id, "CONFIRMED_DELIVERED", note)); }}>
                                Receptor lo tiene
                              </button>{" "}
                              <button type="button" className={buttonClasses("outline", "sm")} disabled={pending}
                                onClick={() => { const note = window.prompt("Evidencia del receptor: el DTE NO existe en su sistema (referencia):"); if (note) run(() => reconcileDeliveryJobAction(organizationId, j.id, "CONFIRMED_NOT_DELIVERED", note)); }}>
                                No lo tiene → reenviar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {env === "PRODUCTION" && (
            <Section title="Autorización de Hacienda (manual)">
              <p className="text-xs text-zinc-500">
                La infraestructura se automatiza; la autorización productiva de Hacienda no. Atestar solo con evidencia documental.
              </p>
              {s?.mh_authorization_confirmed_at
                ? <p className="text-xs text-emerald-700">Atestada: {new Date(s.mh_authorization_confirmed_at).toLocaleString()} — {s.mh_authorization_reference}</p>
                : (
                  <div className="flex gap-2">
                    <input className={INPUT} value={mhRef} onChange={(e) => setMhRef(e.target.value)} placeholder="Referencia (resolución / correo / fecha)" autoComplete="off" />
                    <button type="button" disabled={pending || !s?.exists} className={buttonClasses("outline", "sm")} onClick={() => run(() => confirmMhAuthorizationAction(organizationId, mhRef))}>Atestar</button>
                  </div>
                )}
            </Section>
          )}

          <Section title="Activación">
            <p className="text-xs text-zinc-500">
              {status.canActivate
                ? `Puede activarse ${env}. Confirme con "${env === "PRODUCTION" ? "PRODUCCION" : "ACTIVAR TEST"}".`
                : `No corresponde activar ${env} todavía.`}
            </p>
            <div className="flex gap-2">
              <input className={INPUT} value={activateConfirm} onChange={(e) => setActivateConfirm(e.target.value)} autoComplete="off" disabled={!status.canActivate} />
              <button type="button" disabled={pending || !status.canActivate} className={buttonClasses("accent", "sm")}
                onClick={() => { run(() => activateFiscalEnvironmentAction(organizationId, env, activateConfirm)); setActivateConfirm(""); }}>
                Activar {env}
              </button>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
