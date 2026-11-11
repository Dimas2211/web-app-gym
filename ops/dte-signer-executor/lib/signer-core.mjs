// ─────────────────────────────────────────────────────────────────
// ops/dte-signer-executor/lib/signer-core.mjs
//
// FISCAL-ONBOARDING — núcleo COMPARTIDO entre Zolvi (planificación y
// vista previa) y el ejecutor del VPS (aplicación real). Sin
// dependencias, ESM puro, ejecutable con Node >= 18 en el VPS.
//
// Fuente única de verdad para:
//   - validación estricta de parámetros (slug, hostname, puerto, NIT,
//     usuario cPanel): el ejecutor NUNCA interpola texto libre en
//     archivos de configuración ni en comandos;
//   - nombres de recursos por organización/ambiente (contenedor,
//     carpeta, include Apache, variable Define);
//   - plantillas versionadas Docker Compose + include Apache/cPanel.
//
// El ejecutor marca cada recurso con TEMPLATE_VERSION, pero VERIFY detecta
// drift por igualdad EXACTA de contenido (COMPOSE/VHOST_TEMPLATE_CURRENT),
// no por la versión. La versión es compartida por compose, include y label
// del contenedor: subirla invalida los tres y obliga a APPLY (reescribe el
// compose, recrea el contenedor y recarga Apache). Subirla solo cuando un
// cambio deba forzar reaplicación; no para alinear la plantilla con una
// corrección ya aplicada en el VPS (ErrorDocument 403 de REC TEST, 2026-11-11).
// ─────────────────────────────────────────────────────────────────

export const TEMPLATE_VERSION = "zolvi-signer-v1";
export const SIGNER_IMAGE = "svfe/svfe-api-firmador:v20230109";
/** Puerto interno del firmador svfe dentro del contenedor. */
export const SIGNER_INTERNAL_PORT = 8113;
export const BASE_DIR = "/opt/zolvi-signers";
export const PORT_RANGE = Object.freeze({ min: 8120, max: 8199 });

/**
 * Puertos que NUNCA se asignan: 8113/8114 = firmadores TrustMe
 * (PROD/TEST, servicios existentes) y 8115 = MetaTraining TEST.
 */
export const RESERVED_PORTS = Object.freeze([8113, 8114, 8115]);

/**
 * Contenedores existentes administrados manualmente: el ejecutor se niega
 * a cualquier operación mutante sobre ellos aunque coincidan en nombre.
 */
export const PROTECTED_CONTAINERS = Object.freeze(["dte-firmador-metatraining-test"]);

/**
 * Hostnames de firmadores existentes administrados manualmente: nunca se
 * escribe un include de Zolvi en su vhost, aunque el slug sea otro. Los
 * hostnames de TrustMe quedan cubiertos además por la regla de includes
 * ajenos en el directorio del vhost (ver zolvi-signer-executor.mjs).
 */
export const PROTECTED_HOSTNAMES = Object.freeze(["firmador-metatraining-test.getzolvi.com"]);

export const DEFAULT_ALLOWED_ROOT_DOMAINS = Object.freeze(["getzolvi.com"]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])$/;
const HOST_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const NIT_RE = /^\d{9,14}$/;
const CPANEL_USER_RE = /^[a-z][a-z0-9]{0,15}$/;
const API_KEY_RE = /^[a-f0-9]{64}$/;

export function validateSlug(slug) {
  return typeof slug === "string" && SLUG_RE.test(slug) && !slug.includes("--");
}

export function validateEnvironment(env) {
  return env === "TEST" || env === "PRODUCTION";
}

export function validateHostname(hostname, allowedRootDomains = DEFAULT_ALLOWED_ROOT_DOMAINS) {
  if (typeof hostname !== "string" || hostname.length > 253) return false;
  const h = hostname.toLowerCase();
  if (h !== hostname) return false;
  const labels = h.split(".");
  if (labels.length < 3 || !labels.every((l) => HOST_LABEL_RE.test(l))) return false;
  return allowedRootDomains.some((root) => h.endsWith(`.${root}`));
}

export function validatePort(port) {
  return (
    Number.isInteger(port) &&
    port >= PORT_RANGE.min &&
    port <= PORT_RANGE.max &&
    !RESERVED_PORTS.includes(port)
  );
}

export function validateNit(nit) {
  return typeof nit === "string" && NIT_RE.test(nit);
}

export function validateCpanelUser(user) {
  return typeof user === "string" && CPANEL_USER_RE.test(user);
}

export function validateApiKey(key) {
  return typeof key === "string" && API_KEY_RE.test(key);
}

export function envSuffix(environment) {
  return environment === "PRODUCTION" ? "prod" : "test";
}

/**
 * Valida una especificación declarativa completa.
 * spec = { slug, environment, hostname, port, signerNit, cpanelUser, allowedRootDomains? }
 */
export function validateSignerSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") return { ok: false, errors: ["Especificación ausente."] };
  if (!validateSlug(spec.slug)) errors.push("slug inválido: 2-32 caracteres [a-z0-9-], sin guiones al inicio/fin.");
  if (!validateEnvironment(spec.environment)) errors.push("environment debe ser TEST o PRODUCTION.");
  if (!validateHostname(spec.hostname, spec.allowedRootDomains ?? DEFAULT_ALLOWED_ROOT_DOMAINS)) {
    errors.push("hostname inválido o fuera de los dominios permitidos.");
  }
  if (!validatePort(spec.port)) {
    errors.push(`port inválido: debe estar en ${PORT_RANGE.min}-${PORT_RANGE.max} y no ser reservado (${RESERVED_PORTS.join(", ")}).`);
  }
  if (!validateNit(spec.signerNit)) errors.push("signerNit inválido: 9-14 dígitos sin guiones.");
  if (!validateCpanelUser(spec.cpanelUser)) errors.push("cpanelUser inválido.");
  if (spec.environment && spec.hostname && validateEnvironment(spec.environment)) {
    const suffix = envSuffix(spec.environment);
    if (!String(spec.hostname).split(".")[0].endsWith(`-${suffix}`)) {
      errors.push(`hostname debe identificar el ambiente: el primer label debe terminar en "-${suffix}".`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Nombres deterministas de recursos — mismo resultado en Zolvi y en el VPS. */
export function deriveResourceNames(spec) {
  const suffix = envSuffix(spec.environment);
  const id = `${spec.slug}-${suffix}`;
  const dir = `${BASE_DIR}/${id}`;
  return {
    id,
    containerName:  `dte-firmador-${id}`,
    composeProject: `zolvi-signer-${id}`,
    dir,
    certDir:        `${dir}/cert`,
    certFile:       `${dir}/cert/${spec.signerNit}.crt`,
    composeFile:    `${dir}/docker-compose.yml`,
    apiKeyFile:     `${dir}/apikey.conf`,
    manifestFile:   `${dir}/.zolvi-manifest.json`,
    vhostIncludeName: `zolvi-signer-${id}.conf`,
    vhostIncludePath: `/etc/apache2/conf.d/userdata/ssl/2_4/${spec.cpanelUser}/${spec.hostname}/zolvi-signer-${id}.conf`,
    defineName:     `ZOLVI_SIGNER_KEY_${id.toUpperCase().replace(/-/g, "_")}`,
    signerUrl:      `https://${spec.hostname}/firmardocumento/`,
    labels: {
      "zolvi.managed":            "true",
      "zolvi.signer.id":          id,
      "zolvi.signer.environment": spec.environment,
      "zolvi.template.version":   TEMPLATE_VERSION,
    },
  };
}

function assertValid(spec) {
  const v = validateSignerSpec(spec);
  if (!v.ok) throw new Error(`Especificación inválida: ${v.errors.join(" ")}`);
}

export function renderCompose(spec) {
  assertValid(spec);
  const n = deriveResourceNames(spec);
  const labels = Object.entries(n.labels).map(([k, v]) => `      ${k}: "${v}"`).join("\n");
  return [
    `# ${TEMPLATE_VERSION} — generado por Zolvi; no editar a mano (${n.id})`,
    `name: ${n.composeProject}`,
    `services:`,
    `  firmador:`,
    `    image: ${SIGNER_IMAGE}`,
    `    container_name: ${n.containerName}`,
    `    restart: unless-stopped`,
    `    mem_limit: 512m`,
    `    ports:`,
    `      - "127.0.0.1:${spec.port}:${SIGNER_INTERNAL_PORT}"`,
    `    volumes:`,
    `      - "${n.certDir}:/uploads:ro"`,
    `    labels:`,
    labels,
    `    logging:`,
    `      driver: json-file`,
    `      options:`,
    `        max-size: "10m"`,
    `        max-file: "3"`,
    ``,
  ].join("\n");
}

/**
 * Include Apache para el vhost SSL del subdominio (cPanel userdata).
 * - Exige X-DTE-Signer-Key == valor Define (archivo 0600 separado).
 * - Mantiene /.well-known/ abierto para AutoSSL.
 * - Sin RewriteRule ni ErrorDocument hacia una URL/ruta local: evita el
 *   bucle AH00124 observado en el incidente MetaTraining.
 * - `ErrorDocument 403 "Forbidden"` (texto literal, sin redirección
 *   interna): sin él, el vhost hereda el `ErrorDocument 403 /403.shtml` de
 *   cPanel; la redirección interna a /403.shtml cae en ProxyPass "/" y el
 *   firmador responde 404 JSON (path="/403.shtml") en lugar de 403
 *   (REC TEST, 2026-11-11). Un mensaje literal no genera subpetición, así
 *   que no puede reintroducir AH00124. Va al final del include: coincide
 *   byte a byte con la corrección aplicada en el VPS.
 */
export function renderVhostInclude(spec) {
  assertValid(spec);
  const n = deriveResourceNames(spec);
  return [
    `# ${TEMPLATE_VERSION} — generado por Zolvi; no editar a mano (${n.id})`,
    `Include "${n.apiKeyFile}"`,
    `ProxyRequests Off`,
    `ProxyPreserveHost On`,
    `ProxyPass "/.well-known/" "!"`,
    `ProxyPass "/" "http://127.0.0.1:${spec.port}/" connectiontimeout=5 timeout=60 retry=0`,
    `ProxyPassReverse "/" "http://127.0.0.1:${spec.port}/"`,
    `<Location "/">`,
    `  Require expr "%{HTTP:X-DTE-Signer-Key} == '\${${n.defineName}}'"`,
    `</Location>`,
    `<Location "/.well-known/">`,
    `  Require all granted`,
    `</Location>`,
    `ErrorDocument 403 "Forbidden"`,
    ``,
  ].join("\n");
}

export function renderApiKeyDefine(spec, apiKey) {
  assertValid(spec);
  if (!validateApiKey(apiKey)) throw new Error("API Key inválida: se esperan 64 caracteres hex.");
  const n = deriveResourceNames(spec);
  return `# ${TEMPLATE_VERSION} — secreto del firmador ${n.id}; permisos 0600 root\nDefine ${n.defineName} ${apiKey}\n`;
}

/**
 * Asigna un puerto libre del rango, evitando reservados, puertos ya
 * registrados en Zolvi y puertos observados en el VPS.
 */
export function allocatePort({ usedPorts = [], preferred = null } = {}) {
  const used = new Set([...RESERVED_PORTS, ...usedPorts]);
  if (preferred !== null && validatePort(preferred) && !used.has(preferred)) return preferred;
  for (let p = PORT_RANGE.min; p <= PORT_RANGE.max; p++) {
    if (!used.has(p)) return p;
  }
  return null;
}
