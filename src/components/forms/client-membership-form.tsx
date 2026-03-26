"use client";

import { useActionState, useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import type { PaymentStatus, MembershipStatus } from "@prisma/client";
import type { MembershipActionState } from "@/modules/memberships/actions";
import { PAYMENT_STATUS_LABELS, MEMBERSHIP_STATUS_LABELS, ACCESS_TYPE_LABELS } from "@/lib/utils/labels";

type PlanOption = {
  id: string;
  name: string;
  code: string | null;
  price: string;
  duration_days: number;
  access_type: string;
  sessions_limit: number | null;
};

type ClientOption = {
  id: string;
  first_name: string;
  last_name: string;
  document_id: string | null;
};

type BranchOption = { id: string; name: string };

type DefaultValues = {
  id?: string;
  client_id?: string;
  membership_plan_id?: string;
  branch_id?: string;
  start_date?: string;
  price_at_sale?: string;
  discount_amount?: string;
  final_amount?: string;
  payment_status?: PaymentStatus;
  status?: MembershipStatus;
  notes?: string | null;
};

type ClientMembershipFormProps = {
  action: (prev: MembershipActionState, formData: FormData) => Promise<MembershipActionState>;
  defaultValues?: DefaultValues;
  plans: PlanOption[];
  clients: ClientOption[];
  branches: BranchOption[];
  fixedBranchId?: string | null;
  fixedClientId?: string | null;
  isEdit?: boolean;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Guardando..." : isEdit ? "Guardar cambios" : "Asignar membresía"}
    </button>
  );
}

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";
const selectCls = inputCls + " bg-white";

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function ClientMembershipForm({
  action,
  defaultValues,
  plans,
  clients,
  branches,
  fixedBranchId,
  fixedClientId,
  isEdit = false,
}: ClientMembershipFormProps) {
  const [state, formAction] = useActionState(action, undefined);

  const [selectedPlanId, setSelectedPlanId] = useState(
    defaultValues?.membership_plan_id ?? ""
  );
  const [priceAtSale, setPriceAtSale] = useState(
    defaultValues?.price_at_sale ?? "0"
  );
  const [discountAmount, setDiscountAmount] = useState(
    defaultValues?.discount_amount ?? "0"
  );
  const [startDate, setStartDate] = useState(defaultValues?.start_date ?? "");

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  // Auto-fill price when plan changes (only on create)
  useEffect(() => {
    if (!isEdit && selectedPlan) {
      setPriceAtSale(selectedPlan.price);
    }
  }, [selectedPlan, isEdit]);

  const price = parseFloat(priceAtSale) || 0;
  const discount = parseFloat(discountAmount) || 0;
  const finalAmount = Math.max(0, price - discount);
  const estimatedEndDate =
    selectedPlan && startDate ? addDays(startDate, selectedPlan.duration_days) : null;

  return (
    <form action={formAction} className="space-y-6 max-w-lg">
      {isEdit && <input type="hidden" name="id" value={defaultValues?.id} />}

      {/* Sucursal */}
      {fixedBranchId ? (
        <input type="hidden" name="branch_id" value={fixedBranchId} />
      ) : (
        <Field label="Sucursal" required error={state?.errors?.branch_id?.[0]}>
          <select
            name="branch_id"
            required
            defaultValue={defaultValues?.branch_id ?? ""}
            className={selectCls}
          >
            <option value="">Selecciona una sucursal...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Cliente */}
      {fixedClientId ? (
        <input type="hidden" name="client_id" value={fixedClientId} />
      ) : (
        <Field label="Cliente" required error={state?.errors?.client_id?.[0]}>
          <select
            name="client_id"
            required
            defaultValue={defaultValues?.client_id ?? ""}
            className={selectCls}
          >
            <option value="">Selecciona un cliente...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.last_name}, {c.first_name}
                {c.document_id ? ` — ${c.document_id}` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Plan */}
      <Field label="Plan de membresía" required error={state?.errors?.membership_plan_id?.[0]}>
        <select
          name="membership_plan_id"
          required
          value={selectedPlanId}
          onChange={(e) => setSelectedPlanId(e.target.value)}
          className={selectCls}
        >
          <option value="">Selecciona un plan...</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code ? `[${p.code}] ` : ""}
              {p.name} — {p.duration_days}d — ${parseFloat(p.price).toFixed(2)}
            </option>
          ))}
        </select>
        {selectedPlan && (
          <p className="text-xs text-zinc-400 mt-1">
            {ACCESS_TYPE_LABELS[selectedPlan.access_type as keyof typeof ACCESS_TYPE_LABELS]}
            {selectedPlan.sessions_limit
              ? ` · Límite: ${selectedPlan.sessions_limit} sesiones`
              : ""}
          </p>
        )}
      </Field>

      {/* Fecha de inicio y estimada de fin */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Fecha de inicio" required error={state?.errors?.start_date?.[0]}>
          <input
            name="start_date"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <div>
          <p className="text-sm font-medium text-zinc-700 mb-1.5">Fecha de fin estimada</p>
          <div className="border border-zinc-200 rounded-lg px-3.5 py-2.5 text-sm bg-zinc-50 text-zinc-500 min-h-[42px] flex items-center">
            {estimatedEndDate ? formatDate(estimatedEndDate) : "—"}
          </div>
        </div>
      </div>

      {/* Precio, descuento, monto final */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Precio de venta" required error={state?.errors?.price_at_sale?.[0]}>
          <input
            name="price_at_sale"
            type="number"
            min={0}
            step="0.01"
            required
            value={priceAtSale}
            onChange={(e) => setPriceAtSale(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Descuento" error={state?.errors?.discount_amount?.[0]}>
          <input
            name="discount_amount"
            type="number"
            min={0}
            step="0.01"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            className={inputCls}
          />
        </Field>
        <div>
          <p className="text-sm font-medium text-zinc-700 mb-1.5">Monto final</p>
          <div
            className={`border rounded-lg px-3.5 py-2.5 text-sm font-semibold min-h-[42px] flex items-center ${
              finalAmount < 0
                ? "border-red-300 bg-red-50 text-red-700"
                : "border-zinc-200 bg-zinc-50 text-zinc-800"
            }`}
          >
            ${finalAmount.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Estado de pago */}
      <Field label="Estado de pago" required error={state?.errors?.payment_status?.[0]}>
        <select
          name="payment_status"
          required
          defaultValue={defaultValues?.payment_status ?? "pending"}
          className={selectCls}
        >
          {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((s) => (
            <option key={s} value={s}>
              {PAYMENT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </Field>

      {/* Estado de membresía (solo en edición) */}
      {isEdit && (
        <Field label="Estado de membresía" error={state?.errors?.status?.[0]}>
          <select
            name="status"
            defaultValue={defaultValues?.status ?? "active"}
            className={selectCls}
          >
            {(Object.keys(MEMBERSHIP_STATUS_LABELS) as MembershipStatus[]).map((s) => (
              <option key={s} value={s}>
                {MEMBERSHIP_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Notas */}
      <Field label="Notas" error={state?.errors?.notes?.[0]}>
        <textarea
          name="notes"
          rows={2}
          defaultValue={defaultValues?.notes ?? ""}
          placeholder="Observaciones sobre esta membresía..."
          className={inputCls + " resize-none"}
        />
      </Field>

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton isEdit={isEdit} />
        <a
          href="/dashboard/memberships/client-memberships"
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
