// Tipos del núcleo compartido signer-core.mjs (Zolvi + ejecutor VPS).

export type SignerEnvironment = "TEST" | "PRODUCTION";

export interface SignerSpec {
  slug:        string;
  environment: SignerEnvironment;
  hostname:    string;
  port:        number;
  signerNit:   string;
  cpanelUser:  string;
  allowedRootDomains?: readonly string[];
}

export interface SignerResourceNames {
  id:               string;
  containerName:    string;
  composeProject:   string;
  dir:              string;
  certDir:          string;
  certFile:         string;
  composeFile:      string;
  apiKeyFile:       string;
  manifestFile:     string;
  vhostIncludeName: string;
  vhostIncludePath: string;
  defineName:       string;
  signerUrl:        string;
  labels:           Record<string, string>;
}

export const TEMPLATE_VERSION: string;
export const SIGNER_IMAGE: string;
export const SIGNER_INTERNAL_PORT: number;
export const BASE_DIR: string;
export const PORT_RANGE: Readonly<{ min: number; max: number }>;
export const RESERVED_PORTS: readonly number[];
export const PROTECTED_CONTAINERS: readonly string[];
export const PROTECTED_HOSTNAMES: readonly string[];
export const DEFAULT_ALLOWED_ROOT_DOMAINS: readonly string[];

export function validateSlug(slug: unknown): boolean;
export function validateEnvironment(env: unknown): env is SignerEnvironment;
export function validateHostname(hostname: unknown, allowedRootDomains?: readonly string[]): boolean;
export function validatePort(port: unknown): boolean;
export function validateNit(nit: unknown): boolean;
export function validateCpanelUser(user: unknown): boolean;
export function validateApiKey(key: unknown): boolean;
export function envSuffix(environment: SignerEnvironment): "test" | "prod";
export function validateSignerSpec(spec: unknown): { ok: boolean; errors: string[] };
export function deriveResourceNames(spec: SignerSpec): SignerResourceNames;
export function renderCompose(spec: SignerSpec): string;
export function renderVhostInclude(spec: SignerSpec): string;
export function renderApiKeyDefine(spec: SignerSpec, apiKey: string): string;
export function allocatePort(input?: { usedPorts?: readonly number[]; preferred?: number | null }): number | null;
