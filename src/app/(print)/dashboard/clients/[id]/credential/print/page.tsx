/**
 * /dashboard/clients/[id]/credential/print
 *
 * Vista de impresión de la credencial de un Client en tamaño CR80
 * (85.60 mm × 53.98 mm). Solo la tarjeta — sin dashboard/nav/sidebar.
 * Imprimible y compatible con "Guardar como PDF" del navegador.
 *
 * Mismo scope que la pantalla de gestión (loadClientCredential): tenant/DB
 * efectivos + canManageClient con identidad efectiva. Lectura: funciona
 * también bajo Support Session (no escribe nada).
 *
 * Las reglas @page / @media print se emiten SOLO en esta ruta — no afectan
 * la impresión de DTE, reportes, caja, etc.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireClientManager } from "@/lib/permissions/guards";
import { CredentialCard, CR80_WIDTH_MM, CR80_HEIGHT_MM } from "@/components/ui/credential-card";
import { PrintButton } from "@/components/ui/print-button";
import { loadClientCredential } from "@/modules/clients/credential";
import { requireEffectiveVertical } from "@/modules/platform/runtime/effective-vertical";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Credencial", robots: { index: false } };

type Props = { params: Promise<{ id: string }> };

const PRINT_CSS = `
@page { size: ${CR80_WIDTH_MM}mm ${CR80_HEIGHT_MM}mm; margin: 0; }
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: ${CR80_WIDTH_MM}mm;
    height: ${CR80_HEIGHT_MM}mm;
    overflow: hidden;
    background: #fff !important;
  }
  .credential-print-toolbar { display: none !important; }
  .credential-print-sheet { padding: 0 !important; min-height: 0 !important; display: block !important; }
  .credential-print-sheet .credential-card { box-shadow: none !important; border-radius: 0 !important; }
}
`;

export default async function ClientCredentialPrintPage({ params }: Props) {
  const sessionUser = await requireClientManager();
  const { id } = await params;

  const result = await loadClientCredential(sessionUser, id);
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return <p className="p-6 text-sm text-amber-800">{result.message}</p>;
  }
  const { client, gym, tenantId } = result.data;
  await requireEffectiveVertical(tenantId, "GYM");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="credential-print-toolbar flex flex-wrap items-center justify-between gap-3 bg-white border-b border-zinc-200 px-4 py-3">
        <p className="text-sm text-zinc-600 min-w-0">
          Credencial CR80 · {client.first_name} {client.last_name}
          <span className="block text-xs text-zinc-400">
            En el diálogo de impresión usa escala 100% y sin márgenes.
          </span>
        </p>
        <div className="w-48">
          <PrintButton />
        </div>
      </div>

      <main className="credential-print-sheet flex justify-center px-4 py-10">
        <CredentialCard
          person={{
            id: client.id,
            first_name: client.first_name,
            last_name: client.last_name,
            operational_code: client.operational_code,
            avatar_url: client.avatar_url,
            qr_token: client.qr_token,
            status: client.status,
            typeLabel: "Cliente",
            branchName: client.branchName,
          }}
          gymName={gym?.name ?? "Gimnasio"}
          logoUrl={gym?.logo_url}
        />
      </main>
    </>
  );
}
