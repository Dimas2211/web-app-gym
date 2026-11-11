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

/** [{ section, key, line }] — directiva con su sección y número de línea (1-based). */
const sectioned = (unit) => {
  let section = null;
  return unit.split(/\r?\n/).flatMap((l, i) => {
    const t = l.trim();
    if (/^\[.+\]$/.test(t)) { section = t.slice(1, -1); return []; }
    if (!t || t.startsWith("#") || t.startsWith(";")) return [];
    return [{ section, key: t.slice(0, t.indexOf("=")), line: i + 1 }];
  });
};

// Claves válidas por sección (systemd.unit(5), systemd.service(5), systemd.exec(5)) que usan
// estas unidades. Una clave en la sección equivocada systemd la IGNORA con solo una advertencia
// ("Unknown key name 'CollectMode' in section 'Service', ignoring" — validación de e9bf16a).
const ALLOWED = {
  Unit: ["Description", "After", "Wants", "Requisite", "AssertPathExists", "AssertFileIsExecutable", "CollectMode"],
  Service: ["Type", "ExecStart", "TimeoutStartSec", "Restart", "RestartSec", "Environment", "EnvironmentFile",
    "RuntimeDirectory", "RuntimeDirectoryMode", "RuntimeDirectoryPreserve", "StateDirectory", "StateDirectoryMode",
    "UMask", "NoNewPrivileges", "ProtectSystem", "ProtectHome", "PrivateTmp", "ReadWritePaths",
    "ProtectKernelModules", "ProtectKernelLogs", "ProtectKernelTunables", "ProtectControlGroups", "ProtectClock",
    "ProtectHostname", "RestrictRealtime", "RestrictNamespaces", "RestrictSUIDSGID", "LockPersonality",
    "SystemCallArchitectures"],
  Install: ["WantedBy"],
};

describe("unidades systemd — cada directiva en su sección (sin claves que systemd ignore)", () => {
  for (const [name, unit] of [["zolvi-apache-helper@.service", read("zolvi-apache-helper@.service")], ["zolvi-signer-executor.service", read("zolvi-signer-executor.service")]]) {
    it(`${name}: solo secciones conocidas y claves válidas para su sección`, () => {
      const wrong = sectioned(unit).filter(({ section, key }) => !(ALLOWED[section] ?? []).includes(key))
        .map(({ section, key, line }) => `${name}:${line}: ${key} en [${section}]`);
      expect(wrong).toEqual([]);
    });
  }

  it("REGRESIÓN e9bf16a: CollectMode=inactive-or-failed está en [Unit] del helper, nunca en [Service]", () => {
    const helper = sectioned(read("zolvi-apache-helper@.service"));
    expect(helper.filter((d) => d.key === "CollectMode").map((d) => d.section)).toEqual(["Unit"]);
    expect(values(read("zolvi-apache-helper@.service"), "CollectMode")).toEqual(["inactive-or-failed"]);
  });
});

describe("runbook — systemd-analyze verify estricto (una advertencia NO es aceptable)", () => {
  const runbook = readFileSync(new URL("./deploy/RUNBOOK-apache-helper.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const zverify = /zverify\(\) \{[\s\S]*?\n\}/.exec(runbook)?.[0] ?? "";

  it("define zverify: falla ante código != 0 o cualquier línea que mencione una unidad Zolvi", () => {
    expect(zverify).toContain('systemd-analyze verify "$@" 2>&1');
    expect(zverify).toMatch(/\[ "\$rc" -eq 0 \]/);
    expect(zverify).toContain("return 1");
    const pattern = /grep -qE '([^']+)'/.exec(zverify)?.[1];
    const re = new RegExp(pattern);
    // La advertencia real de la validación en el VPS debe detener el procedimiento.
    expect(re.test("zolvi-apache-helper@configtest.service:64: Unknown key name 'CollectMode' in section 'Service', ignoring.")).toBe(true);
    expect(re.test("/etc/systemd/system/zolvi-signer-executor.service:12: Unknown key name 'Foo' in section 'Service', ignoring.")).toBe(true);
    expect(re.test("httpd.service: Command /usr/sbin/httpd is not executable")).toBe(false); // ajeno: no bloquea
  });

  it("toda verificación de unidades del runbook usa zverify (nunca `verify ... && echo VERIFY_OK`)", () => {
    const code = [...runbook.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n").replace(zverify, "")
      .split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(code).not.toMatch(/systemd-analyze verify/);
    expect((code.match(/^zverify /gm) ?? []).length).toBeGreaterThanOrEqual(2); // F0 y F2
  });
});

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
