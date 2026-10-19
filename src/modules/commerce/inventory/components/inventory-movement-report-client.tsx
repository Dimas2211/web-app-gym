"use client";
import { useEffect, useState } from "react";
import type { InventoryMovementItem, MovementType } from "../types/inventory-movement.types";
import { InventoryMovementsTable } from "./inventory-movements-table";
import { exportInventoryMovementsExcel, exportInventoryMovementsPdf } from "../utils/export-inventory-movement-report";

type ReportResponse = { items: InventoryMovementItem[]; total: number; error?: string };
const movementTypes: MovementType[] = ["INITIAL_LOAD","MANUAL_IN","MANUAL_OUT","ADJUSTMENT_UP","ADJUSTMENT_DOWN","PURCHASE_IN","SALE_OUT","TRANSFER_IN","TRANSFER_OUT","RETURN_IN","RETURN_OUT"];
export function InventoryMovementReportClient() {
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [type,setType]=useState("");
  const [result,setResult]=useState<ReportResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [exporting,setExporting]=useState(false);
  async function load() {
    setLoading(true);setError("");
    try {
      const q=new URLSearchParams({page_size:"500",sort_field:"created_at",sort_direction:"asc"});
      if(from)q.set("date_from",new Date(from+"T00:00:00").toISOString());
      if(to)q.set("date_to",new Date(to+"T23:59:59.999").toISOString());
      if(type)q.set("movement_type",type);
      const response=await fetch("/api/inventory/movements?"+q,{cache:"no-store"});
      const data=await response.json() as ReportResponse;
      if(!response.ok)throw new Error(data.error??"Error consultando movimientos");
      setResult(data);
    }catch(e){setError(e instanceof Error?e.message:"Error desconocido");setResult(null);}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  const complete=!!result && result.items.length===result.total && result.total<=500;
  async function download(kind:"excel"|"pdf") {
    if(!complete || !result || exporting || loading) return;
    setExporting(true);setError("");
    try {
      if(kind==="excel") await exportInventoryMovementsExcel(result.items);
      else await exportInventoryMovementsPdf(result.items);
    }catch { setError("No se pudo generar el archivo. Volvé a intentarlo."); }
    finally {setExporting(false);}
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <label className="text-sm">Desde<input className="block bg-zinc-950 border border-zinc-700 rounded p-2" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label className="text-sm">Hasta<input className="block bg-zinc-950 border border-zinc-700 rounded p-2" type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label className="text-sm">Movimiento<select className="block bg-zinc-950 border border-zinc-700 rounded p-2" value={type} onChange={e=>setType(e.target.value)}>
        <option value="">Todos</option>{movementTypes.map(t=><option key={t} value={t}>{t}</option>)}
      </select></label>
      <button className="rounded bg-blue-700 px-4 py-2 disabled:opacity-50" disabled={loading} onClick={()=>void load()}>{loading?"Consultando...":"Consultar"}</button>
      <button className="rounded border border-zinc-600 px-4 py-2 disabled:opacity-40" disabled={!complete || loading || exporting} onClick={()=>void download("excel")}>Exportar Excel</button>
      <button className="rounded border border-zinc-600 px-4 py-2 disabled:opacity-40" disabled={!complete || loading || exporting} onClick={()=>void download("pdf")}>Exportar PDF</button>
    </div>
    {error&&<p role="alert" className="text-red-400">{error}</p>}
    {result&&<><p className="text-sm text-zinc-400">Mostrando {result.items.length} de {result.total} movimientos. Alcance: sucursal activa.</p>
      {!complete&&<p className="text-amber-400 text-sm">El reporte supera 500 movimientos; acotá el período para mostrar y exportar todos los registros sin omisiones.</p>}
      <div className="bg-white rounded-lg overflow-hidden min-h-[320px]"><InventoryMovementsTable items={result.items} isLoading={loading}/></div>
    </>}
  </section>;
}
