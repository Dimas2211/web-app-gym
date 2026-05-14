"use client";

// commerce/customers — error.tsx

export default function CustomersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center p-8">
      <p className="text-sm font-medium text-zinc-700 mb-1">
        Error al cargar el maestro de clientes
      </p>
      <p className="text-xs text-zinc-400 mb-4">{error.message}</p>
      <button
        onClick={reset}
        className="text-sm px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
      >
        Reintentar
      </button>
    </div>
  );
}
