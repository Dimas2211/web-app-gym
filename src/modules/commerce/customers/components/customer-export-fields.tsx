"use client";

import { useEffect, useId, useState } from "react";
import { getCustomerCountriesAction } from "../actions/get-customer-countries.action";

interface Props {
  isForeign: boolean;
  onForeignChange: (value: boolean) => void;
  initialCountry?: string | null;
  initialPersonType?: string | null;
  errors: Record<string, string[]>;
}

const inputCls = "w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-800";

export function CustomerExportFields({ isForeign, onForeignChange, initialCountry, initialPersonType, errors }: Props) {
  const id = useId();
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [country, setCountry] = useState(initialCountry ?? "");
  const [personType, setPersonType] = useState(initialPersonType ?? "");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isForeign) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getCustomerCountriesAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setCountries(result.items);
      else setLoadError(result.error);
    }).catch(() => {
      if (!cancelled) setLoadError("No se pudo cargar el catálogo de países.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isForeign, attempt]);

  return (
    <fieldset className="border border-zinc-100 rounded-lg p-4 mb-4">
      <legend className="px-1 text-xs font-semibold text-zinc-400 uppercase">Exportación</legend>
      <label className="flex items-center gap-2 text-sm text-zinc-800">
        <input type="checkbox" name="is_foreign" checked={isForeign}
          onChange={(event) => onForeignChange(event.target.checked)} />
        Cliente extranjero
      </label>
      <p className="mt-2 text-xs text-zinc-500">
        Para seleccionar este cliente en Factura de exportación debe estar activo y tener sus datos extranjeros completos.
        Esta ficha es común a los ambientes fiscales; cambiarla también afecta las ventas futuras que la utilicen.
      </p>
      {isForeign && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-country`} className="block text-xs font-medium text-zinc-700 mb-1">País de destino</label>
            <select id={`${id}-country`} name="country_code" value={country} required
              onChange={(event) => setCountry(event.target.value)} className={inputCls}>
              <option value="">{loading ? "Cargando países…" : "Seleccione un país"}</option>
              {country && !countries.some((item) => item.code === country) && (
                <option value={country} disabled>{country} — seleccione un país vigente</option>
              )}
              {countries.filter((item) => item.code !== "SV").map((item) => (
                <option key={item.code} value={item.code}>{item.name}</option>
              ))}
            </select>
            {errors.country_code && <p className="mt-1 text-xs text-red-600">{errors.country_code[0]}</p>}
            {loadError && <p role="alert" className="mt-1 text-xs text-red-600">{loadError} <button type="button" className="underline" onClick={() => setAttempt((value) => value + 1)}>Reintentar</button></p>}
          </div>
          <div>
            <label htmlFor={`${id}-person`} className="block text-xs font-medium text-zinc-700 mb-1">Tipo de persona</label>
            <select id={`${id}-person`} name="customer_person_type" required value={personType}
              onChange={(event) => setPersonType(event.target.value)} className={inputCls}>
              <option value="">Seleccione un tipo</option>
              <option value="1">Jurídica</option>
              <option value="2">Natural</option>
            </select>
            {errors.customer_person_type && <p className="mt-1 text-xs text-red-600">{errors.customer_person_type[0]}</p>}
          </div>
        </div>
      )}
    </fieldset>
  );
}
