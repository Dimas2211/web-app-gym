"use client";

// GYM-5D — boundary de error de "Analítica de entrenamiento".
// Las ausencias esperadas (módulo, zona horaria, tablas de GYM-5A, límites)
// se muestran como avisos en la página; aquí solo llegan fallos inesperados.

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function TrainingAnalyticsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[reports/training-analytics/error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
      <AlertTriangle size={40} className="text-amber-400 mb-4 opacity-80" />
      <h2 className="text-base font-semibold text-zinc-800 mb-1">No se pudo cargar la analítica de entrenamiento</h2>
      <p className="text-sm text-zinc-500 max-w-sm mb-6">Ocurrió un error al obtener los datos desde el servidor. Intenta de nuevo.</p>
      {error.digest && <p className="text-xs text-zinc-300 font-mono mb-4">ref: {error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
      >
        <RefreshCw size={14} />
        Reintentar
      </button>
    </div>
  );
}
