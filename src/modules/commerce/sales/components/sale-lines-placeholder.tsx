const HEADERS = ["Código", "Producto", "Cantidad", "Precio", "IVA", "Total"];

export function SaleLinesPlaceholder() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-none px-3 py-2 border-b border-zinc-800 flex items-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Líneas de venta
        </span>
      </div>

      <div className="flex-none grid grid-cols-6 gap-2 px-3 py-1.5 bg-zinc-800/30 border-b border-zinc-800">
        {HEADERS.map((h) => (
          <span key={h} className="text-[10px] text-zinc-700 uppercase tracking-wider">
            {h}
          </span>
        ))}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-1.5 p-6">
        <span className="text-xs text-zinc-600 text-center leading-snug">
          La búsqueda de productos y captura de líneas se implementará en Fase 4D.
        </span>
      </div>
    </div>
  );
}
