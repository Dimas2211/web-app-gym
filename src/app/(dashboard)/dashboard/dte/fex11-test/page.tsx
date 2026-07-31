// ─────────────────────────────────────────────────────────────────
// /dashboard/dte/fex11-test — page.tsx
//
// Microfase F3-C18 — Consola de prueba FEX 11 (interna, solo TEST).
//
// Esta NO es la UI comercial de exportación. Es una consola de prueba
// manual para ejecutar el flujo completo de FEX 11 (crear caso →
// generar JSON → firmar → transmitir MH TEST → MariaDB) desde el
// dashboard, sin tocar el flujo comercial normal de ventas ni el
// selector de tipo DTE.
//
// Guard: requireAdmin (super_admin | branch_admin), igual que
// /dashboard/dte/outgoing. Bloqueada si DTE_FEX11_TEST_ENABLED !== "YES"
// o si NODE_ENV === "production".
// ─────────────────────────────────────────────────────────────────

import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { isFex11TestEnabled }     from "@/modules/commerce/dte/utils/fex11-feature-guard";
import { getDteMhConfig }         from "@/modules/commerce/dte/config/dte-mh.config";
import { getDteSignerConfig }     from "@/modules/commerce/dte/config/dte-signer.config";
import { getExternalDteMariaDbConfig } from "@/modules/commerce/dte/config/external-dte-mariadb.config";
import { Fex11TestConsole } from "@/modules/commerce/dte/fex11-test/components/fex11-test-console";

export const metadata = {
  title: "Consola de prueba FEX 11",
};

export default async function Fex11TestConsolePage() {
  const sessionUser = await requireAdmin();
  const tenantId    = sessionUser.tenant_id;
  const locationId  = await getEffectiveLocationId(sessionUser);

  const flagEnabled   = isFex11TestEnabled();
  const nodeEnv       = process.env.NODE_ENV ?? "unknown";
  const environmentOk = nodeEnv !== "production";
  const consoleEnabled = flagEnabled && environmentOk;

  // Estado de configuración sin exponer secretos — solo presencia.
  const mhConfig     = getDteMhConfig();
  const signerConfig = getDteSignerConfig();
  const mariaDbConfig = getExternalDteMariaDbConfig();

  const signerConfigured = !!signerConfig.signerUrl && !!process.env["DTE_SIGNER_NIT"] && !!process.env["DTE_SIGNER_PASSWORD"];
  const mhConfigured     = !!mhConfig.user && !!mhConfig.password;
  const mariaDbConfigured =
    mariaDbConfig.enabled &&
    !!mariaDbConfig.host &&
    !!mariaDbConfig.user &&
    !!mariaDbConfig.password &&
    !!mariaDbConfig.database &&
    !!mariaDbConfig.table;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Fex11TestConsole
        consoleEnabled={consoleEnabled}
        flagEnabled={flagEnabled}
        nodeEnv={nodeEnv}
        environmentOk={environmentOk}
        hasTenant={!!tenantId}
        hasLocation={!!locationId}
        signerConfigured={signerConfigured}
        mhConfigured={mhConfigured}
        mariaDbConfigured={mariaDbConfigured}
      />
    </div>
  );
}
