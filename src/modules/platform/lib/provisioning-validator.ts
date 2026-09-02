// ─────────────────────────────────────────────────────────────────
// platform — provisioning-validator.ts
//
// Motor de validación de provisioning.
// Función pura — sin side effects, sin acceso a DB.
// Determina si una organización está lista para desplegarse.
// ─────────────────────────────────────────────────────────────────

import type {
  ProvisioningCheckItem,
  ProvisioningValidationResult,
  PlatformOrganizationDetail,
  PlatformBrandingData,
  OrganizationModuleItem,
} from "../types/platform.types";

interface ValidatorInput {
  org:     PlatformOrganizationDetail;
  branding: PlatformBrandingData | null;
  modules:  OrganizationModuleItem[];
}

// ── Checks individuales ───────────────────────────────────────────

function checkOrganizationName(org: PlatformOrganizationDetail): ProvisioningCheckItem {
  const passed = Boolean(org.name?.trim());
  return {
    key:     "org_name",
    label:   "Nombre de organización",
    passed,
    message: passed ? null : "El nombre de la organización es obligatorio.",
  };
}

function checkOrganizationCode(org: PlatformOrganizationDetail): ProvisioningCheckItem {
  const passed = Boolean(org.code?.trim());
  return {
    key:     "org_code",
    label:   "Código de organización",
    passed,
    message: passed ? null : "El código de la organización es obligatorio.",
  };
}

// Bloque A, FASE A11 — vertical es OPCIONAL. Commerce es transversal y una
// organización puede operar sin vertical (vertical_id = null) sin que eso
// sea un error de provisioning. NO se usa "GENERAL" como fallback — ver
// docs/context/current-state.md. Si la organización sí tiene una vertical
// asignada, se sigue validando que exista (org.vertical no vacío ya lo
// garantiza al venir de la relación real).
function checkVertical(org: PlatformOrganizationDetail): ProvisioningCheckItem {
  if (!org.vertical) {
    return {
      key:     "vertical",
      label:   "Vertical",
      passed:  true,
      message: "No aplica — organización transversal (Commerce sin vertical).",
    };
  }
  return {
    key:     "vertical",
    label:   "Vertical asignada",
    passed:  true,
    message: null,
  };
}

function checkPlan(org: PlatformOrganizationDetail): ProvisioningCheckItem {
  const passed = Boolean(org.plan);
  return {
    key:     "plan",
    label:   "Plan asignado",
    passed,
    message: passed ? null : "Debe asignar un plan a la organización.",
  };
}

function checkLicenseStatus(org: PlatformOrganizationDetail): ProvisioningCheckItem {
  const validStatuses = ["TRIAL", "ACTIVE"];
  const passed = validStatuses.includes(org.license_status);
  return {
    key:     "license_status",
    label:   "Estado de licencia válido",
    passed,
    message: passed
      ? null
      : `La licencia tiene estado "${org.license_status}". Solo TRIAL o ACTIVE permiten provisioning.`,
  };
}

function checkLicenseDates(org: PlatformOrganizationDetail): ProvisioningCheckItem {
  const now = new Date();

  // Si está en TRIAL: verificar que trial_ends_at no haya vencido
  if (org.license_status === "TRIAL") {
    if (org.trial_ends_at && new Date(org.trial_ends_at) < now) {
      return {
        key:     "license_dates",
        label:   "Fechas de licencia válidas",
        passed:  false,
        message: "El período de trial ya venció.",
      };
    }
  }

  // Si está en ACTIVE: verificar que license_expires_at no haya vencido
  if (org.license_status === "ACTIVE") {
    if (org.license_expires_at && new Date(org.license_expires_at) < now) {
      return {
        key:     "license_dates",
        label:   "Fechas de licencia válidas",
        passed:  false,
        message: "La licencia ya expiró.",
      };
    }
  }

  return {
    key:     "license_dates",
    label:   "Fechas de licencia válidas",
    passed:  true,
    message: null,
  };
}

function checkBranding(branding: PlatformBrandingData | null): ProvisioningCheckItem {
  const hasBranding =
    branding !== null &&
    Boolean(branding.primary_color || branding.logo_url || branding.custom_domain);
  return {
    key:     "branding",
    label:   "Branding configurado",
    passed:  hasBranding,
    message: hasBranding ? null : "Configure al menos color primario, logo o dominio personalizado.",
  };
}

function checkModules(modules: OrganizationModuleItem[]): ProvisioningCheckItem {
  const activeCount = modules.filter((m) => m.is_active).length;
  const passed = activeCount > 0;
  return {
    key:     "modules",
    label:   "Módulos configurados",
    passed,
    message: passed ? null : "Debe activar al menos un módulo para la organización.",
  };
}

function checkDeploymentConfig(org: PlatformOrganizationDetail): ProvisioningCheckItem {
  // deployment_url e instance_identifier son opcionales en este stage,
  // pero si uno está, el otro también debería estarlo.
  const hasUrl = Boolean(org.deployment_url?.trim());
  const hasId  = Boolean(org.instance_identifier?.trim());

  if ((hasUrl && !hasId) || (!hasUrl && hasId)) {
    return {
      key:     "deployment_config",
      label:   "Configuración de despliegue",
      passed:  false,
      message: "Si configura deployment_url, también debe configurar instance_identifier, y viceversa.",
    };
  }

  return {
    key:     "deployment_config",
    label:   "Configuración de despliegue",
    passed:  true,
    message: null,
  };
}

// ── Motor principal ───────────────────────────────────────────────

export function validateProvisioning(input: ValidatorInput): ProvisioningValidationResult {
  const { org, branding, modules } = input;

  const checks: ProvisioningCheckItem[] = [
    checkOrganizationName(org),
    checkOrganizationCode(org),
    checkVertical(org),
    checkPlan(org),
    checkLicenseStatus(org),
    checkLicenseDates(org),
    checkBranding(branding),
    checkModules(modules),
    checkDeploymentConfig(org),
  ];

  const allPassed = checks.every((c) => c.passed);

  return {
    status: allPassed ? "READY" : "NOT_READY",
    checks,
  };
}
