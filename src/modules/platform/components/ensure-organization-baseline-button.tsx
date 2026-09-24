"use client";

// ─────────────────────────────────────────────────────────────────
// platform — ensure-organization-baseline-button.tsx
//
// SHARED-OPS-PARITY-1. Botón "Baseline Commerce" de UNA organización:
// inicializa/verifica (idempotente) IVA 13%, categoría GENERAL y
// TenantFiscalConfig para el tenant de esa organización. Solo envía
// organizationId; todo lo demás se resuelve server-side.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { Loader2, PackageCheck } from "lucide-react";
import { ensureOrganizationRuntimeBaselineAction } from "../actions/ensure-organization-runtime-baseline.action";

const ITEM_LABEL: Record<string, string> = {
  TAX_RATE_IVA_13:          "IVA 13%",
  PRODUCT_CATEGORY_GENERAL: "Categoría GENERAL",
  TENANT_FISCAL_CONFIG:     "Config. fiscal",
};

export interface EnsureOrganizationBaselineButtonProps {
  organizationId:   string;
  organizationCode: string;
  disabled?:        boolean;
}

export function EnsureOrganizationBaselineButton({
  organizationId,
  organizationCode,
  disabled,
}: EnsureOrganizationBaselineButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function handleClick() {
    if (
      !window.confirm(
        `Inicializar/verificar el baseline Commerce de ${organizationCode}. ` +
        "Solo crea lo que falte (IVA 13%, categoría GENERAL, configuración fiscal) para ESTE tenant. ¿Continuar?",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await ensureOrganizationRuntimeBaselineAction(organizationId);
      if (!result.success) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      const created = result.created.map((i) => ITEM_LABEL[i] ?? i);
      setMessage({
        ok:   true,
        text: created.length > 0
          ? `Creado: ${created.join(", ")}.`
          : "Baseline completo (nada que crear).",
      });
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isPending}
        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5
                   border border-emerald-200 rounded-lg text-emerald-700
                   hover:bg-emerald-50 transition-colors disabled:opacity-40
                   disabled:cursor-not-allowed whitespace-nowrap"
        title="Inicializar/verificar baseline Commerce del tenant (idempotente)"
      >
        {isPending ? <Loader2 size={11} className="animate-spin" /> : <PackageCheck size={11} />}
        Baseline Commerce
      </button>
      {message && (
        <span className={`text-[10px] ${message.ok ? "text-emerald-700" : "text-red-600"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
