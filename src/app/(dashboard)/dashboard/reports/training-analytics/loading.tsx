// GYM-5D — skeleton de carga de "Analítica de entrenamiento".

function SkeletonBar({ className }: { className?: string }) {
  return <div className={`bg-zinc-200 rounded animate-pulse ${className ?? ""}`} />;
}

export default function TrainingAnalyticsLoading() {
  return (
    <main className="p-4 md:p-8 max-w-6xl mx-auto space-y-6" aria-busy="true" aria-label="Cargando analítica de entrenamiento">
      <div className="space-y-2">
        <SkeletonBar className="h-3 w-32" />
        <SkeletonBar className="h-6 w-64" />
        <SkeletonBar className="h-4 w-full max-w-xl" />
      </div>
      <div className="flex flex-wrap gap-3">
        <SkeletonBar className="h-9 w-48 rounded-lg" />
        <SkeletonBar className="h-9 w-48 rounded-lg" />
        <SkeletonBar className="h-9 w-24 rounded-lg" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <section key={i} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 sm:p-5 space-y-4">
          <SkeletonBar className="h-4 w-48" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((__, j) => (
              <SkeletonBar key={j} className="h-16 rounded-lg" />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
