/**
 * Componente servidor — tarjeta de credencial / carnet.
 *
 * Dimensiones físicas CR80 (85.60 mm × 53.98 mm) en unidades mm, idénticas
 * en pantalla y en la vista de impresión dedicada
 * (/dashboard/clients/[id]/credential/print). No depende de reglas de
 * impresión globales.
 *
 * Uso:
 *   <CredentialCard person={...} gymName="..." logoUrl={gym.logo_url} />
 */
import Image from "next/image";
import { QrCodeDisplay } from "./qr-code-display";
import { StatusBadge } from "./status-badge";
import type { Status, UserRole } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/utils/roles";

export const CR80_WIDTH_MM = 85.6;
export const CR80_HEIGHT_MM = 53.98;

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
  logoUrl?: string | null;
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

const printExact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;

export function CredentialCard({ person, gymName, logoUrl }: CredentialCardProps) {
  const fullName = `${person.first_name} ${person.last_name}`;
  const initials = getInitials(person.first_name, person.last_name);
  const typeLabel =
    person.typeLabel ??
    (person.role ? ROLE_LABELS[person.role] : "Miembro");

  return (
    <div
      className="credential-card bg-white rounded-[3mm] border border-zinc-300 shadow-lg overflow-hidden flex flex-col shrink-0"
      style={{
        width: `${CR80_WIDTH_MM}mm`,
        height: `${CR80_HEIGHT_MM}mm`,
        fontFamily: "system-ui, sans-serif",
        breakInside: "avoid",
        ...printExact,
      }}
    >
      {/* Header — gimnasio / sucursal / estado */}
      <div
        className="bg-zinc-900 flex items-center justify-between gap-[2mm]"
        style={{ height: "11mm", padding: "0 3.5mm", ...printExact }}
      >
        <div className="flex items-center gap-[2mm] min-w-0">
          {logoUrl && (
            <div
              className="bg-white rounded-[1mm] overflow-hidden shrink-0 flex items-center justify-center"
              style={{ width: "7mm", height: "7mm" }}
            >
              <Image
                src={logoUrl}
                alt={gymName}
                width={28}
                height={28}
                className="w-full h-full object-contain"
                unoptimized
              />
            </div>
          )}
          <div className="min-w-0">
            <p
              className="text-white font-semibold uppercase tracking-wider truncate leading-tight"
              style={{ fontSize: "2.6mm" }}
            >
              {gymName}
            </p>
            {person.branchName && (
              <p className="text-zinc-400 truncate leading-tight" style={{ fontSize: "2.1mm" }}>
                {person.branchName}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 scale-90 origin-right">
          <StatusBadge status={person.status} />
        </div>
      </div>

      {/* Cuerpo — foto / datos / QR */}
      <div className="flex-1 flex items-center gap-[3mm]" style={{ padding: "3mm 3.5mm" }}>
        {/* Foto / Iniciales */}
        <div
          className="shrink-0 rounded-[1.5mm] overflow-hidden border border-zinc-200 bg-zinc-100 flex items-center justify-center"
          style={{ width: "21mm", height: "26mm", ...printExact }}
        >
          {person.avatar_url ? (
            <Image
              src={person.avatar_url}
              alt={fullName}
              width={160}
              height={198}
              className="w-full h-full object-cover"
              unoptimized
            />
          ) : (
            <span className="font-bold text-zinc-500" style={{ fontSize: "7mm" }}>
              {initials}
            </span>
          )}
        </div>

        {/* Datos */}
        <div className="flex-1 min-w-0 self-stretch flex flex-col justify-center">
          <p
            className="font-bold text-zinc-900 leading-tight line-clamp-2 break-words"
            style={{ fontSize: "3.3mm" }}
          >
            {fullName}
          </p>
          <p className="text-zinc-500 mt-[0.8mm]" style={{ fontSize: "2.4mm" }}>
            {typeLabel}
          </p>
          <div className="mt-[2.2mm]">
            <p className="text-zinc-400 uppercase tracking-wide" style={{ fontSize: "1.9mm" }}>
              Código
            </p>
            <p
              className="font-mono font-bold text-zinc-900 leading-tight"
              style={{ fontSize: "3.6mm" }}
            >
              {person.operational_code ?? "—"}
            </p>
          </div>
        </div>

        {/* QR — codifica el qr_token estable; el token no se muestra en texto */}
        {person.qr_token && (
          <div className="shrink-0 flex flex-col items-center gap-[0.8mm]">
            <div className="bg-white" style={{ width: "21mm", height: "21mm" }}>
              <QrCodeDisplay
                token={person.qr_token}
                size={80}
                className="[&>svg]:w-full [&>svg]:h-full w-full! h-full!"
              />
            </div>
            <p
              className="text-zinc-400 text-center leading-tight"
              style={{ fontSize: "1.7mm", width: "21mm" }}
            >
              QR de identificación
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
