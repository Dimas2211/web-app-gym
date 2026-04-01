"use client";

import { useState } from "react";

interface ExpiringProps {
  type: "expiring_soon";
  daysRemaining: number;
  expirationDate: string;
}

interface ExpiredProps {
  type: "expired";
  expirationDate: string;
}

type Props = ExpiringProps | ExpiredProps;

export function MembershipAlertBanner(props: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  if (props.type === "expiring_soon") {
    const { daysRemaining, expirationDate } = props;
    const label =
      daysRemaining === 0
        ? "vence hoy"
        : daysRemaining === 1
        ? "vence mañana"
        : `vence en ${daysRemaining} días`;

    return (
      <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm">
        <p className="text-amber-800">
          <span className="font-semibold">Tu membresía {label}</span>
          {" — "}
          {expirationDate}
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-400 hover:text-amber-700 shrink-0 text-base leading-none"
          aria-label="Cerrar aviso"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm">
      <p className="text-red-800">
        <span className="font-semibold">Membresía caducada</span>
        {" — venció el "}
        {props.expirationDate}
        {". Acércate a recepción para renovar."}
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="text-red-400 hover:text-red-600 shrink-0 text-base leading-none"
        aria-label="Cerrar aviso"
      >
        ✕
      </button>
    </div>
  );
}
