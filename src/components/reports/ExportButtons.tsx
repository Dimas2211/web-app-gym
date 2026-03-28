"use client";

interface Props {
  onExportXlsx: () => void;
  onExportPdf: () => void;
  disabled?: boolean;
}

export function ExportButtons({ onExportXlsx, onExportPdf, disabled }: Props) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onExportXlsx}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-2 text-sm rounded bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
        title="Exportar a Excel"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-green-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        XLSX
      </button>

      <button
        type="button"
        onClick={onExportPdf}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-2 text-sm rounded bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
        title="Exportar a PDF"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-red-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        PDF
      </button>
    </div>
  );
}
