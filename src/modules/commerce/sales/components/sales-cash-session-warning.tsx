"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — sales-cash-session-warning.tsx
//
// Banner informativo sobre el estado de caja en la pantalla de ventas.
// No bloquea ninguna operación de sales. Solo informativo.
//
// Props:
//   hasOpenCashSession — true si existe al menos una sesión OPEN
//                        en la location actual.
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface SalesCashSessionWarningProps {
  hasOpenCashSession: boolean;
}

export function SalesCashSessionWarning({
  hasOpenCashSession,
}: SalesCashSessionWarningProps) {
  if (hasOpenCashSession) {
    return (
      <div className="flex-none border-b border-emerald-900/40 bg-emerald-950/30 px-3 py-1.5 flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-none" />
        <span className="text-xs text-emerald-600">
          Caja abierta detectada para esta sucursal. Las ventas confirmadas se asociarán automáticamente a la sesión de caja activa.
        </span>
      </div>
    );
  }

  return (
    <div className="flex-none border-b border-amber-800/50 bg-amber-950/30 px-3 py-1.5 flex items-center gap-2 flex-wrap">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-none" />
      <span className="text-xs text-amber-400">
        No hay una caja abierta para esta sucursal. Puedes continuar operando, pero para que el corte diario quede controlado debes abrir una sesión de caja antes de registrar cobros.
      </span>
      <Link
        href="/dashboard/cash"
        className="ml-auto text-xs font-medium text-amber-300 hover:text-amber-100 border border-amber-700/60 hover:border-amber-500 rounded px-2 py-0.5 transition-colors flex-none"
      >
        Ir a Caja
      </Link>
    </div>
  );
}
