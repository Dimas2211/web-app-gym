"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — mh-territory-preview.tsx
//
// MH20 (Fase 7, IMP20-028) — vista previa INFORMATIVA de cómo se proyecta
// una dirección guardada (dept_code + municipality_code) a la organización
// territorial MH 2.0: departamento CAT-012 · municipio CAT-013 · distrito
// CAT-008. Usa la proyección canónica pura (mh-territory-combinations).
//
// No bloquea ni modifica nada: el registro conserva sus códigos históricos;
// los datos incompatibles muestran un mensaje claro y solo la emisión 2.0
// (builders/preflight) los rechaza. Reutilizable por Clientes, Proveedores
// y Emisor DTE.
// ─────────────────────────────────────────────────────────────────

import { previewMhTerritory } from "../utils/mh-territory-combinations";

interface MhTerritoryPreviewProps {
  deptCode:         string | null | undefined;
  municipalityCode: string | null | undefined;
  className?:       string;
}

export function MhTerritoryPreview({ deptCode, municipalityCode, className }: MhTerritoryPreviewProps) {
  const v20 = previewMhTerritory({ deptCode, municipalityCode }, "MH_2_0");
  if (v20.status === "NO_ADDRESS") return null;
  if (v20.status === "INVALID") {
    return (
      <span className={`block text-[11px] text-amber-600 ${className ?? ""}`} data-testid="mh-territory-preview">
        Proyección MH 2.0: no disponible ({v20.code}). {v20.message} No bloquea otras operaciones; la emisión de DTE con
        perfil MH 2.0 la rechazará hasta corregir la dirección.
      </span>
    );
  }
  const v12 = previewMhTerritory({ deptCode, municipalityCode }, "MH_1_2");
  const prev = v12.status === "OK" ? v12.territory.municipio : null;
  return (
    <span className={`block text-[11px] text-zinc-500 ${className ?? ""}`} data-testid="mh-territory-preview">
      Proyección MH 2.0 (informativa): depto <span className="font-mono">{v20.territory.departamento}</span> · municipio{" "}
      <span className="font-mono">{v20.territory.municipio}</span> ({v20.municipalityName}) · distrito{" "}
      <span className="font-mono">{v20.territory.distrito}</span> ({v20.districtName}).
      {v20.changedFromV1_2 && prev && (
        <span className="text-amber-600">
          {" "}El código de municipio 2.0 difiere del 1.2 ({prev}) por el cambio oficial de CAT-013 v1.1; el registro no se modifica.
        </span>
      )}
      {v20.review.includes("REVIEW_LABEL") && <span className="text-amber-600"> Etiqueta distinta en el catálogo 2.0 (revisión).</span>}
    </span>
  );
}
