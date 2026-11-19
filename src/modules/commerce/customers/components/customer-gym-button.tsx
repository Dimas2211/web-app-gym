"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { prepareCustomerGymAction, saveCustomerGymAction } from "../actions/customer-gym.action";

type Prepared = Extract<Awaited<ReturnType<typeof prepareCustomerGymAction>>, { ok: true }>["data"];
const inputClass = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm";
const buttonClass =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export function CustomerGymButton({ customerId }: { customerId: string }) {
  const [data, setData] = useState<Prepared | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    prepareCustomerGymAction(customerId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setData(result.data);
        else setError(result.error);
      })
      .catch(() => {
        if (!cancelled)
          setError("No se pudo cargar el vínculo Gym. Vuelve a seleccionar el cliente.");
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return (
    <div className="border-t border-zinc-100 px-5 py-4">
      {data?.linkedClientId ? (
        <Link
          href={`/dashboard/clients/${data.linkedClientId}`}
          className="text-sm font-semibold text-blue-700 underline"
        >
          Ver cliente de gimnasio
        </Link>
      ) : (
        <button
          type="button"
          className={buttonClass}
          disabled={!data || data.inactive}
          onClick={() => setOpen(true)}
        >
          {data ? "Crear / vincular cliente de gimnasio" : "Cargando cliente Gym…"}
        </button>
      )}
      {data?.inactive && !data.linkedClientId && (
        <p className="mt-2 text-sm text-zinc-500">
          Activa este cliente fiscal para crear su ficha Gym.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {open && data && (
        <GymDialog
          customerId={customerId}
          initial={data}
          onClose={() => setOpen(false)}
          onLinked={(clientId) => {
            setData((previous) =>
              previous ? { ...previous, linkedClientId: clientId } : previous
            );
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function GymDialog({
  customerId,
  initial,
  onClose,
  onLinked,
}: {
  customerId: string;
  initial: Prepared;
  onClose: () => void;
  onLinked: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState(initial.candidates);
  const [search, setSearch] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function save(existingId?: string, form?: HTMLFormElement) {
    setError("");
    const fields = form ? new FormData(form) : null;
    startTransition(async () => {
      try {
        const result = await saveCustomerGymAction({
          customer_id: customerId,
          ...(existingId
            ? { existing_client_id: existingId }
            : {
                first_name: String(fields?.get("first_name") ?? ""),
                last_name: String(fields?.get("last_name") ?? ""),
                branch_id: String(fields?.get("branch_id") ?? ""),
                document_id: String(fields?.get("document_id") ?? ""),
                email: String(fields?.get("email") ?? ""),
                phone: String(fields?.get("phone") ?? ""),
                address: String(fields?.get("address") ?? ""),
              }),
        });
        if (result.ok) onLinked(result.clientId);
        else setError(result.error);
      } catch {
        setError("No se pudo guardar. Intenta nuevamente.");
      }
    });
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="gym-link-title"
      onCancel={(event) => {
        if (pending) event.preventDefault();
        else onClose();
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,640px)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl backdrop:bg-black/40"
    >
      <h2 id="gym-link-title" className="text-lg font-bold">
        Cliente de gimnasio
      </h2>
      <p className="mt-2 text-sm text-zinc-600">
        {initial.defaults.name}. Confirma que se trata de una persona y separa sus nombres y
        apellidos. Si ya tiene ficha Gym, vincúlala abajo.
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Se crea la ficha del gimnasio. La membresía y el acceso al portal se habilitan desde su
        ficha. Los cambios posteriores de datos se realizan en cada maestro.
      </p>
      <fieldset disabled={pending} className="mt-5 space-y-4">
        <legend className="text-sm font-semibold">Vincular ficha existente</legend>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            startTransition(async () => {
              try {
                const result = await prepareCustomerGymAction(customerId, search);
                if (result.ok) setCandidates(result.data.candidates);
                else setError(result.error);
              } catch {
                setError("No se pudo buscar. Intenta nuevamente.");
              }
            });
          }}
        >
          <input
            aria-label="Buscar cliente Gym por nombre, documento o correo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={150}
            placeholder="Nombre, documento o correo"
            className={inputClass}
          />
          <button type="submit" className={buttonClass}>
            Buscar
          </button>
        </form>
        {candidates.length ? (
          <ul className="max-h-48 divide-y divide-zinc-100 overflow-auto rounded-lg border border-zinc-200">
            {candidates.map((candidate) => (
              <li
                key={candidate.id}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {candidate.first_name} {candidate.last_name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {candidate.document_id || candidate.email || "Sin documento ni correo"}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-blue-700 underline disabled:text-zinc-400"
                  disabled={candidate.linked}
                  onClick={() => save(candidate.id)}
                >
                  {candidate.linked ? "Ya vinculado" : "Vincular"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            Sin coincidencias. Puedes buscar otra ficha o crear una nueva.
          </p>
        )}
      </fieldset>
      <form
        className="mt-6 border-t border-zinc-200 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          save(undefined, event.currentTarget);
        }}
      >
        <fieldset disabled={pending} className="space-y-3">
          <legend className="mb-3 text-sm font-semibold">Crear ficha nueva</legend>
          <label className="block text-sm">
            Sucursal
            <select
              name="branch_id"
              required
              defaultValue={initial.branches.length === 1 ? initial.branches[0].id : ""}
              className={inputClass}
            >
              <option value="">Selecciona una sucursal</option>
              {initial.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Nombres
              <input
                name="first_name"
                required
                maxLength={100}
                defaultValue={initial.defaults.first_name}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              Apellidos
              <input
                name="last_name"
                required
                maxLength={100}
                defaultValue={initial.defaults.last_name}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              Documento
              <input
                name="document_id"
                maxLength={50}
                defaultValue={initial.defaults.document_id}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              Correo
              <input
                name="email"
                type="email"
                maxLength={254}
                defaultValue={initial.defaults.email}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              Teléfono
              <input
                name="phone"
                maxLength={30}
                defaultValue={initial.defaults.phone}
                className={inputClass}
              />
            </label>
          </div>
          <label className="block text-sm">
            Dirección
            <input
              name="address"
              maxLength={255}
              defaultValue={initial.defaults.address}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            className={buttonClass}
            disabled={pending || initial.branches.length === 0}
          >
            {pending ? "Guardando…" : "Crear cliente de gimnasio"}
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={onClose}
        className="mt-4 text-sm text-zinc-600 underline disabled:opacity-50"
      >
        Cerrar
      </button>
    </dialog>
  );
}
