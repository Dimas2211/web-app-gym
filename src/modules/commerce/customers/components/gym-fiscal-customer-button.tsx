"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { prepareGymFiscalCustomerAction, linkFiscalCustomerForGymAction } from "../actions/gym-fiscal-customer.action";
import { NewCustomerDialog } from "./new-customer-dialog";

type Prepared = Extract<Awaited<ReturnType<typeof prepareGymFiscalCustomerAction>>, { ok: true }>["data"];
const buttonClass = "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export function GymFiscalCustomerButton({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Prepared | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [create, setCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let cancelled = false;
    prepareGymFiscalCustomerAction(clientId).then(result => {
      if (cancelled) return;
      if (result.ok) setData(result.data); else setError(result.error);
    }).catch(() => { if (!cancelled) setError("No se pudo cargar el vínculo fiscal. Actualiza la página."); });
    return () => { cancelled = true; };
  }, [clientId]);

  function linked(id: string, customer_code = "", name = data?.defaults.name ?? "") {
    setData(previous => previous ? { ...previous, linkedCustomer: { id, customer_code, name } } : previous);
    setOpen(false); setCreate(false);
  }
  return <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Cliente fiscal</h2>
    {data?.linkedCustomer ? <div>
      <p className="mb-2 text-sm text-zinc-600">{data.linkedCustomer.name}</p>
      <Link className="text-sm font-semibold text-blue-700 underline"
        href={`/dashboard/customers?customer_id=${data.linkedCustomer.id}`}>Ver cliente fiscal</Link>
    </div> : <button type="button" className={buttonClass} disabled={!data || data.inactive}
      onClick={() => setOpen(value => !value)}>{data ? "Crear / vincular cliente fiscal" : "Cargando vínculo fiscal…"}</button>}
    {data?.inactive && !data.linkedCustomer && <p className="mt-2 text-sm text-zinc-500">Activa la ficha Gym antes de crear o vincular su cliente fiscal.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {open && data && !data.linkedCustomer && <fieldset disabled={pending} className="mt-4 space-y-3">
      <legend className="text-sm font-semibold">Vincular cliente fiscal existente</legend>
      <form className="flex gap-2" onSubmit={event => {
        event.preventDefault(); setError("");
        startTransition(async () => {
          try {
            const result = await prepareGymFiscalCustomerAction(clientId, search);
            if (result.ok) setData(result.data); else setError(result.error);
          } catch { setError("No se pudo buscar. Intenta nuevamente."); }
        });
      }}>
        <input aria-label="Buscar cliente fiscal" maxLength={150} placeholder="Nombre, documento o correo"
          value={search} onChange={e => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        <button type="submit" className={buttonClass}>Buscar</button>
      </form>
      {data.candidates.length ? <ul className="max-h-60 divide-y divide-zinc-100 overflow-auto rounded-lg border border-zinc-200">
        {data.candidates.map(candidate => <li key={candidate.id} className="flex items-center justify-between gap-3 p-3 text-sm">
          <div><p className="font-medium">{candidate.name}</p>
            <p className="text-xs text-zinc-500">{candidate.customer_code} · {candidate.dui || candidate.nit || candidate.email || "Sin documento"}
              {candidate.status !== "active" ? " · Inactivo" : ""}</p></div>
          <button type="button" disabled={pending || candidate.linked || candidate.status !== "active"}
            className="text-blue-700 underline disabled:text-zinc-400"
            onClick={() => { setError(""); startTransition(async () => {
              try {
                const result = await linkFiscalCustomerForGymAction(clientId, candidate.id);
                if (result.ok) linked(result.id, result.customer_code, candidate.name); else setError(result.error);
              } catch { setError("No se pudo vincular. Intenta nuevamente."); }
            }); }}>{candidate.linked ? "Ya vinculado" : "Vincular"}</button>
        </li>)}
      </ul> : <p className="text-sm text-zinc-500">Sin coincidencias. Puedes buscar otro cliente o crear uno nuevo.</p>}
      <button type="button" className={buttonClass} onClick={() => setCreate(true)}>Crear cliente fiscal nuevo</button>
      <p className="text-xs text-zinc-500">Se precargarán sus datos de Gym. Solo completa o confirma los datos fiscales que falten.</p>
    </fieldset>}
    {create && data && <NewCustomerDialog initialValues={data.defaults} sourceGymClientId={clientId}
      gymDocument={data.document} onClose={() => setCreate(false)} onSuccess={id => linked(id)} />}
  </section>;
}
