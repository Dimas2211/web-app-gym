// FISCAL-ONBOARDING — regresión de las unidades systemd del VPS.
// Fija: runtime Node real del VPS (EasyApache ea-nodejs22), helper SIN sandbox
// de sistema de archivos (causa raíz confirmada) y ejecutor HTTP con su
// aislamiento intacto.

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const read = (f) => readFileSync(new URL(`./systemd/${f}`, import.meta.url), "utf8");
const directives = (unit) => unit.split(/\r?\n/).filter((l) => l && !l.startsWith("#") && !l.startsWith("[")).map((l) => {
  const i = l.indexOf("=");
  return [l.slice(0, i), l.slice(i + 1)];
});
const values = (unit, key) => directives(unit).filter(([k]) => k === key).map(([, v]) => v);

const NODE = "/opt/cpanel/ea-nodejs22/bin/node";
const EXECUTOR = read("zolvi-signer-executor.service");
const HELPER = read("zolvi-apache-helper@.service");

describe("unidades systemd — runtime Node del VPS", () => {
  it("ambas unidades usan el Node de EasyApache confirmado en el VPS (no /usr/bin/node)", () => {
    expect(values(EXECUTOR, "ExecStart")).toEqual([`${NODE} /opt/zolvi-signer-executor/zolvi-signer-executor.mjs serve --port 9750`]);
    expect(values(HELPER, "ExecStart")).toEqual([`${NODE} /opt/zolvi-signer-executor/zolvi-apache-helper.mjs "%i"`]);
    for (const u of [EXECUTOR, HELPER]) {
      expect(directives(u).some(([, v]) => v.includes("/usr/bin/node"))).toBe(false);
      expect(values(u, "AssertFileIsExecutable")).toEqual([NODE]);
    }
  });
});

describe("helper — contexto root que cPanel necesita (causa raíz confirmada)", () => {
  it("sin ProtectSystem/ProtectHome/PrivateTmp ni restricciones de rutas, usuario o capabilities", () => {
    const forbidden = ["ProtectSystem", "ProtectHome", "PrivateTmp", "ReadWritePaths", "ReadOnlyPaths", "InaccessiblePaths",
      "TemporaryFileSystem", "BindPaths", "BindReadOnlyPaths", "User", "Group", "DynamicUser", "CapabilityBoundingSet",
      "AmbientCapabilities", "PrivateUsers", "PrivateDevices", "RestrictSUIDSGID"];
    const present = directives(HELPER).map(([k]) => k);
    expect(present.filter((k) => forbidden.includes(k))).toEqual([]);
  });

  it("oneshot bajo demanda, sin [Install], sin restart y solo si Apache está activo", () => {
    expect(values(HELPER, "Type")).toEqual(["oneshot"]);
    expect(HELPER).not.toMatch(/^\[Install\]/m);
    expect(values(HELPER, "Requisite")).toEqual(["httpd.service"]);
    expect(directives(HELPER).some(([k, v]) => /Restart|ExecReload|ExecStop/.test(k) || /restart/i.test(v))).toBe(false);
  });

  it("documenta la causa confirmada (lock de Cloudflare y .htpasswds)", () => {
    expect(HELPER).toContain("/etc/apache2/conf.d/includes/cloudflare.conf.lock");
    expect(HELPER).toContain(".htpasswds");
  });
});

describe("ejecutor HTTP — aislamiento intacto", () => {
  it("conserva ProtectSystem=strict, ProtectHome, PrivateTmp, NoNewPrivileges y demás protecciones", () => {
    for (const [k, v] of [["ProtectSystem", "strict"], ["ProtectHome", "true"], ["PrivateTmp", "true"], ["NoNewPrivileges", "true"],
      ["ProtectKernelTunables", "true"], ["ProtectKernelModules", "true"], ["ProtectControlGroups", "true"],
      ["RestrictSUIDSGID", "true"], ["LockPersonality", "true"], ["UMask", "0077"]]) {
      expect(values(EXECUTOR, k)).toEqual([v]);
    }
  });

  it("ReadWritePaths no se amplía: ni /etc/apache2/conf.d (raíz/includes), ni /home, ni /root, ni /etc", () => {
    const rw = values(EXECUTOR, "ReadWritePaths").join(" ").split(/\s+/).map((p) => p.replace(/^-/, ""));
    expect(rw).toEqual(["/opt/zolvi-signers", "/etc/apache2/conf.d/userdata", "/etc/apache2/conf", "/var/run", "/run",
      "/var/cpanel", "/etc/apache2/logs", "/usr/local/apache/logs", "/usr/local/cpanel/logs", "/var/log"]);
    for (const bad of ["/etc", "/etc/apache2", "/etc/apache2/conf.d", "/etc/apache2/conf.d/includes", "/home", "/root"]) {
      expect(rw).not.toContain(bad);
    }
  });

  it("delega Apache al helper (ZOLVI_SIGNER_APACHE_MODE=helper)", () => {
    expect(values(EXECUTOR, "Environment")).toContain("ZOLVI_SIGNER_APACHE_MODE=helper");
  });
});
