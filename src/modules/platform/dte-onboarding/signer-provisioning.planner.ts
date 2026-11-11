// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding — signer-provisioning.planner.ts
//
// FISCAL-ONBOARDING — PLAN puro (sin I/O, sin efectos). Combina:
//   - la especificación declarativa (organización/ambiente/hostname/puerto/NIT),
//   - el registro de firmadores de TODAS las organizaciones (Control Plane),
//   - la última observación del VPS (INSPECT del ejecutor, opcional),
// y produce bloqueos, advertencias y las operaciones que APPLY ejecutaría.
// ─────────────────────────────────────────────────────────────────

import {
  validateSignerSpec,
  deriveResourceNames,
  renderCompose,
  renderVhostInclude,
  PROTECTED_CONTAINERS,
  PROTECTED_HOSTNAMES,
  TEMPLATE_VERSION,
  type SignerSpec,
  type SignerResourceNames,
} from "../../../../ops/dte-signer-executor/lib/signer-core.mjs";
import type { SignerExecutorObserved } from "./signer-executor.transport";

export interface SignerRegistryEntry {
  organization_id: string;
  environment:     string;
  hostname:        string;
  port:            number;
  container_name:  string;
}

export interface PlanIssue {
  code:    string;
  message: string;
}

export type PlannedAction = "CREATE" | "UPDATE" | "KEEP" | "WAIT_OPERATOR" | "RELOAD" | "UNKNOWN";

export interface PlannedOperation {
  op:      "DIR" | "API_KEY" | "CERT" | "COMPOSE" | "CONTAINER" | "VHOST" | "APACHE_RELOAD" | "REGISTER_CREDENTIAL";
  action:  PlannedAction;
  detail?: string;
}

export interface SignerProvisioningPlan {
  ok:         boolean;
  blockers:   PlanIssue[];
  warnings:   PlanIssue[];
  operations: PlannedOperation[];
  names:      SignerResourceNames | null;
  templateVersion: string;
  preview:    { compose: string; vhost: string } | null;
}

export function planSignerProvisioning(input: {
  organizationId:   string;
  spec:             SignerSpec;
  registry:         SignerRegistryEntry[];
  observed:         SignerExecutorObserved | null;
  apiKeyFingerprint: string | null;
  credentialRegistered: boolean;
}): SignerProvisioningPlan {
  const blockers: PlanIssue[] = [];
  const warnings: PlanIssue[] = [];
  const operations: PlannedOperation[] = [];

  const v = validateSignerSpec(input.spec);
  if (!v.ok) {
    return {
      ok: false, blockers: v.errors.map((m) => ({ code: "INVALID_SPEC", message: m })),
      warnings, operations, names: null, templateVersion: TEMPLATE_VERSION, preview: null,
    };
  }

  const names = deriveResourceNames(input.spec);

  // ── Colisiones contra otras organizaciones/ambientes registrados ──
  for (const other of input.registry) {
    const same = other.organization_id === input.organizationId && other.environment === input.spec.environment;
    if (same) continue;
    if (other.hostname === input.spec.hostname) blockers.push({ code: "HOSTNAME_TAKEN", message: `El hostname ${input.spec.hostname} ya está asignado a otro firmador.` });
    if (other.port === input.spec.port) blockers.push({ code: "PORT_TAKEN", message: `El puerto ${input.spec.port} ya está asignado a otro firmador.` });
    if (other.container_name === names.containerName) blockers.push({ code: "CONTAINER_TAKEN", message: `El contenedor ${names.containerName} ya está asignado a otro firmador.` });
  }

  if (PROTECTED_CONTAINERS.includes(names.containerName)) {
    blockers.push({
      code: "PROTECTED_RESOURCE",
      message: `${names.containerName} es un firmador existente administrado manualmente; el aprovisionador no lo modifica. Use otro slug/ambiente.`,
    });
  }
  if (PROTECTED_HOSTNAMES.includes(input.spec.hostname)) {
    blockers.push({
      code: "PROTECTED_RESOURCE",
      message: `${input.spec.hostname} es el dominio de un firmador administrado manualmente; use un hostname nuevo.`,
    });
  }

  const obs = input.observed;
  if (!obs) {
    warnings.push({ code: "NO_OBSERVATION", message: "Plan sin INSPECT del VPS: las acciones se estiman como creación." });
  } else {
    if (obs.protected) blockers.push({ code: "PROTECTED_RESOURCE", message: "El ejecutor reporta el recurso como protegido." });
    if ((obs.vhostForeignIncludes ?? []).length > 0) {
      blockers.push({ code: "CONFLICT_UNMANAGED", message: `El vhost de ${input.spec.hostname} ya tiene includes ajenos (${obs.vhostForeignIncludes!.join(", ")}): no se toca.` });
    }
    if (obs.container && !obs.container.managed) {
      blockers.push({ code: "CONFLICT_UNMANAGED", message: `Existe ${obs.container.name} sin label zolvi.managed: no se toca.` });
    }
    if ((obs.portOwners ?? []).length > 0) {
      blockers.push({ code: "PORT_CONFLICT", message: `El puerto ${input.spec.port} está publicado por: ${obs.portOwners!.join(", ")}.` });
    } else if (obs.portInUse && !obs.container) {
      blockers.push({ code: "PORT_CONFLICT", message: `El puerto ${input.spec.port} está en uso en el VPS por otro proceso.` });
    }
    if (obs.vhost?.present && !String(obs.vhost.templateVersion ?? "").startsWith("zolvi-signer-")) {
      blockers.push({ code: "CONFLICT_UNMANAGED", message: "Ya existe un include Apache no generado por Zolvi en la ruta destino." });
    }
    if (obs.container?.managed && !obs.container.loopbackOnly) {
      blockers.push({ code: "PORT_EXPOSED", message: "El contenedor publica puertos fuera de 127.0.0.1." });
    }
    if (obs.apiKey?.present && !input.apiKeyFingerprint) {
      blockers.push({
        code: "API_KEY_DRIFT",
        message: "El VPS ya tiene una API Key para este firmador que Zolvi no conoce. Requiere rotación controlada o ROLLBACK del run que la creó.",
      });
    }
    if (obs.apiKey?.present && input.apiKeyFingerprint && obs.apiKey.fingerprint !== input.apiKeyFingerprint) {
      blockers.push({
        code: "API_KEY_DRIFT",
        message: "La API Key del VPS no coincide con la registrada en Zolvi (huellas distintas). Requiere rotación controlada.",
      });
    }
  }

  const est = (present: boolean | undefined, matches?: boolean): PlannedAction =>
    !obs ? "CREATE" : !present ? "CREATE" : matches === false ? "UPDATE" : "KEEP";

  operations.push({ op: "DIR", action: est(obs?.dirExists), detail: names.dir });
  operations.push({
    op: "API_KEY",
    action: obs?.apiKey?.present ? "KEEP" : "CREATE",
    detail: obs?.apiKey?.present ? `huella ${obs.apiKey.fingerprint}` : "Se genera una API Key nueva (64 hex) exclusiva de este emisor/ambiente.",
  });
  if (obs?.cert?.present) {
    operations.push({ op: "CERT", action: "KEEP", detail: `huella ${obs.cert.fingerprint}` });
  } else {
    operations.push({ op: "CERT", action: "WAIT_OPERATOR", detail: `El operador debe colocar ${names.certFile} (0640). APPLY se detiene aquí si falta.` });
    warnings.push({ code: "CERT_MISSING", message: `Falta el certificado ${input.spec.signerNit}.crt del emisor en el VPS.` });
  }
  operations.push({ op: "COMPOSE", action: est(obs?.compose?.present, obs?.compose?.matches), detail: names.composeFile });
  operations.push({
    op: "CONTAINER",
    action: !obs ? "CREATE" : !obs.container ? "CREATE" : obs.container.state === "running" ? "KEEP" : "UPDATE",
    detail: `${names.containerName} → 127.0.0.1:${input.spec.port}`,
  });
  const vhostAction = est(obs?.vhost?.present, obs?.vhost?.matches);
  operations.push({ op: "VHOST", action: vhostAction, detail: names.vhostIncludePath });
  if (vhostAction !== "KEEP") operations.push({ op: "APACHE_RELOAD", action: "RELOAD", detail: "rebuildhttpdconf + apachectl -t + apachectl -k graceful vía helper privilegiado (sin restart; auto-reversión si falla)." });
  operations.push({
    op: "REGISTER_CREDENTIAL",
    action: input.credentialRegistered ? "KEEP" : "CREATE",
    detail: `signerUrl ${names.signerUrl} + signerApiKey en DteCredential del emisor ${input.spec.environment}.`,
  });

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    operations,
    names,
    templateVersion: TEMPLATE_VERSION,
    preview: { compose: renderCompose(input.spec), vhost: renderVhostInclude(input.spec) },
  };
}
