"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="w-full text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-colors print:hidden"
    >
      Imprimir / Guardar PDF
    </button>
  );
}
