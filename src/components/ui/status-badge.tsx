import type { Status } from "@prisma/client";

const STATUS_MAP: Record<Status, { label: string; className: string }> = {
  active: { label: "Activo", className: "bg-emerald-100 text-emerald-800" },
  inactive: { label: "Inactivo", className: "bg-zinc-100 text-zinc-600" },
  suspended: { label: "Suspendido", className: "bg-amber-100 text-amber-800" },
  deleted: { label: "Eliminado", className: "bg-red-100 text-red-700" },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, className } = STATUS_MAP[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}
