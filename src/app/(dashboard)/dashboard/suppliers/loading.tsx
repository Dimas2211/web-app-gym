// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — loading.tsx
//
// Skeleton de carga para el maestro de proveedores.
// Muestra la estructura visual de la pantalla mientras la carga
// inicial del servidor (primera página de proveedores) se procesa.
// ─────────────────────────────────────────────────────────────────

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div className={`bg-zinc-200 rounded animate-pulse ${className ?? ""}`} />
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-100">
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-20" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-48" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-28" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-24" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-24" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-20" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-5 w-16 rounded-full" /></td>
    </tr>
  );
}

export default function SuppliersLoading() {
  return (
    <div className="space-y-4">

      {/* Encabezado */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-6 w-52" />
          <SkeletonBar className="h-4 w-36" />
        </div>
        <SkeletonBar className="h-9 w-40 rounded-lg" />
      </div>

      {/* Toolbar (búsqueda + sort) */}
      <div className="flex flex-wrap gap-3">
        <SkeletonBar className="h-9 flex-1 min-w-[200px] rounded-lg" />
        <SkeletonBar className="h-9 flex-1 min-w-[200px] rounded-lg" />
        <SkeletonBar className="h-9 w-32 rounded-lg" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              {["Código", "Nombre", "Tipo contrib.", "NIT", "NRC", "Teléfono", "Estado"].map((col) => (
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

      {/* Panel de ficha inferior */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="min-h-[180px] grid grid-cols-1 lg:grid-cols-3 divide-x divide-zinc-100 p-4 gap-4">
          <div className="space-y-3">
            <SkeletonBar className="h-4 w-32" />
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
            <SkeletonBar className="h-4 w-28" />
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="h-3 w-3/4" />
          </div>
        </div>

        {/* Tabs */}
        <div className="border-t border-zinc-100 px-4 py-2 flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBar key={i} className="h-8 w-24 rounded" />
          ))}
        </div>
      </div>

    </div>
  );
}
