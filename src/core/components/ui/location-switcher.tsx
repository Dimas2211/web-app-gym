"use client";

// ─────────────────────────────────────────────────────────────────
// core/components/ui — location-switcher.tsx
//
// Selector de location activa para usuarios globales (super_admin).
// Visible en el header del dashboard cuando el usuario tiene
// scopeType "global" y, por tanto, no tiene location fija en JWT.
//
// Flujo:
//   1. Muestra las locations activas del tenant como un select.
//   2. Al cambiar, llama setActiveLocationAction() (Server Action).
//   3. Tras la confirmación del servidor, llama router.refresh()
//      para que todas las páginas carguen con el nuevo contexto.
//
// Props resueltas en el servidor (layout.tsx):
//   - locations: lista de LocationOption del tenant
//   - activeLocationId: valor actual de la cookie (puede ser null)
//
// La UI se mantiene intencionalmente sobria — vive en el header
// del dashboard que ya tiene color de fondo oscuro (zinc-900).
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ChevronDown, Loader2 } from "lucide-react";
import { setActiveLocationAction } from "@/core/modules/locations/set-active-location.action";
import type { LocationOption } from "@/core/modules/locations/types";

const ACTIVE_LOCATION_COOKIE = "active_location_id";

// ── Props ─────────────────────────────────────────────────────────

interface LocationSwitcherProps {
  locations: LocationOption[];
  activeLocationId: string | null;
}

// ── Componente ────────────────────────────────────────────────────

export function LocationSwitcher({
  locations,
  activeLocationId,
}: LocationSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Estado local optimista — refleja el cambio antes de que el servidor confirme.
  const [currentId, setCurrentId] = useState<string | null>(activeLocationId);

  if (locations.length === 0) return null;

  async function handleChange(locationId: string) {
    if (locationId === currentId || !locationId) return;

    // Actualización optimista: mostrar el nuevo nombre inmediatamente
    setCurrentId(locationId);

    const result = await setActiveLocationAction(locationId);

    if (!result.ok) {
      // Revertir si el servidor rechazó el cambio
      setCurrentId(currentId);
      console.warn("[LocationSwitcher] Error al cambiar location:", result.error);
      return;
    }

    document.cookie = `${ACTIVE_LOCATION_COOKIE}=${encodeURIComponent(locationId)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;

    // Recargar todas las páginas del dashboard con el nuevo contexto operativo.
    // router.refresh() vuelve a correr los Server Components sin perder estado client.
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <MapPin size={12} className="text-zinc-500 shrink-0" />

      <div className="relative">
        <select
          value={currentId ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isPending}
          aria-label="Location de trabajo activa"
          className="appearance-none bg-zinc-800 text-xs text-zinc-200
                     pl-2 pr-6 py-1 rounded border border-zinc-700
                     focus:outline-none focus:ring-1 focus:ring-zinc-500
                     disabled:opacity-50 cursor-pointer
                     hover:bg-zinc-700 transition-colors"
        >
          {/* Placeholder si no hay location activa */}
          {!currentId && (
            <option value="" disabled>
              Seleccionar sede…
            </option>
          )}

          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        {/* Ícono de chevron — posicionado sobre el select */}
        <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2">
          {isPending ? (
            <Loader2 size={10} className="text-zinc-400 animate-spin" />
          ) : (
            <ChevronDown size={10} className="text-zinc-400" />
          )}
        </div>
      </div>
    </div>
  );
}
