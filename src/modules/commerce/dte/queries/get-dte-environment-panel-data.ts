// ─────────────────────────────────────────────────────────────────
// commerce/dte — get-dte-environment-panel-data.ts
//
// Datos consolidados para la pantalla /dashboard/settings/dte
// (Facturación Electrónica). Combina DteIssuerConfig + estado de
// DteCredential (sanitizado) + preflight de PRODUCTION.
//
// Nunca devuelve secretos — getDteCredentialStatus ya sanitiza.
// ─────────────────────────────────────────────────────────────────

import { listDteIssuerConfigs } from "./list-dte-issuer-configs";
import { getDteCredentialStatus, type DteCredentialStatus } from "../services/dte-credential.service";
import { getDteProductionPreflight, type DteProductionPreflightResult } from "../services/dte-production-preflight.service";
import type { DteIssuerConfigDetail, DteEnvironment } from "../types/dte.types";

export interface DteEnvironmentPanelEntry {
  environment:  DteEnvironment;
  config:       DteIssuerConfigDetail | null;
  credential:   DteCredentialStatus | null;
  /** Solo se calcula para PRODUCTION. */
  preflight:    DteProductionPreflightResult | null;
}

export interface DteEnvironmentPanelData {
  active_environment: DteEnvironment | null;
  active_count:       number;
  test:               DteEnvironmentPanelEntry;
  production:         DteEnvironmentPanelEntry;
}

export async function getDteEnvironmentPanelData(
  tenant_id:   string,
  location_id: string,
): Promise<DteEnvironmentPanelData> {
  const configs = await listDteIssuerConfigs({ tenant_id, location_id });

  const testConfig = configs.find((c) => c.environment === "TEST") ?? null;
  const prodConfig = configs.find((c) => c.environment === "PRODUCTION") ?? null;

  const [testCredential, prodCredential, prodPreflight] = await Promise.all([
    testConfig ? getDteCredentialStatus(testConfig.id) : Promise.resolve(null),
    prodConfig ? getDteCredentialStatus(prodConfig.id) : Promise.resolve(null),
    getDteProductionPreflight(tenant_id, location_id),
  ]);

  const activeConfig = configs.find((c) => c.is_active) ?? null;
  const activeCount  = configs.filter((c) => c.is_active).length;

  return {
    active_environment: activeConfig?.environment ?? null,
    active_count:        activeCount,
    test: {
      environment: "TEST",
      config:      testConfig,
      credential:  testCredential,
      preflight:   null,
    },
    production: {
      environment: "PRODUCTION",
      config:      prodConfig,
      credential:  prodCredential,
      preflight:   prodPreflight,
    },
  };
}
