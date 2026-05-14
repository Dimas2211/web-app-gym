// commerce/customers — loading.tsx

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div className={`bg-zinc-200 rounded animate-pulse ${className ?? ""}`} />
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-100">
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-16" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-44" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-36" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-28" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-24" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-3 w-24" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-5 w-20 rounded-full" /></td>
      <td className="px-3 py-2.5"><SkeletonBar className="h-5 w-16 rounded-full" /></td>
    </tr>
  );
}

export default function CustomersLoading() {
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

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3">
        <SkeletonBar className="h-9 flex-1 min-w-[200px] rounded-lg" />
        <SkeletonBar className="h-9 w-36 rounded-lg" />
        <SkeletonBar className="h-9 w-36 rounded-lg" />
        <SkeletonBar className="h-9 w-32 rounded-lg" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              {["Código", "Nombre", "Razón social", "NIT", "NRC", "Tipo contrib.", "Teléfono", "Estado"].map((col) => (
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
        <div className="min-h-[200px] grid grid-cols-1 lg:grid-cols-4 divide-x divide-zinc-100 p-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 p-2">
              <SkeletonBar className="h-4 w-24" />
              <SkeletonBar className="h-3 w-full" />
              <SkeletonBar className="h-3 w-3/4" />
              <SkeletonBar className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
