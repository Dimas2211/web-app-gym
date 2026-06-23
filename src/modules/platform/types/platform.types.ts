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
