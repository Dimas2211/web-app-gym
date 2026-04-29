"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — error.tsx
//
// Boundary de error para el maestro de proveedores.
// Captura errores de carga del servidor (e.g., fallo de DB en la
// carga inicial de la primera página de proveedores).
//
// NOTA: Errores en fetch client-side (SuppliersClient) se tratan
// localmente en el componente — no llegan aquí.
// ─────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface SuppliersErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SuppliersError({ error, reset }: SuppliersErrorProps) {
  useEffect(() => {
    console.error("[suppliers/error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
      <AlertTriangle size={40} className="text-amber-400 mb-4 opacity-80" />

      <h2 className="text-base font-semibold text-zinc-800 mb-1">
        No se pudo cargar el maestro de proveedores
      </h2>
      <p className="text-sm text-zinc-500 max-w-sm mb-6">
        Ocurrió un error al obtener los datos del servidor. Esto puede deberse
        a un problema de conexión con la base de datos.
      </p>

      {error.digest && (
        <p className="text-xs text-zinc-300 font-mono mb-4">
          ref: {error.digest}
        </p>
      )}

      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg
                   text-sm font-medium hover:bg-zinc-800 transition-colors"
      >
        <RefreshCw size={14} />
        Reintentar
      </button>
    </div>
  );
}
