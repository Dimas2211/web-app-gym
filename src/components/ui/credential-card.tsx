/**
 * Componente servidor — tarjeta de credencial / carnet digital.
 * Diseñado para visualización en pantalla y para impresión via Ctrl+P.
 *
 * Uso:
 *   <CredentialCard person={...} gymName="..." />
 */
import Image from "next/image";
import { QrCodeDisplay } from "./qr-code-display";
import { StatusBadge } from "./status-badge";
import type { Status, UserRole } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/utils/roles";

export interface CredentialPerson {
  id: string;
  first_name: string;
  last_name: string;
  operational_code: string | null;
  avatar_url: string | null;
  qr_token: string | null;
  status: Status;
  /** Para usuarios: su rol */
  role?: UserRole;
  /** Etiqueta de tipo personalizada (ej: "Cliente") */
  typeLabel?: string;
  branchName?: string;
}

interface CredentialCardProps {
  person: CredentialPerson;
  gymName: string;
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export function CredentialCard({ person, gymName }: CredentialCardProps) {
  const fullName = `${person.first_name} ${person.last_name}`;
  const initials = getInitials(person.first_name, person.last_name);
  const typeLabel =
    person.typeLabel ??
    (person.role ? ROLE_LABELS[person.role] : "Miembro");

  return (
    <div
      className="credential-card bg-white rounded-2xl border-2 border-zinc-200 shadow-lg overflow-hidden"
      style={{ width: 340, fontFamily: "system-ui, sans-serif" }}
    >
      {/* Header — banda superior con color */}
      <div className="bg-zinc-900 px-5 py-3 flex items-center justify-between">
        <div>
          <p className="text-white text-xs font-semibold uppercase tracking-widest">
            {gymName}
          </p>
          {person.branchName && (
            <p className="text-zinc-400 text-xs mt-0.5">{person.branchName}</p>
          )}
        </div>
        <StatusBadge status={person.status} />
      </div>

      {/* Cuerpo */}
      <div className="px-5 py-4 flex gap-4">
        {/* Foto / Iniciales */}
        <div className="shrink-0">
          {person.avatar_url ? (
            <div className="w-20 h-20 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100">
              <Image
                src={person.avatar_url}
                alt={fullName}
                width={80}
                height={80}
                className="w-full h-full object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center">
              <span className="text-2xl font-bold text-zinc-500">{initials}</span>
            </div>
          )}
        </div>

        {/* Datos */}
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-zinc-900 leading-tight truncate">
            {fullName}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">{typeLabel}</p>

          <div className="mt-3 space-y-1">
            {person.operational_code && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Código</span>
                <span className="font-mono text-sm font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded">
                  {person.operational_code}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* QR */}
      {person.qr_token && (
        <div className="border-t border-zinc-100 px-5 py-4 flex items-center gap-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-1">
            <QrCodeDisplay token={person.qr_token} size={100} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Escanea para validar identidad o registrar asistencia.
            </p>
            <p className="text-xs font-mono text-zinc-300 mt-1 truncate">
              {person.qr_token.slice(0, 18)}…
            </p>
          </div>
        </div>
      )}

      {!person.operational_code && !person.qr_token && (
        <div className="border-t border-zinc-100 px-5 py-3">
          <p className="text-xs text-zinc-400 text-center">Sin código operativo asignado</p>
        </div>
      )}
    </div>
  );
}
