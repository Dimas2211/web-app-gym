// ─────────────────────────────────────────────────────────────────
// platform — platform.types.ts
//
// Tipos TypeScript del dominio Platform.
// Espeja los modelos Prisma pero sin depender de @prisma/client
// directamente en capas de UI. Los enums se replican aquí como
// string unions para evitar acoplamiento.
// ─────────────────────────────────────────────────────────────────

// ── Enums Platform ────────────────────────────────────────────────

export type PlatformOrganizationStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "CANCELLED";

export type PlatformLicenseStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "EXPIRED" | "CANCELLED";

export type PlatformBillingCycle = "MONTHLY" | "ANNUAL" | "LIFETIME" | "NONE";

export type PlatformModuleCategory = "CORE" | "COMMERCE" | "VERTICAL" | "INTEGRATION";

export type PlatformModuleStatus = "AVAILABLE" | "COMING_SOON" | "DEPRECATED";

export type PlatformDeploymentStatus = "SUCCESS" | "FAILED" | "ROLLBACK";

export type PlatformProvisioningStatus =
  | "NOT_READY"
  | "READY"
  | "PROVISIONED"
  | "DEPLOYED"
  | "FAILED";

// BLOQUE A — Modelo comercial y entitlements
export type PlatformEntitlementValueType  = "COUNT" | "BOOLEAN";
export type PlatformEntitlementPeriodType = "NONE" | "MONTHLY";

// ── PlatformVertical ─────────────────────────────────────────────

export interface PlatformVerticalItem {
  id:          string;
  code:        string;
  name:        string;
  description: string | null;
  is_active:   boolean;
  created_at:  Date;
}

// ── PlatformPlan ─────────────────────────────────────────────────

export interface PlatformPlanItem {
  id:            string;
  code:          string;
  name:          string;
  description:   string | null;
  billing_cycle: PlatformBillingCycle;
  price_monthly: number | null;
  price_annual:  number | null;
  max_locations: number | null;
  max_users:     number | null;
  is_active:     boolean;
  created_at:    Date;
  // Bloque A — baseline del plan, cargado junto al listado para alimentar
  // el formulario de edición sin queries adicionales desde el cliente.
  modules:      PlanModuleItem[];
  entitlements: PlanEntitlementItem[];
}

// ── PlatformPlanModule (Bloque A) ─────────────────────────────────

export interface PlanModuleItem {
  module_id:  string;
  is_enabled: boolean;
}

// ── PlatformEntitlementDefinition (Bloque A) ──────────────────────

export interface PlatformEntitlementDefinitionItem {
  id:          string;
  code:        string;
  name:        string;
  description: string | null;
  category:    string;
  value_type:  PlatformEntitlementValueType;
  period_type: PlatformEntitlementPeriodType;
  is_active:   boolean;
  created_at:  Date;
}

// ── PlatformPlanEntitlement (Bloque A) ────────────────────────────

export interface PlanEntitlementItem {
  entitlement_definition_id: string;
  numeric_value:              number | null;
  is_unlimited:                boolean;
}

// ── PlatformOrganizationEntitlementOverride (Bloque A) ────────────

export interface OrganizationEntitlementOverrideItem {
  id:                         string;
  organization_id:            string;
  entitlement_definition_id:  string;
  numeric_value:               number | null;
  is_unlimited:                 boolean;
  created_at:                  Date;
  updated_at:                  Date;
}

// ── Resolver de configuración efectiva (Bloque A, FASE A6) ────────
//
// Todavía NO se usan como guard de runtime — solo lectura/UI admin.

export type EntitlementSource = "PLAN" | "ORGANIZATION_OVERRIDE" | "UNCONFIGURED";

export interface EffectiveEntitlement {
  entitlement_definition_id: string;
  code:          string;
  name:          string;
  category:      string;
  value_type:    PlatformEntitlementValueType;
  period_type:   PlatformEntitlementPeriodType;
  numeric_value: number | null; // null cuando is_unlimited=true o UNCONFIGURED
  is_unlimited:  boolean;
  source:        EntitlementSource;
}

export type ModuleSource = "PLAN" | "ORGANIZATION_OVERRIDE_ADDED" | "ORGANIZATION_OVERRIDE_REMOVED" | "UNCONFIGURED";

export interface EffectiveModule {
  module_id: string;
  code:      string;
  name:      string;
  category:  PlatformModuleCategory;
  is_core:   boolean;
  enabled:   boolean;
  source:    ModuleSource;
}

// ── PlatformOrganization ──────────────────────────────────────────

export interface PlatformOrganizationListItem {
  id:                  string;
  code:                string;
  name:                string;
  legal_name:          string | null;
  tenant_id:           string | null;
  status:              PlatformOrganizationStatus;
  license_status:      PlatformLicenseStatus;
  billing_cycle:       PlatformBillingCycle;
  provisioning_status: PlatformProvisioningStatus;
  country_code:        string | null;
  timezone:            string | null;
  vertical:            { id: string; code: string; name: string } | null;
  plan:                { id: string; code: string; name: string } | null;
  created_at:          Date;
}

export interface PlatformOrganizationDetail extends PlatformOrganizationListItem {
  nit:                  string | null;
  domain:               string | null;
  logo_url:             string | null;
  trial_ends_at:        Date | null;
  license_expires_at:   Date | null;
  deployment_url:       string | null;
  instance_identifier:  string | null;
  suspended_at:         Date | null;
  suspension_reason:    string | null;
  updated_at:           Date;
}

// ── PlatformModule ────────────────────────────────────────────────

export interface PlatformModuleItem {
  id:          string;
  code:        string;
  name:        string;
  description: string | null;
  category:    PlatformModuleCategory;
  status:      PlatformModuleStatus;
  version:     string;
  is_core:     boolean;
  vertical_id: string | null;
  vertical:    { code: string; name: string } | null;
  created_at:  Date;
}

// ── PlatformOrganizationModule ────────────────────────────────────

export interface OrganizationModuleItem {
  id:              string;
  organization_id: string;
  module_id:       string;
  module:          { code: string; name: string; category: PlatformModuleCategory };
  is_active:       boolean;
  activated_at:    Date;
  deactivated_at:  Date | null;
}

// ── PlatformBranding ──────────────────────────────────────────────

export interface PlatformBrandingData {
  id:              string;
  organization_id: string;
  primary_color:   string | null;
  secondary_color: string | null;
  logo_url:        string | null;
  favicon_url:     string | null;
  custom_domain:   string | null;
  updated_at:      Date;
}

// ── PlatformDeploymentLog ─────────────────────────────────────────

export interface PlatformDeploymentLogItem {
  id:              string;
  organization_id: string;
  action:          string;
  status:          PlatformDeploymentStatus;
  notes:           string | null;
  metadata:        Record<string, unknown> | null;
  triggered_by:    string | null;
  started_at:      Date;
  ended_at:        Date | null;
  created_at:      Date;
}

// ── Resultados de listas ──────────────────────────────────────────

export interface PlatformListResult<T> {
  items:      T[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

// ── Filtros de listado ────────────────────────────────────────────

export interface PlatformOrganizationFilters {
  search?:         string;
  status?:         PlatformOrganizationStatus;
  license_status?: PlatformLicenseStatus;
  vertical_id?:    string;
  plan_id?:        string;
  page_size?:      number;
}

export interface PlatformModuleFilters {
  category?:   PlatformModuleCategory;
  status?:     PlatformModuleStatus;
  vertical_id?: string;
  page_size?:  number;
}

// ── Provisioning ──────────────────────────────────────────────────

// Un ítem de validación individual del checklist
export interface ProvisioningCheckItem {
  key:     string;   // identificador único del check
  label:   string;   // texto visible
  passed:  boolean;
  message: string | null;  // detalle del error si no pasó
}

// Resultado del motor de validación
export interface ProvisioningValidationResult {
  status: "READY" | "NOT_READY";
  checks: ProvisioningCheckItem[];
}

// ── Database Preflight ─────────────────────────────────────────────

export type PreflightCheckSeverity  = "BLOCKER" | "WARNING" | "INFO";
export type PreflightCheckStatus    = "PASS" | "FAIL" | "WARN";
export type PreflightCheckScope     = "GLOBAL" | "TENANT" | "LOCATION" | "MODULE";
export type DatabasePreflightStatus = "READY" | "PARTIAL" | "NOT_READY";

// Tipo de base evaluada — determina la severidad de checks platform
// CONTROL_PLANE: base que aloja Platform Admin (platform_modules, verticals, plans → BLOCKER)
// CLIENT_RUNTIME: base operativa de un cliente (platform checks → WARNING o ignorados)
// DEMO:          base mixta demo (misma semántica que UNKNOWN para checks platform)
// UNKNOWN:       no definido — modo conservador, platform checks como WARNING
export type DatabasePreflightTargetType =
  | "CONTROL_PLANE"
  | "CLIENT_RUNTIME"
  | "DEMO"
  | "UNKNOWN";

export interface PreflightCheckItem {
  code:        string;
  label:       string;
  severity:    PreflightCheckSeverity;
  status:      PreflightCheckStatus;
  scope:       PreflightCheckScope;
  message:     string;
  remediation: string;
}

export interface PreflightSummary {
  totalChecks: number;
  passed:      number;
  failed:      number;
  warnings:    number;
}

export interface DatabasePreflightResult {
  status:     DatabasePreflightStatus;
  targetType: DatabasePreflightTargetType;
  summary:    PreflightSummary;
  checks:     PreflightCheckItem[];
}

export interface DatabasePreflightInput {
  tenantId?:          string;
  locationId?:        string;
  activeModuleCodes?: string[];
  verticalCode?:      string;
  targetType?:        DatabasePreflightTargetType;
}

// Configuración de provisioning generada
export interface ProvisioningConfiguration {
  organization_code:   string;
  organization_name:   string;
  legal_name:          string | null;
  nit:                 string | null;
  country_code:        string | null;
  timezone:            string | null;
  tenant_id:           string | null;
  plan:                { code: string; name: string } | null;
  vertical:            { code: string; name: string } | null;
  billing_cycle:       PlatformBillingCycle;
  license_status:      PlatformLicenseStatus;
  trial_ends_at:       Date | null;
  license_expires_at:  Date | null;
  branding: {
    primary_color:   string | null;
    secondary_color: string | null;
    logo_url:        string | null;
    favicon_url:     string | null;
    custom_domain:   string | null;
  } | null;
  active_modules: { code: string; name: string; category: PlatformModuleCategory }[];
  deployment_url:      string | null;
  instance_identifier: string | null;
}

// Provisioning Package completo
export interface ProvisioningPackage {
  generated_at:    Date;
  organization_id: string;
  config:          ProvisioningConfiguration;
  validation:      ProvisioningValidationResult;
  provisioning_status: PlatformProvisioningStatus;
}

// Log de provisioning
export interface PlatformProvisioningLogItem {
  id:              string;
  organization_id: string;
  result:          PlatformProvisioningStatus;
  triggered_by:    string | null;
  validation_errors: unknown[] | null;
  notes:           string | null;
  created_at:      Date;
}

// Organización con estado de provisioning para la tabla
export interface ProvisioningOrganizationItem {
  id:                  string;
  code:                string;
  name:                string;
  status:              PlatformOrganizationStatus;
  license_status:      PlatformLicenseStatus;
  provisioning_status: PlatformProvisioningStatus;
  vertical:            { code: string; name: string } | null;
  plan:                { code: string; name: string } | null;
  created_at:          Date;
}

// ── Deployment Bundle ─────────────────────────────────────────────

export type DeploymentExportType = "DEPLOYMENT_BUNDLE" | "CONFIGURATION_PACKAGE";

export type DeploymentExportResult = "SUCCESS" | "FAILED";

export interface DeploymentBundleOrganization {
  id:          string;
  code:        string;
  name:        string;
  legal_name:  string | null;
  nit:         string | null;
  tenant_id:   string | null;
  country_code: string | null;
  timezone:    string | null;
  domain:      string | null;
}

export interface DeploymentBundleVertical {
  code: string;
  name: string;
}

export interface DeploymentBundlePlan {
  code:          string;
  name:          string;
  billing_cycle: PlatformBillingCycle;
  price_monthly: number | null;
  price_annual:  number | null;
  max_locations: number | null;
  max_users:     number | null;
}

export interface DeploymentBundleBranding {
  primary_color:   string | null;
  secondary_color: string | null;
  logo_url:        string | null;
  favicon_url:     string | null;
  custom_domain:   string | null;
}

export interface DeploymentBundleLicense {
  license_status:     PlatformLicenseStatus;
  billing_cycle:      PlatformBillingCycle;
  trial_ends_at:      Date | null;
  license_expires_at: Date | null;
}

export interface DeploymentBundleModule {
  code:     string;
  name:     string;
  category: PlatformModuleCategory;
  version:  string;
}

export interface DeploymentBundleConfiguration {
  deployment_url:      string | null;
  instance_identifier: string | null;
}

export interface DeploymentBundleMetadata {
  generated_at:    Date;
  generated_by:    string | null;
  bundle_version:  string;
}

export interface DeploymentBundle {
  organization:  DeploymentBundleOrganization;
  vertical:      DeploymentBundleVertical | null;
  plan:          DeploymentBundlePlan | null;
  branding:      DeploymentBundleBranding | null;
  license:       DeploymentBundleLicense;
  modules:       DeploymentBundleModule[];
  configuration: DeploymentBundleConfiguration;
  metadata:      DeploymentBundleMetadata;
}

// Paquete de configuración simplificado (para integraciones futuras)
export interface ConfigurationPackage {
  branding:      DeploymentBundleBranding | null;
  modules:       { code: string; name: string; category: PlatformModuleCategory }[];
  license:       DeploymentBundleLicense;
  configuration: DeploymentBundleConfiguration;
  metadata:      DeploymentBundleMetadata;
}

// Validación previa a la exportación
export interface ExportValidationResult {
  valid:  boolean;
  errors: string[];
}

// Log de exportación de deployment
export interface DeploymentExportLogItem {
  id:              string;
  organization_id: string;
  organization:    { code: string; name: string };
  export_type:     DeploymentExportType;
  bundle_version:  string;
  exported_by:     string | null;
  result:          DeploymentExportResult;
  error_message:   string | null;
  created_at:      Date;
}

// Organización en la tabla de Deployment Preparation
export interface DeploymentPreparationItem {
  id:                  string;
  code:                string;
  name:                string;
  status:              PlatformOrganizationStatus;
  license_status:      PlatformLicenseStatus;
  provisioning_status: PlatformProvisioningStatus;
  vertical:            { code: string; name: string } | null;
  plan:                { code: string; name: string } | null;
  export_count:        number;
  last_export_at:      Date | null;
  created_at:          Date;
}

// ── Deployment Automation (16H) ───────────────────────────────────

export type PlatformDeploymentJobStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "SIMULATED";

export type PlatformDeploymentJobEnvironment =
  | "LOCAL"
  | "STAGING"
  | "PRODUCTION";

export type PlatformDeploymentJobMode =
  | "SIMULATION"
  | "MANUAL"
  | "AUTOMATED";

export type PlatformDeploymentStepStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

export interface PlatformDeploymentJobItem {
  id:                  string;
  organization_id:     string;
  organization:        { code: string; name: string };
  bundle_export_id:    string | null;
  job_status:          PlatformDeploymentJobStatus;
  target_environment:  PlatformDeploymentJobEnvironment;
  deployment_mode:     PlatformDeploymentJobMode;
  started_at:          Date | null;
  finished_at:         Date | null;
  created_by:          string | null;
  notes:               string | null;
  error_message:       string | null;
  created_at:          Date;
  updated_at:          Date;
}

export interface PlatformDeploymentJobDetail extends PlatformDeploymentJobItem {
  steps: PlatformDeploymentStepItem[];
}

export interface PlatformDeploymentStepItem {
  id:          string;
  job_id:      string;
  step_key:    string;
  step_name:   string;
  step_order:  number;
  status:      PlatformDeploymentStepStatus;
  started_at:  Date | null;
  finished_at: Date | null;
  message:     string | null;
  metadata:    Record<string, unknown> | null;
  created_at:  Date;
  updated_at:  Date;
}

export interface PlatformDeploymentJobFilters {
  organization_id?: string;
  job_status?:      PlatformDeploymentJobStatus;
  environment?:     PlatformDeploymentJobEnvironment;
  deployment_mode?: PlatformDeploymentJobMode;
  page_size?:       number;
}

// ── Manual Deployment (16I) ───────────────────────────────────────

export interface ManualDeploymentOrgDetails {
  code:                string;
  name:                string;
  legal_name:          string | null;
  nit:                 string | null;
  tenant_id:           string | null;
  country_code:        string | null;
  timezone:            string | null;
  domain:              string | null;
  deployment_url:      string | null;
  instance_identifier: string | null;
  vertical: { code: string; name: string } | null;
  plan:     { code: string; name: string } | null;
  branding: {
    primary_color:   string | null;
    secondary_color: string | null;
    logo_url:        string | null;
    custom_domain:   string | null;
  } | null;
  active_modules: { code: string; name: string; category: PlatformModuleCategory }[];
}

export interface ManualDeploymentJobDetail extends PlatformDeploymentJobItem {
  steps:       PlatformDeploymentStepItem[];
  org_details: ManualDeploymentOrgDetails;
}

export type ManualStepStatusUpdate =
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

// ── Database Profile Preflight (C3) ──────────────────────────────

// Resultado de runDatabaseProfilePreflightAction
// (preflight contra un PlatformDatabaseProfile via Prisma dinámico)
export type DatabaseProfilePreflightActionState =
  | { result: DatabasePreflightResult; profileLabel: string; tenantIdUsed: string | null; error?: never }
  | { result?: never; profileLabel?: string; tenantIdUsed?: never; error: string };

// ── Database Profiles (B2) ────────────────────────────────────────

export type PlatformDatabaseProfileEnvironment =
  | "LOCAL"
  | "SANDBOX"
  | "TEST"
  | "STAGING"
  | "PRODUCTION";

export type PlatformDatabaseProvider =
  | "POSTGRESQL"
  | "SUPABASE"
  | "NEON"
  | "RENDER"
  | "LOCAL_POSTGRES"
  | "OTHER";

export type PlatformDatabaseSslMode =
  | "DISABLE"
  | "PREFER"
  | "REQUIRE";

export type PlatformDatabaseConnectionTestStatus =
  | "UNTESTED"
  | "SUCCESS"
  | "FAILED";

// Metadatos seguros del perfil — sin encrypted_password ni credenciales
export interface PlatformDatabaseProfileItem {
  id:               string;
  organization_id:  string;
  organization:     { code: string; name: string };
  label:            string;
  environment:      PlatformDatabaseProfileEnvironment;
  provider:         PlatformDatabaseProvider;
  db_host:          string;
  db_port:          number | null;
  db_name:          string;
  db_user:          string;
  ssl_mode:         PlatformDatabaseSslMode;
  connection_options: Record<string, unknown> | null;
  // Conexión directa opcional para migraciones (RUN_MIGRATIONS) — nunca
  // usada por la app ni el Runtime Database Router. Sin
  // direct_encrypted_password, igual que el password principal nunca se
  // expone. `direct_db_host` no vacío indica que está configurada.
  direct_db_host:   string | null;
  direct_db_port:   number | null;
  direct_db_name:   string | null;
  direct_db_user:   string | null;
  direct_ssl_mode:  PlatformDatabaseSslMode | null;
  last_tested_at:   Date | null;
  last_test_status: PlatformDatabaseConnectionTestStatus;
  last_test_message: string | null;
  is_active:        boolean;
  created_at:       Date;
  updated_at:       Date;
  created_by:       string | null;
  updated_by:       string | null;
}

export interface PlatformDatabaseProfileFilters {
  organization_id?: string;
  environment?:     PlatformDatabaseProfileEnvironment;
  is_active?:       boolean;
}

// ── Database Profile Inspector (C4) ──────────────────────────────

export interface DatabaseInspectionTenant {
  id:     string;
  name:   string;
  slug:   string | null;
  status: string | null;
}

export interface DatabaseInspectionLocation {
  id:     string;
  name:   string;
  status: string | null;
}

export interface DatabaseInspectionAdmin {
  id:    string;
  name:  string;
  email: string;
  role:  string;
}

export interface DatabaseInspectionSale {
  id:           string;
  sale_code:    string;
  status:       string;
  total_amount: string;
  created_at:   string;
}

export interface DatabaseInspectionDteDocument {
  id:            string;
  dte_type_code: string;
  dte_status:    string;
  created_at:    string;
}

export interface DatabaseInspectionDteConfig {
  nit:         string;
  name:        string;
  is_active:   boolean;
  environment: string;
}

export interface DatabaseInspectionSummary {
  tenants:       number;
  locations:     number;
  users:         number;
  products:      number;
  customers:     number;
  suppliers:     number;
  sales:         number;
  dteDocuments:  number;
  cashRegisters: number;
}

export interface DatabaseInspectionCatalogSummary {
  unitsOfMeasure:      number;
  productCategories:   number;
  identificationTypes: number;
  economicActivities:  number;
  municipalities:      number;
  dteCatalogItems:     number;
  taxRates:            number;
}

export interface DatabaseProfileInspectionResult {
  success:          boolean;
  profileLabel:     string;
  organizationName: string;
  tenantIdUsed:     string | null;
  summary:          DatabaseInspectionSummary;
  tenant:           DatabaseInspectionTenant | null;
  locations:        DatabaseInspectionLocation[];
  admins:           DatabaseInspectionAdmin[];
  recentSales:      DatabaseInspectionSale[];
  recentDte:        DatabaseInspectionDteDocument[];
  dteConfig:        DatabaseInspectionDteConfig | null;
  catalogSummary:   DatabaseInspectionCatalogSummary;
  warnings:         string[];
  error?:           string;
}

// ── Tenant Binding & Auto-Discovery (C7) ──────────────────────────

export interface DetectedTenant {
  id:     string;
  name:   string;
  slug:   string | null;
  status: string | null;
}

export type TenantDetectionStatus =
  | "NO_TENANTS_FOUND"
  | "SINGLE_TENANT_DETECTED"
  | "MULTIPLE_TENANTS_DETECTED"
  | "ALREADY_BOUND"
  | "DETECTION_FAILED";

export interface TenantDetectionResult {
  success:                       boolean;
  profileId:                     string;
  profileLabel:                  string;
  organizationId:                string;
  organizationName:              string;
  status:                        TenantDetectionStatus;
  detectedTenants:                DetectedTenant[];
  currentOrganizationTenantId:   string | null;
  recommendedTenantId:           string | null;
  warnings:                      string[];
  error?:                        string;
}

export interface BindOrganizationTenantResult {
  success: boolean;
  error?:  string;
  tenantId?: string;
}

// ── Database Remediation Planner (C5) ─────────────────────────────

export type DatabaseRemediationActionType =
  | "SEED"
  | "MIGRATION"
  | "CONFIGURATION"
  | "MANUAL_REVIEW"
  | "SECURITY"
  | "NONE";

export type DatabaseRemediationRisk =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type DatabaseRemediationStatus =
  | "RECOMMENDED"
  | "OPTIONAL"
  | "DEFERRED"
  | "BLOCKED"
  | "NOT_APPLICABLE";

export interface DatabaseRemediationItem {
  code:                 string;
  title:                string;
  description:          string;
  actionType:           DatabaseRemediationActionType;
  risk:                 DatabaseRemediationRisk;
  status:               DatabaseRemediationStatus;
  sourceCheckCode?:     string;
  recommendedOrder:     number;
  canBeAutomatedLater:  boolean;
  requiresConfirmation: boolean;
  requiresBackup:       boolean;
  notes?:               string[];
}

export interface DatabaseRemediationPlanSummary {
  seeds:          number;
  migrations:     number;
  configurations: number;
  manualReviews:  number;
  highRisk:       number;
}

export type DatabaseRemediationPlanStatus =
  | "NO_ACTION_NEEDED"
  | "ACTIONS_RECOMMENDED"
  | "CRITICAL_ACTIONS_REQUIRED";

export interface DatabaseRemediationPlan {
  status:  DatabaseRemediationPlanStatus;
  items:   DatabaseRemediationItem[];
  summary: DatabaseRemediationPlanSummary;
}

// ── Client Database Viewer (C6) ───────────────────────────────────

export interface ClientViewProduct {
  id:           string;
  product_code: string;
  name:         string;
  sku:          string | null;
  status:       string;
  sale_price:   string | null;
  created_at:   string;
}

export interface ClientViewCustomer {
  id:            string;
  customer_code: string;
  name:          string;
  email:         string | null;
  phone:         string | null;
  status:        string;
  created_at:    string;
}

export interface ClientViewSupplier {
  id:         string;
  name:       string;
  email:      string | null;
  phone:      string | null;
  status:     string;
  created_at: string;
}

export interface ClientViewSale {
  id:           string;
  sale_code:    string;
  status:       string;
  total_amount: string;
  created_at:   string;
}

export interface ClientViewDteDocument {
  id:            string;
  dte_type_code: string;
  dte_status:    string;
  created_at:    string;
}

export interface ClientViewCashRegister {
  id:         string;
  code:       string;
  name:       string;
  is_active:  boolean;
  created_at: string;
}

export interface ClientViewData {
  success:          boolean;
  profileLabel:     string;
  organizationName: string;
  profileId:        string;
  host:             string;
  dbName:           string;
  environment:      string;
  summary:          DatabaseInspectionSummary;
  tenant:           DatabaseInspectionTenant | null;
  locations:        DatabaseInspectionLocation[];
  products:         ClientViewProduct[];
  customers:        ClientViewCustomer[];
  suppliers:        ClientViewSupplier[];
  sales:            ClientViewSale[];
  dteDocuments:     ClientViewDteDocument[];
  cashRegisters:    ClientViewCashRegister[];
  catalogSummary:   DatabaseInspectionCatalogSummary;
  dteConfig:        DatabaseInspectionDteConfig | null;
  warnings:         string[];
  error?:           string;
}

// Metadatos seguros del perfil para pasar de Server a Client Component (sin credenciales)
export interface SafeDatabaseProfileHeader {
  id:               string;
  label:            string;
  db_host:          string;
  db_port:          number | null;
  db_name:          string;
  db_user:          string;
  ssl_mode:         string;
  environment:      string;
  is_active:        boolean;
  last_test_status: string;
  last_tested_at:   string | null;
  organization:     { id: string; code: string; name: string };
}

// ── Platform Support Session (F1-A) ───────────────────────────────
//
// Contenedor operativo de sesión de soporte por perfil de base.
// Read-only en F1-A — prepara el terreno para F1-B (ventas de soporte).
// No expone secretos ni connection strings, solo db_name (no host/port).

export type PlatformSupportSessionModuleKey =
  | "resumen"
  | "productos"
  | "clientes"
  | "proveedores"
  | "inventario"
  | "ventas"
  | "dte"
  | "caja"
  | "configuracion";

export type PlatformSupportSessionErrorReason =
  | "PROFILE_NOT_FOUND"
  | "INACTIVE_PROFILE"
  | "MISSING_TENANT"
  | "CONNECTION_FAILED";

export interface PlatformSupportSessionHeader {
  profileId:         string;
  profileLabel:      string;
  environment:       PlatformDatabaseProfileEnvironment;
  dbName:            string;
  isActive:          boolean;
  lastTestedAt:      string | null;
  lastTestStatus:    PlatformDatabaseConnectionTestStatus;
  lastTestMessage:   string | null;
  organizationId:    string;
  organizationCode:  string;
  organizationName:  string;
  tenantId:          string | null;
}

export interface SupportSessionProductRow {
  id:            string;
  product_code:  string;
  name:          string;
  status:        string;
  product_type:  string;
  is_stockable:  boolean;
  sale_price:    string | null;
  category:      string | null;
  unit:          string | null;
}

export interface SupportSessionCustomerRow {
  id:              string;
  customer_code:   string;
  name:            string;
  tax_id_masked:   string | null;
  email:           string | null;
  phone:           string | null;
  status:          string;
}

export interface SupportSessionSupplierRow {
  id:             string;
  supplier_code:  string;
  name:           string;
  tax_id_masked:  string | null;
  email:          string | null;
  status:         string;
}

export interface SupportSessionInventoryRow {
  id:                string;
  product_name:      string;
  product_code:      string;
  location_name:     string;
  current_stock:     string;
  reorder_quantity:  string;
  is_active:         boolean;
}

export interface SupportSessionSaleRow {
  id:              string;
  sale_code:       string;
  sale_date:       string;
  customer_name:   string | null;
  total_amount:    string;
  status:          string;
  payment_status:  string;
}

export interface SupportSessionDteRow {
  id:               string;
  dte_type_code:    string;
  dte_status:       string;
  generation_code:  string | null;
  control_number:   string | null;
  reception_stamp:  string | null;
  created_at:       string;
  rejection_reason: string | null;
}

export interface SupportSessionCashSessionRow {
  id:             string;
  register_name:  string;
  location_name:  string;
  status:         string;
  opened_at:      string;
  closed_at:      string | null;
  opening_amount: string;
  expected_cash_amount: string;
}

export interface PlatformSupportSessionSummary extends DatabaseInspectionSummary {
  inventoryRows: number;
}

export interface PlatformSupportSessionFiscalConfig {
  isRetentionAgent:          boolean;
  retentionThresholdAmount:  string | null;
  issuer:                    DatabaseInspectionDteConfig | null;
  dteEnvironment:            string | null;
}

export type PlatformSupportSessionData =
  | {
      success:        true;
      header:         PlatformSupportSessionHeader;
      summary:        PlatformSupportSessionSummary;
      tenant:         DatabaseInspectionTenant | null;
      locations:      DatabaseInspectionLocation[];
      products:       SupportSessionProductRow[];
      customers:      SupportSessionCustomerRow[];
      suppliers:      SupportSessionSupplierRow[];
      inventory:      SupportSessionInventoryRow[];
      sales:          SupportSessionSaleRow[];
      dte:            SupportSessionDteRow[];
      cashSessions:   SupportSessionCashSessionRow[];
      catalogSummary: DatabaseInspectionCatalogSummary;
      fiscalConfig:   PlatformSupportSessionFiscalConfig;
      warnings:       string[];
    }
  | {
      success: false;
      reason:  PlatformSupportSessionErrorReason;
      error:   string;
      header?: PlatformSupportSessionHeader;
    };

// ─────────────────────────────────────────────────────────────────────────────
// D0: Execution Safety Gate
// Tipos para la compuerta de seguridad antes de ejecutar acciones controladas
// sobre bases de datos cliente. No ejecuta acciones reales — solo evalúa.
// ─────────────────────────────────────────────────────────────────────────────

/** Tipos de acciones ejecutables sobre un perfil de base de datos cliente */
export type DatabaseExecutionActionType =
  | "SEED_DTE_CATALOGS"           // Seeds idempotentes de catálogos DTE (bajo riesgo)
  | "SEED_GLOBAL_CATALOGS"        // Seeds idempotentes de catálogos globales (bajo riesgo)
  | "SEED_TENANT_BASE"            // Seed base del tenant: usuario admin, ubicación (riesgo medio)
  | "CREATE_TENANT_FISCAL_CONFIG" // Configuración fiscal inicial del tenant (riesgo medio)
  | "RUN_MIGRATIONS"              // Migraciones de schema (alto riesgo)
  | "RUN_IMPORT"                  // Importación desde Excel u origen externo (riesgo medio)
  | "RUN_REPAIR"                  // Corrección automática de datos (alto riesgo)
  | "CREATE_SUPPORT_SALE"         // F1-B1: crear venta de prueba en base cliente (alto riesgo)
  | "CREATE_SUPPORT_DTE"          // F2-B1: crear DTE pendiente + reservar correlativo (alto riesgo)
  | "GENERATE_SUPPORT_DTE_JSON"   // F2-B1: generar JSON DTE + validar schema AJV (riesgo medio)
  | "SIGN_SUPPORT_DTE"            // F2-B2: firmar DTE SCHEMA_VALIDATED con el firmador MH (alto riesgo)
  | "TRANSMIT_SUPPORT_DTE_TEST"   // F2-B3: transmitir DTE SIGNED a Hacienda TEST (alto riesgo)
  | "MANUAL_OPERATION";           // Operación manual sin categoría (riesgo crítico)

/** Nivel de riesgo de ejecución para una acción sobre base de datos cliente */
export type DatabaseExecutionRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Política de ejecución según ambiente y nivel de riesgo */
export type DatabaseExecutionEnvironmentPolicy =
  | "ALLOWED"               // Permitido si se cumplen los requisitos de validación
  | "CONFIRMATION_REQUIRED" // Requiere texto de confirmación explícito
  | "BLOCKED";              // Bloqueado en este ambiente — no ejecutar

/** Input para evaluar la compuerta de seguridad de ejecución */
export interface DatabaseExecutionSafetyInput {
  /** Tipo de acción que se quiere ejecutar */
  actionType:                         DatabaseExecutionActionType;
  /** Ambiente del perfil (LOCAL, TEST, STAGING, PRODUCTION, etc.) */
  profileEnvironment:                 PlatformDatabaseProfileEnvironment;
  /** Tipo de target de la base: CLIENT_RUNTIME, DEMO, CONTROL_PLANE, UNKNOWN */
  targetType:                         DatabasePreflightTargetType;
  /** Si se ejecuta en modo dry-run (sin escribir datos reales) */
  isDryRun?:                          boolean;
  /** Texto escrito por el operador para confirmar la acción */
  confirmationText?:                  string;
  /** Texto exacto que se espera para validar la confirmación */
  expectedConfirmationText?:          string;
  /** Si existe un test de conexión exitoso reciente contra este perfil */
  hasRecentSuccessfulConnectionTest?: boolean;
  /** Si existe un preflight reciente exitoso contra este perfil */
  hasRecentPreflight?:                boolean;
  /** Si el operador confirmó que existe un backup reciente */
  hasBackupConfirmation?:             boolean;
  /** Si ya se ejecutó un dry-run exitoso y vigente antes de esta llamada EXECUTE */
  hasRecentSuccessfulDryRun?:         boolean;
}

/** Resultado de la evaluación de la compuerta de seguridad de ejecución */
export interface DatabaseExecutionSafetyResult {
  /** true = la compuerta pasa; la acción podría ejecutarse (en D1+) */
  allowed:              boolean;
  /** true = bloqueado explícitamente; no puede pasar sin cambiar ambiente o target */
  blocked:              boolean;
  /** true = se requiere texto de confirmación explícito */
  requiresConfirmation: boolean;
  /** true = se requiere confirmar existencia de backup reciente */
  requiresBackup:       boolean;
  /** true = se requiere ejecutar dry-run antes de la ejecución real */
  requiresDryRunFirst:  boolean;
  /** Nivel de riesgo base de la acción */
  riskLevel:            DatabaseExecutionRiskLevel;
  /** Política que aplica según ambiente y riesgo */
  environmentPolicy:    DatabaseExecutionEnvironmentPolicy;
  /** Mensajes informativos (cumplimiento de requisitos, modo activo, etc.) */
  messages:             string[];
  /** Razones por las que la acción está bloqueada o no puede ejecutarse aún */
  blockers:             string[];
  /** Advertencias que no bloquean pero deben revisarse */
  warnings:             string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// D1A: DTE Catalog Items Seed Runner
// Tipos para el seed runner controlado de catálogos DTE contra un
// PlatformDatabaseProfile via Prisma dinámico temporal.
// No ejecuta migraciones. Solo escribe en dte_catalog_items.
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado del dry-run del seed de catálogos DTE */
export interface DteCatalogItemsSeedDryRunResult {
  /** Total de items definidos en el seed (todos los catálogos) */
  totalExpected:         number;
  /** Códigos de catálogos requeridos que tienen 0 items activos */
  missingCatalogs:       string[];
  /** Cantidad de catálogos requeridos que ya tienen al menos 1 item activo */
  existingCatalogsCount: number;
  /** Items a crear (pertenecen a catálogos faltantes) */
  itemsToCreate:         number;
}

/** Resultado del seed real de catálogos DTE */
export interface DteCatalogItemsSeedResult {
  /** Nuevos registros insertados */
  created:       number;
  /** Registros existentes actualizados (upsert) */
  updated:       number;
  /** Total de items esperados según el seed */
  totalExpected: number;
  /** Total de items activos en dte_catalog_items después del seed */
  totalAfter:    number;
}

export type DteCatalogSeedActionMode = "DRY_RUN" | "EXECUTE";

export interface DteCatalogSeedActionInput {
  profileId:         string;
  mode:              DteCatalogSeedActionMode;
  confirmationText?: string;
}

export type DteCatalogSeedActionState =
  | {
      success:        true;
      mode:           DteCatalogSeedActionMode;
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      dryRunResult?:  DteCatalogItemsSeedDryRunResult;
      seedResult?:    DteCatalogItemsSeedResult;
      error?:         never;
    }
  | {
      success:         false;
      error:           string;
      blocked?:        boolean;
      safetyBlockers?: string[];
    };

// ─────────────────────────────────────────────────────────────────────────────
// D1B: TenantFiscalConfig Seed Runner
// Tipos para el runner controlado de configuración fiscal del tenant contra un
// PlatformDatabaseProfile via Prisma dinámico temporal.
// No ejecuta migraciones. Solo escribe en tenant_fiscal_config.
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado del dry-run del runner TenantFiscalConfig */
export interface TenantFiscalConfigDryRunResult {
  /** true si el Gym con ese tenant_id existe en la base objetivo */
  tenantFound:          boolean;
  /** Nombre del Gym si se encontró */
  tenantName?:          string;
  /** true si ya existe TenantFiscalConfig para este tenant */
  existingConfigFound:  boolean;
  /** ID del registro existente, si aplica */
  existingConfigId?:    string;
  /** true si la ejecución real crearía un registro nuevo */
  wouldCreate:          boolean;
  /** Siempre false en D1B — no modifica registros existentes */
  wouldUpdate:          boolean;
  /** Valores que se usarían en el create (seguros por defecto) */
  recommendedDefaults: {
    is_retention_agent:          boolean;
    retention_threshold_amount:  null;
  };
  /** Advertencias no bloqueantes */
  warnings:             string[];
  /** true si se requiere revisión manual antes de ejecutar (ej: tenant no encontrado) */
  manualReviewRequired: boolean;
  /** Razón de la revisión manual requerida */
  manualReviewReason?:  string;
}

/** Resultado del seed real de TenantFiscalConfig */
export interface TenantFiscalConfigSeedResult {
  /** true si se creó un registro nuevo */
  created:   boolean;
  /** Siempre false en D1B — update: {} no modifica datos existentes */
  updated:   boolean;
  /** true si ya existía y no hubo cambios */
  unchanged: boolean;
  /** ID del registro (nuevo o existente) */
  configId:  string;
  /** tenant_id usado */
  tenantId:  string;
}

export type TenantFiscalConfigActionMode = "DRY_RUN" | "EXECUTE";

export interface TenantFiscalConfigActionInput {
  profileId:         string;
  mode:              TenantFiscalConfigActionMode;
  confirmationText?: string;
}

export type TenantFiscalConfigActionState =
  | {
      success:        true;
      mode:           TenantFiscalConfigActionMode;
      profileLabel:   string;
      tenantId:       string;
      safetyMessages: string[];
      safetyWarnings: string[];
      dryRunResult?:  TenantFiscalConfigDryRunResult;
      seedResult?:    TenantFiscalConfigSeedResult;
      error?:         never;
    }
  | {
      success:         false;
      error:           string;
      blocked?:        boolean;
      safetyBlockers?: string[];
    };

// ─────────────────────────────────────────────────────────────────────────────
// E0: Data Onboarding Center — Foundation read-only
// Tipos para la estructura base del centro de importación/exportación de datos
// desde Platform Admin. E0 no ejecuta importaciones ni exportaciones reales.
// ─────────────────────────────────────────────────────────────────────────────

/** Clave única del dataset importable/exportable */
export type DataOnboardingDatasetKey =
  | "products"
  | "categories"
  | "lines"
  | "sublines"
  | "customers"
  | "suppliers"
  | "inventory_initial"
  | "units_of_measure"
  | "tax_rates"
  | "sales"
  | "dte_documents"
  | "dte_catalogs";

/** Dirección de la operación de datos */
export type DataOnboardingDirection = "IMPORT" | "EXPORT" | "BOTH";

/** Estado de disponibilidad del dataset en la plataforma */
export type DataOnboardingDatasetStatus =
  | "PLANNED"      // E0: definido pero no implementado
  | "IN_PROGRESS"  // E1/E2: en implementación activa
  | "AVAILABLE";   // Disponible y funcional

/** Nivel de riesgo de la operación de importación */
export type DataOnboardingImportRisk = "LOW" | "MEDIUM" | "HIGH";

/** Definición estática de un dataset importable/exportable */
export interface DataOnboardingDatasetDefinition {
  key:             DataOnboardingDatasetKey;
  label:           string;
  description:     string;
  direction:       DataOnboardingDirection;
  status:          DataOnboardingDatasetStatus;
  risk:            DataOnboardingImportRisk;
  requiredFields:  string[];
  optionalFields:  string[];
  dependencies:    DataOnboardingDatasetKey[];
  notes?:          string;
}

/** Metadatos seguros del perfil para el header del Data Onboarding Center */
export interface DataOnboardingProfileHeader {
  id:               string;
  label:            string;
  db_host:          string;
  db_port:          number | null;
  db_name:          string;
  db_user:          string;
  ssl_mode:         string;
  environment:      string;
  is_active:        boolean;
  last_test_status: string;
  last_tested_at:   string | null;
  organization:     { id: string; code: string; name: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// E1B: Data Onboarding Excel Preview
// Tipos para el parser y server action de preview de archivos Excel.
// No ejecuta importaciones — solo lee y valida filas en memoria.
// ─────────────────────────────────────────────────────────────────────────────

export interface DataOnboardingRowError {
  code:    string;
  field?:  string;
  message: string;
}

export interface DataOnboardingRowWarning {
  code:    string;
  field?:  string;
  message: string;
}

export type DataOnboardingRowStatus = "VALID" | "WARNING" | "ERROR";

export interface DataOnboardingPreviewRow {
  rowNumber: number;
  status:    DataOnboardingRowStatus;
  data:      Record<string, unknown>;
  errors:    DataOnboardingRowError[];
  warnings:  DataOnboardingRowWarning[];
}

export interface DataOnboardingPreviewSummary {
  totalRows:        number;
  validRows:        number;
  invalidRows:      number;
  warningRows:      number;
  emptyRowsIgnored: number;
}

export type DataOnboardingPreviewStatus = "VALID" | "VALID_WITH_WARNINGS" | "INVALID";

export interface DataOnboardingPreviewResult {
  datasetKey: string;
  status:     DataOnboardingPreviewStatus;
  summary:    DataOnboardingPreviewSummary;
  columns:    string[];
  rows:       DataOnboardingPreviewRow[];
  truncated?: boolean;
}

export type DataOnboardingPreviewActionState =
  | {
      success:        true;
      result:         DataOnboardingPreviewResult;
      dbAwareResult?: DataOnboardingDbAwarePreviewResult;
      dbAwareError?:  string;
    }
  | { success: false; error: string };

// ─────────────────────────────────────────────────────────────────────────────
// E1B.1: Import Policy + DB-aware Preview
// Tipos para la capa de política de importación y análisis contra la base destino.
// No ejecuta importaciones — solo analiza y clasifica filas contra registros reales.
// ─────────────────────────────────────────────────────────────────────────────

/** Política de importación que determina qué pasa cuando un registro ya existe */
export type DataOnboardingImportPolicy =
  | "CREATE_ONLY"       // Solo crea; si ya existe → ERROR o SKIP
  | "UPDATE_EXISTING"   // Solo actualiza existentes; si no existe → SKIP (futuro)
  | "UPSERT";           // Crea o actualiza según existencia (futuro)

/** Resolución por fila después del análisis contra la base destino */
export type DataOnboardingRowResolution = "CREATE" | "UPDATE" | "SKIP" | "ERROR";

/** Estado general del análisis DB-aware */
export type DataOnboardingDbAwareStatus = "READY" | "READY_WITH_WARNINGS" | "BLOCKED";

/** Resultado de verificar una dependencia requerida */
export interface DataOnboardingDependencyCheck {
  dependencyType: string;   // ej: "category", "unit_of_measure"
  lookupField:    string;   // campo del Excel que se usó para buscar
  lookupValue:    string;   // valor buscado
  found:          boolean;
  foundId?:       string;
  message?:       string;
}

/** Resultado DB-aware de una fila individual */
export interface DataOnboardingDbAwareRow {
  rowNumber:         number;
  resolution:        DataOnboardingRowResolution;
  naturalKey:        string;
  existsInDb:        boolean;
  errors:            DataOnboardingRowError[];
  warnings:          DataOnboardingRowWarning[];
  dependencyChecks:  DataOnboardingDependencyCheck[];
}

/** Resumen del análisis DB-aware */
export interface DataOnboardingDbAwarePreviewSummary {
  createRows:           number;
  updateRows:           number;
  skipRows:             number;
  errorRows:            number;
  missingDependencies:  number;
  duplicatesInDatabase: number;
}

/** Resultado completo del análisis DB-aware para un dataset */
export interface DataOnboardingDbAwarePreviewResult {
  datasetKey:    DataOnboardingDatasetKey;
  importPolicy:  DataOnboardingImportPolicy;
  status:        DataOnboardingDbAwareStatus;
  summary:       DataOnboardingDbAwarePreviewSummary;
  rows:          DataOnboardingDbAwareRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// E1C-A: Categories Import Runner
// Tipos para el runner controlado de importación de categorías contra un
// PlatformDatabaseProfile via Prisma dinámico temporal.
// Solo política CREATE_ONLY. Solo escribe en product_categories.
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado de importación de una fila individual */
export interface CategoriesImportRowResult {
  rowNumber:  number;
  name:       string;
  code:       string;
  resolution: "CREATED" | "SKIPPED" | "ERROR";
  reason?:    string;
}

/** Resultado completo del dry-run del import runner de categorías */
export interface CategoriesImportDryRunResult {
  wouldCreate: number;
  blocked:     number;
  totalRows:   number;
  rows:        CategoriesImportRowResult[];
}

/** Resultado completo de la ejecución real del import runner de categorías */
export interface CategoriesImportResult {
  created:      number;
  skipped:      number;
  errors:       number;
  totalRows:    number;
  importPolicy: DataOnboardingImportPolicy;
  datasetKey:   "categories";
  rows:         CategoriesImportRowResult[];
}

export type CategoriesImportActionMode = "DRY_RUN" | "EXECUTE";

export type CategoriesImportActionState =
  | {
      success:        true;
      mode:           CategoriesImportActionMode;
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      dryRunResult?:  CategoriesImportDryRunResult;
      importResult?:  CategoriesImportResult;
      error?:         never;
    }
  | {
      success:        false;
      error:          string;
      blocked?:       boolean;
      safetyBlockers?: string[];
    };

// ─────────────────────────────────────────────────────────────────────────────
// E1C-B: Lines Import Runner
// Tipos para el runner controlado de importación de líneas contra un
// PlatformDatabaseProfile via Prisma dinámico temporal.
// Solo política CREATE_ONLY. Solo escribe en product_lines.
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado de importación de una fila individual de líneas */
export interface LinesImportRowResult {
  rowNumber:    number;
  name:         string;
  categoryName: string;
  code:         string;
  resolution:   "CREATED" | "SKIPPED" | "ERROR";
  reason?:      string;
}

/** Resultado completo del dry-run del import runner de líneas */
export interface LinesImportDryRunResult {
  wouldCreate: number;
  blocked:     number;
  totalRows:   number;
  rows:        LinesImportRowResult[];
}

/** Resultado completo de la ejecución real del import runner de líneas */
export interface LinesImportResult {
  created:      number;
  skipped:      number;
  errors:       number;
  totalRows:    number;
  importPolicy: DataOnboardingImportPolicy;
  datasetKey:   "lines";
  rows:         LinesImportRowResult[];
}

export type LinesImportActionMode = "DRY_RUN" | "EXECUTE";

export type LinesImportActionState =
  | {
      success:        true;
      mode:           LinesImportActionMode;
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      dryRunResult?:  LinesImportDryRunResult;
      importResult?:  LinesImportResult;
      error?:         never;
    }
  | {
      success:        false;
      error:          string;
      blocked?:       boolean;
      safetyBlockers?: string[];
    };

// ─────────────────────────────────────────────────────────────────────────────
// E1C-B: Sublines Import Runner
// Tipos para el runner controlado de importación de sublíneas contra un
// PlatformDatabaseProfile via Prisma dinámico temporal.
// Solo política CREATE_ONLY. Solo escribe en product_sublines.
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado de importación de una fila individual de sublíneas */
export interface SublinesImportRowResult {
  rowNumber:  number;
  name:       string;
  lineName:   string;
  code:       string;
  resolution: "CREATED" | "SKIPPED" | "ERROR";
  reason?:    string;
}

/** Resultado completo del dry-run del import runner de sublíneas */
export interface SublinesImportDryRunResult {
  wouldCreate: number;
  blocked:     number;
  totalRows:   number;
  rows:        SublinesImportRowResult[];
}

/** Resultado completo de la ejecución real del import runner de sublíneas */
export interface SublinesImportResult {
  created:      number;
  skipped:      number;
  errors:       number;
  totalRows:    number;
  importPolicy: DataOnboardingImportPolicy;
  datasetKey:   "sublines";
  rows:         SublinesImportRowResult[];
}

export type SublinesImportActionMode = "DRY_RUN" | "EXECUTE";

export type SublinesImportActionState =
  | {
      success:        true;
      mode:           SublinesImportActionMode;
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      dryRunResult?:  SublinesImportDryRunResult;
      importResult?:  SublinesImportResult;
      error?:         never;
    }
  | {
      success:        false;
      error:          string;
      blocked?:       boolean;
      safetyBlockers?: string[];
    };

// ─────────────────────────────────────────────────────────────────────────────
// E1C-C: Customers Import Runner
// Tipos para el runner controlado de importación de clientes contra un
// PlatformDatabaseProfile via Prisma dinámico temporal.
// Solo política CREATE_ONLY. Solo escribe en customers.
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado de importación de una fila individual de clientes */
export interface CustomersImportRowResult {
  rowNumber:  number;
  name:       string;
  code:       string;
  resolution: "CREATED" | "SKIPPED" | "ERROR";
  reason?:    string;
}

/** Resultado completo del dry-run del import runner de clientes */
export interface CustomersImportDryRunResult {
  wouldCreate: number;
  blocked:     number;
  totalRows:   number;
  rows:        CustomersImportRowResult[];
}

/** Resultado completo de la ejecución real del import runner de clientes */
export interface CustomersImportResult {
  created:      number;
  skipped:      number;
  errors:       number;
  totalRows:    number;
  importPolicy: DataOnboardingImportPolicy;
  datasetKey:   "customers";
  rows:         CustomersImportRowResult[];
}

export type CustomersImportActionMode = "DRY_RUN" | "EXECUTE";

export type CustomersImportActionState =
  | {
      success:        true;
      mode:           CustomersImportActionMode;
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      dryRunResult?:  CustomersImportDryRunResult;
      importResult?:  CustomersImportResult;
      error?:         never;
    }
  | {
      success:        false;
      error:          string;
      blocked?:       boolean;
      safetyBlockers?: string[];
    };

// ─────────────────────────────────────────────────────────────────────────────
// E1C-C: Suppliers Import Runner
// Tipos para el runner controlado de importación de proveedores contra un
// PlatformDatabaseProfile via Prisma dinámico temporal.
// Solo política CREATE_ONLY. Solo escribe en suppliers.
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado de importación de una fila individual de proveedores */
export interface SuppliersImportRowResult {
  rowNumber:  number;
  name:       string;
  code:       string;
  resolution: "CREATED" | "SKIPPED" | "ERROR";
  reason?:    string;
}

/** Resultado completo del dry-run del import runner de proveedores */
export interface SuppliersImportDryRunResult {
  wouldCreate: number;
  blocked:     number;
  totalRows:   number;
  rows:        SuppliersImportRowResult[];
}

/** Resultado completo de la ejecución real del import runner de proveedores */
export interface SuppliersImportResult {
  created:      number;
  skipped:      number;
  errors:       number;
  totalRows:    number;
  importPolicy: DataOnboardingImportPolicy;
  datasetKey:   "suppliers";
  rows:         SuppliersImportRowResult[];
}

export type SuppliersImportActionMode = "DRY_RUN" | "EXECUTE";

export type SuppliersImportActionState =
  | {
      success:        true;
      mode:           SuppliersImportActionMode;
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      dryRunResult?:  SuppliersImportDryRunResult;
      importResult?:  SuppliersImportResult;
      error?:         never;
    }
  | {
      success:        false;
      error:          string;
      blocked?:       boolean;
      safetyBlockers?: string[];
    };

// ─────────────────────────────────────────────────────────────────────────────
// E1C-D: Products Import Runner
// Tipos para el runner controlado de importación de productos contra un
// PlatformDatabaseProfile via Prisma dinámico temporal.
// Solo política CREATE_ONLY. Solo escribe en products.
// No crea inventario, stock ni movimientos.
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado de importación de una fila individual de productos */
export interface ProductsImportRowResult {
  rowNumber:  number;
  name:       string;
  code:       string;
  resolution: "CREATED" | "SKIPPED" | "ERROR";
  reason?:    string;
}

/** Resultado completo del dry-run del import runner de productos */
export interface ProductsImportDryRunResult {
  wouldCreate: number;
  blocked:     number;
  totalRows:   number;
  rows:        ProductsImportRowResult[];
}

/** Resultado completo de la ejecución real del import runner de productos */
export interface ProductsImportResult {
  created:      number;
  skipped:      number;
  errors:       number;
  totalRows:    number;
  importPolicy: DataOnboardingImportPolicy;
  datasetKey:   "products";
  rows:         ProductsImportRowResult[];
}

export type ProductsImportActionMode = "DRY_RUN" | "EXECUTE";

export type ProductsImportActionState =
  | {
      success:        true;
      mode:           ProductsImportActionMode;
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      dryRunResult?:  ProductsImportDryRunResult;
      importResult?:  ProductsImportResult;
      error?:         never;
    }
  | {
      success:        false;
      error:          string;
      blocked?:       boolean;
      safetyBlockers?: string[];
    };

// ─────────────────────────────────────────────────────────────────────────────
// E1C-E1: Inventory Initial Import Runner
// Tipos para el runner controlado de importación de inventario inicial
// contra un PlatformDatabaseProfile via Prisma dinámico temporal.
// Solo política CREATE_ONLY. Solo escribe en product_locations e
// inventory_movements (tipo INITIAL_LOAD), en una sola transacción por fila.
// No crea, actualiza ni elimina productos, categorías, unidades,
// proveedores ni sucursales.
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado de importación de una fila individual de inventario inicial */
export interface InventoryImportRowResult {
  rowNumber:  number;
  name:       string; // location_name (sucursal)
  code:       string; // product_code
  resolution: "CREATED" | "SKIPPED" | "ERROR";
  reason?:    string;
}

/** Resultado completo del dry-run del import runner de inventario inicial */
export interface InventoryImportDryRunResult {
  wouldCreate: number;
  blocked:     number;
  totalRows:   number;
  rows:        InventoryImportRowResult[];
}

/** Resultado completo de la ejecución real del import runner de inventario inicial */
export interface InventoryImportResult {
  created:                 number;
  skipped:                 number;
  errors:                  number;
  totalRows:               number;
  importPolicy:            DataOnboardingImportPolicy;
  datasetKey:              "inventory_initial";
  productLocationsCreated: number;
  movementsCreated:        number;
  rows:                    InventoryImportRowResult[];
}

export type InventoryImportActionMode = "DRY_RUN" | "EXECUTE";

export type InventoryImportActionState =
  | {
      success:        true;
      mode:           InventoryImportActionMode;
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      dryRunResult?:  InventoryImportDryRunResult;
      importResult?:  InventoryImportResult;
      error?:         never;
    }
  | {
      success:        false;
      error:          string;
      blocked?:       boolean;
      safetyBlockers?: string[];
    };

// ─────────────────────────────────────────────────────────────────────────────
// F1-B1: Support Session — crear venta de prueba por perfil de base de datos
//
// Runner controlado que crea una venta comercial (Sale + SaleItem +
// SalePayment opcional) directamente CONFIRMED en la base cliente
// seleccionada, replicando las fórmulas de commerce/sales sin modificarlo.
// No genera DTE (queda para F2). No abre/cierra caja. No toca catálogos.
// ─────────────────────────────────────────────────────────────────────────────

export type CreateSupportSaleActionMode = "DRY_RUN" | "EXECUTE";

export interface CreateSupportSaleItemInput {
  product_id: string;
  quantity:   number;
  unit_price: number;
  notes?:     string | null;
}

export interface CreateSupportSaleInput {
  profileId:              string;
  mode:                   CreateSupportSaleActionMode;
  location_id:            string;
  customer_id?:           string | null;
  // CAT-002: 01=Factura Electrónica, 03=Comprobante de Crédito Fiscal
  primary_dte_type_code:  "01" | "03";
  items:                  CreateSupportSaleItemInput[];
  payment_method_code?:   string | null;
  notes?:                 string | null;
  confirmationText?:      string;
  /** Requerido para EXECUTE — riesgo HIGH exige confirmar backup reciente del perfil */
  hasBackupConfirmation?: boolean;
  /** Requerido para EXECUTE — indica que el cliente ya completó un preview (DRY_RUN) vigente */
  hasDryRunConfirmation?: boolean;
}

/** Línea calculada en preview/ejecución — mismas fórmulas que sale-calculations.ts */
export interface SupportSaleComputedItem {
  product_id:      string;
  product_code:    string;
  product_name:    string;
  is_stockable:    boolean;
  quantity:        number;
  unit_price:      number;
  tax_rate:        number | null;
  line_subtotal:   number;
  tax_amount:      number;
  line_total:      number;
  available_stock: number | null;
}

export interface SupportSaleComputedTotals {
  subtotal:        number;
  discount_amount: number;
  tax_amount:      number;
  total_amount:    number;
}

/** Resultado del dry-run (preview) — solo lectura, sin escrituras */
export interface CreateSupportSalePreviewResult {
  items:             SupportSaleComputedItem[];
  totals:            SupportSaleComputedTotals;
  willCreatePayment: boolean;
  warnings:          string[];
}

/** Resultado de la ejecución real — venta confirmada */
export interface CreateSupportSaleResult {
  saleId:         string;
  saleCode:       string;
  status:         "CONFIRMED";
  total:          number;
  inventoryMoved: boolean;
  itemsCount:     number;
  warnings:       string[];
}

export type CreateSupportSaleActionState =
  | {
      success:        true;
      mode:           "DRY_RUN";
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      preview:        CreateSupportSalePreviewResult;
      error?:         never;
    }
  | {
      success:        true;
      mode:           "EXECUTE";
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      result:         CreateSupportSaleResult;
      error?:         never;
    }
  | {
      success:         false;
      error:           string;
      field?:          string;
      blocked?:        boolean;
      safetyBlockers?: string[];
    };

// ── Datos read-only para el formulario de venta de soporte ────────

export interface SupportSaleFormBranch {
  id:     string;
  name:   string;
  status: string;
}

export interface SupportSaleFormCustomer {
  id:            string;
  customer_code: string;
  name:          string;
  tax_id_masked: string | null;
}

export interface SupportSaleFormProduct {
  id:           string;
  product_code: string;
  name:         string;
  product_type: string;
  is_stockable: boolean;
  allow_sale:   boolean;
  sale_price:   number | null;
  tax_rate:     number | null;
}

export interface SupportSaleFormPaymentMethod {
  code:  string;
  label: string;
}

export type SupportSaleFormData =
  | {
      success:        true;
      tenantId:       string;
      branches:       SupportSaleFormBranch[];
      customers:      SupportSaleFormCustomer[];
      products:       SupportSaleFormProduct[];
      paymentMethods: SupportSaleFormPaymentMethod[];
    }
  | {
      success: false;
      error:   string;
    };

// ─────────────────────────────────────────────────────────────────────────────
// F2-B1: Support Session — DTE pendiente + generación de JSON por perfil
//
// Runners controlados que replican (sin modificar) commerce/dte/services
// directamente contra la base cliente de un PlatformDatabaseProfile:
//   Paso 1 — crear DteOutgoingDocument PENDING_GENERATION + reservar correlativo.
//   Paso 2 — generar json_document (FE 01 / CCFE 03) y validar schema AJV
//            en el mismo paso (firma exige SCHEMA_VALIDATED).
// No firma. No transmite a Hacienda. No toca inventario ni Sale/SaleItem.
// ─────────────────────────────────────────────────────────────────────────────

export type SupportDteTypeCode = "01" | "03";

/** Fila de venta CONFIRMED elegible para crear DTE (sin DTE activo del mismo tipo) */
export interface SupportDteSaleRow {
  id:                    string;
  sale_code:             string;
  sale_date:             string;
  customer_name:         string | null;
  primary_dte_type_code: string | null;
  total_amount:          string;
  inventory_moved:       boolean;
}

/** Fila de DteOutgoingDocument reciente (sin json_document ni secrets) */
export interface SupportDteDocumentRow {
  id:                string;
  sale_id:           string | null;
  sale_code:          string | null;
  dte_type_code:      string;
  dte_status:         string;
  environment:        string;
  generation_code:    string | null;
  control_number:     string | null;
  has_json_document:  boolean;
  has_signed_jws:     boolean;
  created_at:         string;
  generated_at:       string | null;
  schema_validated_at: string | null;
  rejection_reason:   string | null;
}

export interface SupportDteIssuerConfigStatus {
  exists:             boolean;
  is_active:          boolean;
  environment:        string | null;
  has_cod_estable_mh: boolean;
  has_cod_punto_venta_mh: boolean;
}

export interface SupportDteCorrelativeStatus {
  dte_type_code: SupportDteTypeCode;
  exists:        boolean;
  last_sequence: number | null;
  year:          number;
}

export type SupportDtePanelData =
  | {
      success:            true;
      tenantId:           string;
      environment:        string;
      eligibleSales:      SupportDteSaleRow[];
      recentDocuments:    SupportDteDocumentRow[];
      issuerConfig:       SupportDteIssuerConfigStatus;
      correlatives:       SupportDteCorrelativeStatus[];
      warnings:           string[];
    }
  | {
      success: false;
      error:   string;
    };

// ── Paso 1 — Crear DTE pendiente ──────────────────────────────────

export type CreateSupportDteActionMode = "DRY_RUN" | "EXECUTE";

export interface CreateSupportDtePendingInput {
  profileId:              string;
  mode:                   CreateSupportDteActionMode;
  sale_id:                string;
  dte_type_code:          SupportDteTypeCode;
  confirmationText?:      string;
  /** Requerido para EXECUTE — riesgo HIGH exige confirmar backup reciente del perfil */
  hasBackupConfirmation?: boolean;
  /** Requerido para EXECUTE — indica que el cliente ya completó un preview (DRY_RUN) vigente */
  hasDryRunConfirmation?: boolean;
}

export interface CreateSupportDtePendingPreviewResult {
  sale_id:            string;
  sale_code:          string;
  dte_type_code:       SupportDteTypeCode;
  issuer_config_id:    string;
  environment:         string;
  next_sequence:       number;
  control_number_preview: string;
  warnings:            string[];
}

export interface CreateSupportDtePendingResult {
  dte_document_id: string;
  sale_id:         string;
  sale_code:       string;
  dte_type_code:    SupportDteTypeCode;
  generation_code:  string;
  control_number:   string;
  dte_status:       "PENDING_GENERATION";
}

export type CreateSupportDtePendingActionState =
  | {
      success:        true;
      mode:           "DRY_RUN";
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      preview:        CreateSupportDtePendingPreviewResult;
      error?:         never;
    }
  | {
      success:        true;
      mode:           "EXECUTE";
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      result:         CreateSupportDtePendingResult;
      error?:         never;
    }
  | {
      success:         false;
      error:           string;
      field?:          string;
      blocked?:        boolean;
      safetyBlockers?: string[];
    };

// ── Paso 2 — Generar JSON + validar schema (mismo paso) ───────────

export interface GenerateSupportDteJsonInput {
  profileId:              string;
  dte_document_id:        string;
  confirmationText?:      string;
  /** Requerido — riesgo MEDIUM exige confirmar backup reciente del perfil en STAGING/PRODUCTION; no en LOCAL/SANDBOX/TEST */
  hasBackupConfirmation?: boolean;
}

export interface GenerateSupportDteJsonValidationError {
  path:    string;
  message: string;
}

export interface GenerateSupportDteJsonResult {
  dte_document_id: string;
  dte_status:      "SCHEMA_VALIDATED";
  generated_at:    string;
  schema_validated_at: string;
}

export type GenerateSupportDteJsonActionState =
  | {
      success:        true;
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      result:         GenerateSupportDteJsonResult;
      error?:         never;
    }
  | {
      success:            false;
      error:              string;
      field?:             string;
      blocked?:           boolean;
      safetyBlockers?:    string[];
      validation_errors?: GenerateSupportDteJsonValidationError[];
    };

// ── Paso 3 — Firmar DTE (F2-B2) ───────────────────────────────────

export interface SignSupportDteInput {
  profileId:              string;
  mode:                   CreateSupportDteActionMode;
  dte_document_id:        string;
  confirmationText?:      string;
  /** Requerido para EXECUTE — riesgo HIGH exige confirmar backup reciente del perfil */
  hasBackupConfirmation?: boolean;
  /** Requerido para EXECUTE — indica que el cliente ya completó un preview (DRY_RUN) vigente */
  hasDryRunConfirmation?: boolean;
}

export interface SignSupportDtePreviewResult {
  dte_document_id: string;
  sale_id:         string;
  sale_code:       string;
  dte_type_code:   SupportDteTypeCode;
  environment:     string;
  generation_code: string;
  control_number:  string;
  warnings:        string[];
}

export interface SignSupportDteResult {
  dte_document_id: string;
  dte_status:      "SIGNED";
  signed_at:       string;
  dte_type_code:   SupportDteTypeCode;
  generation_code: string;
  control_number:  string;
}

export type SignSupportDteActionState =
  | {
      success:        true;
      mode:           "DRY_RUN";
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      preview:        SignSupportDtePreviewResult;
      error?:         never;
    }
  | {
      success:        true;
      mode:           "EXECUTE";
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      result:         SignSupportDteResult;
      error?:         never;
    }
  | {
      success:         false;
      error:           string;
      field?:          string;
      blocked?:        boolean;
      safetyBlockers?: string[];
    };

// ── Paso 4 — Transmitir DTE a Hacienda TEST (F2-B3) ───────────────

export interface TransmitSupportDteInput {
  profileId:              string;
  mode:                   CreateSupportDteActionMode;
  dte_document_id:        string;
  confirmationText?:      string;
  /** Requerido para EXECUTE — riesgo HIGH exige confirmar backup reciente del perfil */
  hasBackupConfirmation?: boolean;
  /** Requerido para EXECUTE — indica que el cliente ya completó un preview (DRY_RUN) vigente */
  hasDryRunConfirmation?: boolean;
}

export interface TransmitSupportDtePreviewResult {
  dte_document_id: string;
  sale_id:         string;
  sale_code:       string;
  dte_type_code:   SupportDteTypeCode;
  environment:     string;
  generation_code: string;
  control_number:  string;
  warnings:        string[];
}

export type SupportDteFinalStatus = "ACCEPTED" | "OBSERVED" | "REJECTED";

export interface TransmitSupportDteResult {
  dte_document_id: string;
  sale_id:         string;
  dte_status:      SupportDteFinalStatus;
  dte_type_code:   SupportDteTypeCode;
  generation_code: string;
  control_number:  string;
  mh_estado:       string;
  codigo_msg:      string | null;
  descripcion_msg: string | null;
  reception_stamp: string | null;
  processed_at:    string | null;
  observations:    unknown[] | null;
}

export type TransmitSupportDteActionState =
  | {
      success:        true;
      mode:           "DRY_RUN";
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      preview:        TransmitSupportDtePreviewResult;
      error?:         never;
    }
  | {
      success:        true;
      mode:           "EXECUTE";
      profileLabel:   string;
      safetyMessages: string[];
      safetyWarnings: string[];
      result:         TransmitSupportDteResult;
      error?:         never;
    }
  | {
      success:         false;
      error:           string;
      field?:          string;
      blocked?:        boolean;
      safetyBlockers?: string[];
    };
