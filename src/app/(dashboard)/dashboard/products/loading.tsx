// ─────────────────────────────────────────────────────────────────
// commerce/products — loading.tsx
//
// Skeleton de carga para el catálogo de productos.
// Muestra la estructura visual de la pantalla mientras los datos
// del servidor (lookups + primera página) se están cargando.
// ─────────────────────────────────────────────────────────────────

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div className={`bg-zinc-200 rounded animate-pulse ${className ?? ""}`} />
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-100">
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-16" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-40" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-16" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-24" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-16" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-20" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-10" /></td>
      <td className="px-3 py-2.5 text-right"><SkeletonBar className="h-3 w-16 ml-auto" /></td>
      <td className="px-3 py-2.5 text-center"><SkeletonBar className="h-2 w-2 rounded-full mx-auto" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-5 w-20 rounded-full" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-20" /></td>
    </tr>
  );
}

export default function ProductsLoading() {
  return (
    <div className="space-y-4">

      {/* Encabezado */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-6 w-52" />
          <SkeletonBar className="h-4 w-36" />
        </div>
        <SkeletonBar className="h-9 w-36 rounded-lg" />
      </div>

      {/* Toolbar (búsqueda + sort) */}
      <div className="flex flex-wrap gap-3">
        <SkeletonBar className="h-9 flex-1 min-w-[220px] rounded-lg" />
        <SkeletonBar className="h-9 w-32 rounded-lg" />
        <SkeletonBar className="h-9 w-24 rounded-lg" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <SkeletonBar className="h-9 w-36 rounded-lg" />
        <SkeletonBar className="h-9 w-32 rounded-lg" />
        <SkeletonBar className="h-9 w-40 rounded-lg" />
        <SkeletonBar className="h-9 w-28 rounded-lg" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              {["Código", "Nombre", "Tipo", "Categoría", "Marca", "SKU",
                "Unidad", "P. Venta", "Stock", "Estado", "Ingreso"].map((col) => (
                <th
                  key={col}
                  className="px-3 py-2.5 text-left text-xs font-semibold text-zinc-400
                             uppercase tracking-wide whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Panel de detalle */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="min-h-[200px] grid grid-cols-1 lg:grid-cols-3 divide-x divide-zinc-100 p-4 gap-4">
          <div className="space-y-3">
            <SkeletonBar className="h-4 w-28" />
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="h-3 w-3/4" />
            <SkeletonBar className="h-3 w-1/2" />
          </div>
          <div className="p-4 space-y-3">
            <SkeletonBar className="h-4 w-24" />
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="h-3 w-2/3" />
          </div>
          <div className="p-4 space-y-3">
            <SkeletonBar className="h-4 w-32" />
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="h-3 w-3/4" />
          </div>
        </div>

        {/* Pestañas de trazabilidad */}
        <div className="border-t border-zinc-100 px-4 py-2 flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBar key={i} className="h-8 w-20 rounded" />
          ))}
        </div>
      </div>

    </div>
  );
}
