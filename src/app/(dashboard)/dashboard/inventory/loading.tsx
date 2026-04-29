// ─────────────────────────────────────────────────────────────────
// commerce/inventory — loading.tsx
//
// Skeleton de carga para el módulo de inventario.
// Anticipa el layout real: grilla principal + panel lateral.
// ─────────────────────────────────────────────────────────────────

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div className={`bg-zinc-200 rounded animate-pulse ${className ?? ""}`} />
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-100">
      <td className="px-3 py-2"><SkeletonBar className="h-3 w-16" /></td>
      <td className="px-3 py-2"><SkeletonBar className="h-3 w-40" /></td>
      <td className="px-3 py-2"><SkeletonBar className="h-3 w-24" /></td>
      <td className="px-3 py-2"><SkeletonBar className="h-3 w-20" /></td>
      <td className="px-3 py-2 text-center"><SkeletonBar className="h-3 w-8 mx-auto" /></td>
      <td className="px-3 py-2 text-right"><SkeletonBar className="h-3 w-14 ml-auto" /></td>
      <td className="px-3 py-2 text-right"><SkeletonBar className="h-3 w-10 ml-auto" /></td>
      <td className="px-3 py-2 text-right"><SkeletonBar className="h-3 w-10 ml-auto" /></td>
      <td className="px-3 py-2"><SkeletonBar className="h-3 w-20" /></td>
      <td className="px-3 py-2"><SkeletonBar className="h-3 w-16" /></td>
      <td className="px-3 py-2 text-center"><SkeletonBar className="h-5 w-12 rounded mx-auto" /></td>
      <td className="px-3 py-2 text-center"><SkeletonBar className="h-2 w-2 rounded-full mx-auto" /></td>
      <td className="px-3 py-2"><SkeletonBar className="h-3 w-28" /></td>
    </tr>
  );
}

export default function InventoryLoading() {
  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Encabezado */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="space-y-2">
          <SkeletonBar className="h-6 w-36" />
          <SkeletonBar className="h-4 w-48" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <SkeletonBar className="h-8 w-44 rounded-lg" />
        <SkeletonBar className="h-8 w-52 rounded-lg" />
        <SkeletonBar className="h-8 w-40 rounded-lg" />
        <SkeletonBar className="h-8 w-36 rounded-lg" />
      </div>

      {/* Área principal */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Grilla */}
        <div className="flex-1 min-w-0 bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  {[
                    "Código", "Nombre", "Categoría", "Línea", "Unidad",
                    "Stock", "Mín.", "Reorden", "Almacén", "Estante/Pos.",
                    "Alerta", "Activo", "Actualización",
                  ].map((col) => (
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
                {Array.from({ length: 10 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50 shrink-0">
            <SkeletonBar className="h-3 w-36 ml-auto" />
          </div>
        </div>

        {/* Panel lateral */}
        <div className="w-80 shrink-0 bg-white rounded-xl border border-zinc-200 shadow-sm p-4 flex flex-col gap-4">
          {/* Header del panel */}
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-zinc-100">
            <div className="space-y-1.5 flex-1">
              <SkeletonBar className="h-3 w-16" />
              <SkeletonBar className="h-4 w-44" />
              <SkeletonBar className="h-3 w-32" />
            </div>
            <div className="space-y-1.5 items-end flex flex-col shrink-0">
              <SkeletonBar className="h-5 w-16 rounded-full" />
              <SkeletonBar className="h-3 w-12" />
            </div>
          </div>

          {/* Métricas de stock */}
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-2 bg-zinc-50 rounded-lg space-y-1">
                <SkeletonBar className="h-3 w-full" />
                <SkeletonBar className="h-5 w-3/4 mx-auto" />
              </div>
            ))}
          </div>

          {/* Campos de detalle */}
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <SkeletonBar className="h-3 w-24 shrink-0" />
                <SkeletonBar className="h-3 flex-1" />
              </div>
            ))}
          </div>

          {/* Botones de acción */}
          <div className="mt-auto space-y-2">
            <SkeletonBar className="h-8 w-full rounded-lg" />
            <SkeletonBar className="h-8 w-full rounded-lg" />
          </div>
        </div>
      </div>

    </div>
  );
}
