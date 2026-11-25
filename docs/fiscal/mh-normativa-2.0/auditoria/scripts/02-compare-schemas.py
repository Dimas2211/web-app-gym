#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ZOLVI — Actualización normativa MH 2.0 — FASE 2
Comparación estructural reproducible de JSON Schemas MH (históricos vs paquete 2.0).

Solo lectura. No modifica schemas, código ni datos.
Ejecutar desde la raíz del repositorio:

    python -I docs/fiscal/mh-normativa-2.0/auditoria/scripts/02-compare-schemas.py

Fuentes:
  - Históricos oficiales : docs/dte-official/raw/svfe-json-schemas.zip (leído sin extraer)
  - Repositorio/efectivos: src/modules/commerce/dte/schemas/mh/*.json
  - Nuevos oficiales     : docs/fiscal/mh-normativa-2.0/originales/svfe-json-schemas/v*/*.json
  - Matriz Fase 1        : docs/fiscal/mh-normativa-2.0/auditoria/01-matriz-normativa.json
  - Incidencias Fase 1   : docs/fiscal/mh-normativa-2.0/auditoria/01-discrepancias-documentales.md

Salidas (sobrescribe solo estas):
  - auditoria/02-inventario-schemas.json
  - auditoria/02-schema-diff.json

No hay $ref en ninguno de los 28 schemas (verificado por el script); si apareciera
un $ref interno "#/..." se resuelve; los externos se registran y no se descargan.
"""
import difflib
import glob
import hashlib
import json
import os
import re
import sys
import zipfile
from collections import OrderedDict, defaultdict

REPO = os.getcwd()
BASE = os.path.join(REPO, "docs", "fiscal", "mh-normativa-2.0")
AUD = os.path.join(BASE, "auditoria")
NEW_DIR = os.path.join(BASE, "originales", "svfe-json-schemas")
HIST_ZIP = os.path.join(REPO, "docs", "dte-official", "raw", "svfe-json-schemas.zip")
HIST_ZIP_JUL = os.path.join(REPO, "docs", "dte-official", "raw", "svfe-json-schemas-julio2026.zip")
REPO_SCHEMAS = os.path.join(REPO, "src", "modules", "commerce", "dte", "schemas", "mh")
SRC = os.path.join(REPO, "src")
DTE = "src/modules/commerce/dte"

if not os.path.isdir(NEW_DIR) or not os.path.isfile(HIST_ZIP):
    sys.exit("Ejecutar desde la raíz del repositorio (no se encontraron las fuentes).")

# ─────────────────────────────────────────────────────────────────────────────
# Emparejamientos. Evidencia de equivalencia: título del schema + tipoDte const +
# referencias explícitas de la matriz Fase 1 (MH20-032 cita fe-f-v2 para FE v2,
# MH20-052 cita invalidacion-schema-v3, MH20-055 cita contingencia-schema-v4).
# ─────────────────────────────────────────────────────────────────────────────
PAIRS = [
    # id, etiqueta, histórico (zip), nuevo (rel. NEW_DIR), efectivo Zolvi (rel. REPO_SCHEMAS o None), prioridad, ofrecido por Zolvi
    ("FE01", "FE 01 Factura", "fe-fc-v1.json", "v2/fe-f-v2.json", "fe-01.schema.json", 1, True),
    ("CCF03", "CCF 03 Crédito Fiscal", "fe-ccf-v3.json", "v4/fe-ccf-v4.json", "ccfe-03.schema.json", 1, True),
    ("NC05", "NC 05 Nota de Crédito", "fe-nc-v3.json", "v4/fe-nc-v4.json", "fe-nc-v3.json", 1, True),
    ("FEX11", "FEX 11 Factura de Exportación", "fe-fex-v1.json", "v3/fe-fex-v3.json", "fex-11-v3.schema.json", 1, True),
    ("FSE14", "FSE 14 Sujeto Excluido", "fe-fse-v1.json", "v2/fe-fse-v2.json", "fse-14.schema.json", 1, True),
    ("INV", "Evento de Invalidación", "anulacion-schema-v2.json", "v3/invalidacion-schema-v3.json", "anulacion-schema-v2.json", 1, True),
    ("CONT", "Evento de Contingencia", "contingencia-schema-v3.json", "v4/contingencia-schema-v4.json", "contingencia-schema-v3.json", 1, True),
    ("ERET", "Evento de Retorno", None, "v1/fe-eret-v1.json", None, 2, False),
    ("EOP", "Evento de Operaciones Especiales", None, "v1/fe-eop-v1.json", None, 2, False),
    ("NR04", "NR 04 Nota de Remisión", "fe-nr-v3.json", "v4/fe-nr-v4.json", None, 3, False),
    ("ND06", "ND 06 Nota de Débito", "fe-nd-v3.json", "v4/fe-nd-v4.json", None, 3, False),
    ("CR07", "CR 07 Comprobante de Retención", "fe-cr-v1.json", "v2/fe-cr-v2.json", None, 3, False),
    ("CL08", "CL 08 Comprobante de Liquidación", "fe-cl-v1.json", "v2/fe-cl-v2.json", None, 3, False),
    ("DCL09", "DCL 09 Documento Contable de Liquidación", "fe-dcl-v1.json", "v2/fe-dcl-v2.json", None, 3, False),
    ("CD15", "CD 15 Comprobante de Donación", "fe-cd-v1.json", "v2/fe-cd-v2.json", None, 3, False),
]

# Etiqueta de tipo usada en "tipos_dte_afectados" de la matriz Fase 1
MATRIX_LABEL = {"FE01": "FE", "CCF03": "CCFE", "NC05": "NCE", "FEX11": "FEXE", "FSE14": "FSEE",
                "NR04": "NRE", "ND06": "NDE", "CR07": "CRE", "CL08": "CLE", "DCL09": "DCLE", "CD15": "CDE"}
# Bloques de la matriz que regulan cada evento
EVENT_BLOCKS = {"INV": {"B10"}, "CONT": {"B11"}, "ERET": {"B12"}, "EOP": {"B13"}}

# Consumidores directos por tipo (rutas exactas o glob, relativas al repo). Obtenidos de los
# imports de validate-dte-json-schema.service.ts, mh-test-scenarios.ts y builders de eventos.
COMMON_CONSUMERS = [
    f"{DTE}/services/validate-dte-json-schema.service.ts",
    f"{DTE}/services/transmit-dte-document.service.ts",
    f"{DTE}/mh-test-runs/mh-test-scenarios.ts",
    f"{DTE}/mh-test-runs/mh-test-documents.service.ts",
    f"{DTE}/certification/harness/certification-fixtures.ts",
    f"{DTE}/services/build-external-dte-payload.service.ts",
]
CONSUMERS = {
    "FE01": [f"{DTE}/services/generate-fe-json.service.ts", f"{DTE}/services/generate-fe-json*.test.ts",
             f"{DTE}/types/dte.types.ts", "src/modules/commerce/purchases/services/purchase-dte-import.service.ts",
             "src/modules/commerce/purchases/types/purchase-dte-import.types.ts"],
    "CCF03": [f"{DTE}/services/generate-ccfe-json.service.ts", f"{DTE}/services/generate-ccfe-json*.test.ts",
              f"{DTE}/actions/generate-ccfe-json-for-sale.action.test.ts",
              "src/modules/commerce/purchases/services/purchase-dte-import.service.ts",
              "src/modules/commerce/purchases/types/purchase-dte-import.types.ts"],
    "NC05": [f"{DTE}/services/generate-nc-json.service.ts", f"{DTE}/services/generate-nc-json*.test.ts",
             f"{DTE}/services/create-credit-note-dte.service.ts"],
    "FEX11": [f"{DTE}/services/generate-fex-json.service.ts", f"{DTE}/types/fex-json.types.ts",
              f"{DTE}/utils/fex11-*.ts", f"{DTE}/services/fex11-v3.test-fixture.ts",
              f"{DTE}/dev/verify-fex11-json.fixture.ts"],
    "FSE14": [f"{DTE}/services/generate-fse-json.service.ts", f"{DTE}/types/fse-json.types.ts",
              f"{DTE}/utils/supplier-to-sujeto-excluido.mapper.ts", f"{DTE}/services/generate-fse-json*.test.ts"],
    "INV": [f"{DTE}/services/build-invalidation-event-json.service.ts", f"{DTE}/types/dte-invalidation-event-json.types.ts",
            f"{DTE}/services/create-invalidation-event.service.ts", f"{DTE}/services/transmit-invalidation-event.service.ts",
            f"{DTE}/services/build-external-invalidation-payload.service.ts",
            f"{DTE}/services/build-invalidation-event-json*.test.ts"],
    "CONT": [f"{DTE}/services/build-contingency-event-json.service.ts", f"{DTE}/types/dte-contingency-event-json.types.ts",
             f"{DTE}/services/persist-contingency-event-json.service.ts",
             f"{DTE}/utils/dte-contingency-identification.utils.ts"],
}
EVENT_IDS = {"INV", "CONT", "ERET", "EOP"}

# Correspondencias etiqueta normativa → campo JSON (solo para enlazar MH20 por texto).
LABEL_FIELDS = [
    (r"retenci[oó]n renta", ["reteRenta"]), (r"extensi[oó]n", ["extension"]),
    (r"observaciones", ["observaciones"]), (r"distrito", ["distrito"]),
    (r"tipo de r[eé]gimen", ["regimen", "tipoRegimen"]), (r"iva percibido", ["ivaPerci", "ivaPerci1", "ivaPercibido"]),
    (r"iva retenido", ["ivaRete", "ivaRete1", "ivaRetenido"]), (r"sub total", ["subTotal"]),
    (r"monto total de la operaci[oó]n", ["montoTotalOperacion"]),
    (r"tipo de establecimiento", ["tipoEstablecimiento"]), (r"fusion", ["fusion"]),
    (r"c[oó]digo retenci[oó]n mh", ["codigoRetencionMH"]), (r"total a pagar", ["totalPagar"]),
    (r"iva 13", ["ivaItem", "totalIva", "iva", "montoIva"]), (r"tipo de [ií]tem", ["tipoItem", "tipoItemExpor"]),
    (r"c[oó]digo del tributo", ["codTributo"]), (r"tributo", ["tributos"]),
    (r"documentos? relacionados?", ["documentoRelacionado"]), (r"n[uú]mero de control", ["numeroControl"]),
    (r"compra por cuenta de terceros", ["compraTercero"]), (r"porcentaje de descuento", ["porcentajeDescuento"]),
    (r"descuentos? globales", ["descuGravada", "descuNoSuj", "descuExenta"]), (r"nit \(receptor\)", ["nit"]),
    (r"casa matriz|sucursal", ["nomEstablecimiento"]), (r"c[oó]digos? de establecimiento", ["codEstableMH", "codEstable"]),
    (r"punto de venta", ["codPuntoVentaMH", "codPuntoVenta", "puntoVentaMH", "puntoVenta"]),
    (r"cargos/abonos", ["noGravado", "totalNoGravado"]), (r"fecha del evento", ["fecAnula", "fTransmision", "fecEmi"]),
    (r"tipo de invalidaci[oó]n", ["tipoAnulacion"]), (r"tipo de dte", ["tipoDte"]),
    (r"fecha de generaci[oó]n", ["fecEmi", "fechaEmision"]), (r"modoTransp", ["modoTransp"]),
    (r"exportaciones que no representan ventas", ["totalNoOnerosas"]),
    (r"tipo de documento", ["tipoDocumento", "tipDocResponsable", "tipDocSolicita"]),
]

STD_KEYWORDS = {
    "$schema", "$id", "$ref", "$comment", "title", "description", "default", "examples", "readOnly", "writeOnly",
    "type", "enum", "const", "multipleOf", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum",
    "maxLength", "minLength", "pattern", "items", "additionalItems", "maxItems", "minItems", "uniqueItems",
    "contains", "maxProperties", "minProperties", "required", "properties", "patternProperties",
    "additionalProperties", "dependencies", "propertyNames", "if", "then", "else", "allOf", "anyOf", "oneOf",
    "not", "format", "contentMediaType", "contentEncoding", "definitions", "$defs",
}
CONSTRAINT_KEYS = ["pattern", "format", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
                   "minLength", "maxLength", "minItems", "maxItems", "multipleOf", "additionalProperties",
                   "uniqueItems", "minProperties", "maxProperties"]
NOISE_KEYS = {"description", "title", "$comment", "examples", "default"}


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def loads(b):
    return json.loads(b.decode("utf-8-sig"))


def esc(tok):
    return str(tok).replace("~", "~0").replace("/", "~1")


def canon(o):
    def strip(x):
        if isinstance(x, dict):
            return {k: strip(v) for k, v in x.items() if k not in NOISE_KEYS}
        if isinstance(x, list):
            return [strip(v) for v in x]
        return x
    return json.dumps(strip(o), sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def version_of(s):
    try:
        v = s["properties"]["identificacion"]["properties"]["version"]
        return v.get("const", v.get("enum"))
    except (KeyError, TypeError):
        return None


def tipodte_of(s):
    try:
        v = s["properties"]["identificacion"]["properties"]["tipoDte"]
        return v.get("const", v.get("enum"))
    except (KeyError, TypeError):
        return None


# ─────────────────────────────── aplanado ───────────────────────────────────
class Flat:
    def __init__(self, schema):
        self.root = schema
        self.nodes = OrderedDict()          # ruta_instancia -> {"ptr": [...], "kw": {...}, "props": set, "required": set}
        self.conds = defaultdict(list)      # ruta_instancia -> [(ptr, obj)]
        self.anomalies = []                 # (ptr, keyword)
        self.ext_refs = []
        self.desc_count = 0
        self._walk(schema, "", "")

    def _resolve(self, node, ptr):
        seen = set()
        while isinstance(node, dict) and "$ref" in node:
            ref = node["$ref"]
            if not ref.startswith("#"):
                self.ext_refs.append((ptr, ref))
                return node, ptr
            if ref in seen:
                return node, ptr
            seen.add(ref)
            tgt = self.root
            for t in [p for p in ref[1:].split("/") if p]:
                t = t.replace("~1", "/").replace("~0", "~")
                tgt = tgt[int(t)] if isinstance(tgt, list) else tgt[t]
            node, ptr = tgt, ref[1:]
        return node, ptr

    def _walk(self, node, path, ptr):
        node, ptr = self._resolve(node, ptr)
        if not isinstance(node, dict):
            return
        for k in node:
            if k not in STD_KEYWORDS:
                self.anomalies.append((ptr or "/", k))
        # Anomalías semánticas: keyword válido aplicado a un tipo donde no tiene efecto
        tl = [node["type"]] if isinstance(node.get("type"), str) else list(node.get("type") or [])
        tset = {t for t in tl if t != "null"}
        if tset == {"string"}:
            for k in ("maximum", "minimum", "exclusiveMaximum", "exclusiveMinimum", "multipleOf"):
                if k in node:
                    self.anomalies.append((ptr or "/", f"{k}_sobre_string(sin_efecto)"))
            pat = node.get("pattern")
            if isinstance(pat, str) and pat.startswith("^") and not pat.endswith("$"):
                self.anomalies.append((ptr or "/", "pattern_sin_ancla_final"))
        if tset and tset <= {"number", "integer"}:
            for k in ("maxLength", "minLength", "pattern"):
                if k in node:
                    self.anomalies.append((ptr or "/", f"{k}_sobre_numero(sin_efecto)"))
        if "description" in node:
            self.desc_count += 1
        ent = self.nodes.setdefault(path or "/", {"ptr": [], "kw": {}, "props": set(), "required": set()})
        ent["ptr"].append(ptr or "/")
        for k in ["type", "enum", "const"] + CONSTRAINT_KEYS:
            if k in node:
                v = node[k]
                if k == "additionalProperties" and isinstance(v, dict):
                    v = "schema:" + canon(v)
                ent["kw"][k] = v
        ent["required"].update(node.get("required", []))
        if "dependencies" in node:
            self.conds[path or "/"].append((ptr + "/dependencies", {"dependencies": node["dependencies"]}))
        if any(k in node for k in ("if", "then", "else")):
            self.conds[path or "/"].append((ptr or "/", {k: node.get(k) for k in ("if", "then", "else") if k in node}))
        if "not" in node:
            self.conds[path or "/"].append((ptr + "/not", {"not": node["not"]}))
        for name, sub in (node.get("properties") or {}).items():
            ent["props"].add(name)
            self._walk(sub, f"{path}/{name}", f"{ptr}/properties/{esc(name)}")
        items = node.get("items")
        if isinstance(items, dict):
            self._walk(items, f"{path}/[]", f"{ptr}/items")
        elif isinstance(items, list):
            for i, it in enumerate(items):
                self._walk(it, f"{path}/[{i}]", f"{ptr}/items/{i}")
        for comb in ("allOf", "anyOf", "oneOf"):
            for i, br in enumerate(node.get(comb) or []):
                bptr = f"{ptr}/{comb}/{i}"
                br, bptr = self._resolve(br, bptr)
                if not isinstance(br, dict):
                    continue
                if comb == "allOf" and any(k in br for k in ("if", "then", "else")):
                    self.conds[path or "/"].append((bptr, {k: br.get(k) for k in ("if", "then", "else") if k in br}))
                    rest = {k: v for k, v in br.items() if k not in ("if", "then", "else")}
                    if rest.get("properties") or rest.get("required"):
                        self._walk(rest, path, bptr)
                elif comb == "allOf":
                    self._walk(br, path, bptr)
                else:
                    self.conds[path or "/"].append((bptr, {comb + "_branch": br}))
                    self._walk(br, f"{path}{{{comb}:{i}}}", bptr)


def norm_type(t):
    if t is None:
        return None, None
    ts = [t] if isinstance(t, str) else list(t)
    return sorted(x for x in ts if x != "null"), ("null" in ts)


def trunc(v, n=1500):
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, sort_keys=True)
    return s if len(s) <= n else s[:n] + f"…[truncado, {len(s)} chars, sha256={sha256_bytes(s.encode())[:16]}]"


# ─────────────────────────── consumidores en código ─────────────────────────
_file_cache = {}


def read_src(rel):
    if rel not in _file_cache:
        try:
            with open(os.path.join(REPO, rel), encoding="utf-8", errors="replace") as f:
                _file_cache[rel] = f.read().splitlines()
        except OSError:
            _file_cache[rel] = None
    return _file_cache[rel]


def consumer_files(pid):
    pats = COMMON_CONSUMERS + CONSUMERS.get(pid, [])
    out = []
    for p in pats:
        hits = sorted(glob.glob(os.path.join(REPO, p))) if "*" in p else [os.path.join(REPO, p)]
        for h in hits:
            rel = os.path.relpath(h, REPO).replace("\\", "/")
            if os.path.isfile(h) and rel not in out:
                out.append(rel)
    return out


def find_consumers(pid, field, max_lines=4):
    if pid not in CONSUMERS or not field or field.startswith("["):
        return []
    rx = re.compile(r"""(["'.]%s\b|\b%s\s*\??\s*:)""" % (re.escape(field), re.escape(field)))
    res = []
    for rel in consumer_files(pid):
        lines = read_src(rel)
        if not lines:
            continue
        hit = [i + 1 for i, l in enumerate(lines) if rx.search(l)]
        if hit:
            res.append(f"{rel}:" + ",".join(map(str, hit[:max_lines])) + ("…" if len(hit) > max_lines else ""))
    return res


# ─────────────────────────── matriz MH20 e incidencias ──────────────────────
def load_matrix():
    with open(os.path.join(AUD, "01-matriz-normativa.json"), encoding="utf-8") as f:
        m = json.load(f)
    return m["requisitos"]


def load_incidents():
    rx = re.compile(r"^\|\s*(INC-\d{3})\s*\|(.*)\|\s*([^|]*MH20[^|]*)\|\s*$")
    inc = {}
    with open(os.path.join(AUD, "01-discrepancias-documentales.md"), encoding="utf-8") as f:
        for line in f:
            mm = rx.match(line.strip())
            if mm:
                cols = [c.strip() for c in mm.group(2).split("|")]
                inc[mm.group(1)] = {"titulo": cols[0] if cols else "", "severidad": cols[-1] if cols else "",
                                    "mh20": re.findall(r"MH20-\d{3}", mm.group(3))}
    return inc


def req_fields(req, all_fields):
    text = " ".join(str(req.get(k) or "") for k in ("titulo", "regla_nueva", "regla_anterior", "observaciones"))
    low = text.lower()
    found = {f for f in all_fields if len(f) >= 5 and re.search(r"(?<![A-Za-z])%s(?![A-Za-z])" % re.escape(f), text)}
    for rx, fields in LABEL_FIELDS:
        if re.search(rx, low):
            found.update(fields)
    return found


def req_applies(req, pid):
    if pid in EVENT_BLOCKS:
        return req.get("bloque") in EVENT_BLOCKS[pid]
    lab = MATRIX_LABEL.get(pid)
    return lab in (req.get("tipos_dte_afectados") or [])


# ────────────────────────────────── diff ────────────────────────────────────
def leaf(path):
    parts = [p for p in re.split(r"/", path) if p]
    for p in reversed(parts):
        p = re.sub(r"\{.*?\}", "", p)
        if p and not p.startswith("["):
            return p
    return ""


def tighter(k, old, new):
    if old is None:
        return "MAS_RESTRICTIVO"
    if new is None:
        return "MENOS_RESTRICTIVO"
    if isinstance(old, (int, float)) and isinstance(new, (int, float)) and not isinstance(old, bool):
        if k in ("maxLength", "maxItems", "maximum", "exclusiveMaximum", "maxProperties"):
            return "MAS_RESTRICTIVO" if new < old else "MENOS_RESTRICTIVO"
        if k in ("minLength", "minItems", "minimum", "exclusiveMinimum", "minProperties"):
            return "MAS_RESTRICTIVO" if new > old else "MENOS_RESTRICTIVO"
    if k == "additionalProperties":
        if old is True and new is False:
            return "MAS_RESTRICTIVO"
        if old is False and new is True:
            return "MENOS_RESTRICTIVO"
    return "REVISAR"


def diff_pair(pid, old_s, new_s):
    A, B = Flat(old_s), Flat(new_s)
    out = []

    def add(t, path, pa, pb, old, new, compat, extra=None):
        d = {"tipo_cambio": t, "ruta_instancia": path, "campo": leaf(path),
             "json_pointer_anterior": pa, "json_pointer_nuevo": pb,
             "valor_anterior": old, "valor_nuevo": new, "compatibilidad": compat}
        if extra:
            d.update(extra)
        out.append(d)

    va, vb = version_of(old_s), version_of(new_s)
    if va != vb:
        add("VERSION_CHANGED", "/identificacion/version", "/properties/identificacion/properties/version/const",
            "/properties/identificacion/properties/version/const", va, vb, "INCOMPATIBLE")

    pa_all, pb_all = set(A.nodes), set(B.nodes)
    # Campos añadidos / eliminados (solo raíz de subárbol para no inflar)
    removed = sorted(p for p in pa_all - pb_all if p != "/")
    added = sorted(p for p in pb_all - pa_all if p != "/")

    def parent(p):
        q = p.rsplit("/", 1)[0]
        return q or "/"

    def is_subroot(p, pool):
        q = parent(p)
        while q not in ("", "/"):
            if q in pool:
                return False
            q = parent(q)
        return True

    rem_roots = [p for p in removed if is_subroot(p, set(removed))]
    add_roots = [p for p in added if is_subroot(p, set(added))]
    for p in rem_roots:
        par = parent(p)
        ap_new = B.nodes.get(par, {}).get("kw", {}).get("additionalProperties")
        sub = [q for q in removed if q.startswith(p + "/")]
        add("FIELD_REMOVED", p, A.nodes[p]["ptr"][0], None, trunc(A.nodes[p]["kw"], 400), None,
            "INCOMPATIBLE" if ap_new is False else "REVISAR",
            {"era_requerido": leaf(p) in A.nodes.get(par, {}).get("required", set()),
             "subcampos_eliminados": len(sub)})
    for p in add_roots:
        par = parent(p)
        req = leaf(p) in B.nodes.get(par, {}).get("required", set())
        sub = [q for q in added if q.startswith(p + "/")]
        add("FIELD_ADDED", p, None, B.nodes[p]["ptr"][0], None, trunc(B.nodes[p]["kw"], 400),
            "INCOMPATIBLE" if req else "COMPATIBLE_OPCIONAL",
            {"requerido": req, "subcampos_nuevos": len(sub),
             "nulable": bool(norm_type(B.nodes[p]["kw"].get("type"))[1])})
    # Posibles renombramientos (heurística estructural; NO confirmados documentalmente)
    by_par = defaultdict(lambda: ([], []))
    for p in rem_roots:
        by_par[parent(p)][0].append(p)
    for p in add_roots:
        by_par[parent(p)][1].append(p)
    for par, (rs, ads) in by_par.items():
        for r in rs:
            for a in ads:
                ratio = difflib.SequenceMatcher(None, leaf(r).lower(), leaf(a).lower()).ratio()
                same_t = norm_type(A.nodes[r]["kw"].get("type"))[0] == norm_type(B.nodes[a]["kw"].get("type"))[0]
                pr, pa_ = A.nodes[r]["props"], B.nodes[a]["props"]
                jac = len(pr & pa_) / len(pr | pa_) if (pr or pa_) else 0.0
                if (ratio >= 0.75 or leaf(r).lower() == leaf(a).lower() or jac >= 0.6) and same_t:
                    add("POSSIBLE_RENAME", a, A.nodes[r]["ptr"][0], B.nodes[a]["ptr"][0], leaf(r), leaf(a), "REVISAR",
                        {"evidencia": f"similitud_nombre={ratio:.2f}; jaccard_subcampos={jac:.2f}; tipo igual; mismo padre",
                         "confirmado_documentalmente": False})

    # Nodos comunes
    for p in sorted(pa_all & pb_all):
        na, nb = A.nodes[p], B.nodes[p]
        ka, kb = na["kw"], nb["kw"]
        pa, pb = na["ptr"][0], nb["ptr"][0]
        ta, nla = norm_type(ka.get("type"))
        tb, nlb = norm_type(kb.get("type"))
        if ta != tb and not (ta is None and tb is None):
            add("TYPE_CHANGED", p, pa + "/type", pb + "/type", ka.get("type"), kb.get("type"), "INCOMPATIBLE")
        elif nla != nlb and ta is not None:
            add("NULLABILITY_CHANGED", p, pa + "/type", pb + "/type", ka.get("type"), kb.get("type"),
                "COMPATIBLE" if nlb else "INCOMPATIBLE_SI_SE_ENVIA_NULL")
        for k in ("enum", "const"):
            if canon(ka.get(k)) != canon(kb.get(k)):
                if p == "/identificacion/version":
                    continue  # ya registrado como VERSION_CHANGED
                ea = ka.get(k) if k == "enum" else ([ka[k]] if k in ka else None)
                eb = kb.get(k) if k == "enum" else ([kb[k]] if k in kb else None)
                sa = {json.dumps(x) for x in (ea or [])}
                sb = {json.dumps(x) for x in (eb or [])}
                if ea is None:
                    compat = "MAS_RESTRICTIVO"
                elif eb is None:
                    compat = "MENOS_RESTRICTIVO"
                else:
                    compat = "INCOMPATIBLE_SI_SE_USA_VALOR_ELIMINADO" if sa - sb else "COMPATIBLE"
                add("ENUM_CHANGED", p, pa + "/" + k, pb + "/" + k, ka.get(k), kb.get(k), compat,
                    {"valores_eliminados": sorted(json.loads(x) for x in sa - sb) if ea and eb else None,
                     "valores_agregados": sorted(json.loads(x) for x in sb - sa) if ea and eb else None,
                     "keyword": k})
        for k in CONSTRAINT_KEYS:
            if canon(ka.get(k)) != canon(kb.get(k)):
                add("CONSTRAINT_CHANGED", p, pa + "/" + k, pb + "/" + k, ka.get(k), kb.get(k),
                    tighter(k, ka.get(k), kb.get(k)), {"keyword": k})
        # required de hijos comunes
        for child in sorted((na["props"] & nb["props"])):
            ra, rb = child in na["required"], child in nb["required"]
            if ra != rb:
                cp = (p if p != "/" else "") + "/" + child
                add("REQUIRED_CHANGED", cp, pa + "/required", pb + "/required", ra, rb,
                    "INCOMPATIBLE" if rb else "COMPATIBLE")
    # Condicionales (if/then/else, not, dependencies, ramas oneOf/anyOf)
    for p in sorted(set(A.conds) | set(B.conds)):
        ca = {canon(o): (ptr, o) for ptr, o in A.conds.get(p, [])}
        cb = {canon(o): (ptr, o) for ptr, o in B.conds.get(p, [])}
        only_a = [k for k in ca if k not in cb]
        only_b = [k for k in cb if k not in ca]
        ifs_b = {canon(cb[k][1].get("if")): k for k in only_b if "if" in cb[k][1]}
        paired_b = set()
        for k in only_a:
            ptr_a, oa = ca[k]
            kb2 = ifs_b.get(canon(oa.get("if"))) if "if" in oa else None
            if kb2 and kb2 not in paired_b:
                paired_b.add(kb2)
                add("CONDITIONAL_CHANGED", p, ptr_a, cb[kb2][0], trunc(oa), trunc(cb[kb2][1]), "REVISAR",
                    {"subtipo": "MODIFICADO_MISMA_CONDICION"})
            else:
                add("CONDITIONAL_CHANGED", p, ptr_a, None, trunc(oa), None, "REVISAR", {"subtipo": "ELIMINADO"})
        for k in only_b:
            if k not in paired_b:
                add("CONDITIONAL_CHANGED", p, None, cb[k][0], None, trunc(cb[k][1]), "REVISAR", {"subtipo": "AGREGADO"})
    return out, A, B


# ────────────────────────────────── main ────────────────────────────────────
def main():
    reqs = load_matrix()
    incidents = load_incidents()
    zf = zipfile.ZipFile(HIST_ZIP)
    hist = {os.path.basename(i.filename): zf.read(i) for i in zf.infolist() if not i.is_dir()}
    jul = {}
    if os.path.isfile(HIST_ZIP_JUL):
        zj = zipfile.ZipFile(HIST_ZIP_JUL)
        jul = {i.filename.split("svfe-json-schemas/", 1)[-1]: sha256_bytes(zj.read(i)) for i in zj.infolist() if not i.is_dir()}

    new_files = sorted(glob.glob(os.path.join(NEW_DIR, "v*", "*.json")))
    new = {os.path.relpath(f, NEW_DIR).replace("\\", "/"): open(f, "rb").read() for f in new_files}
    repo = {os.path.basename(f): open(f, "rb").read() for f in sorted(glob.glob(os.path.join(REPO_SCHEMAS, "*.json")))}

    # Consumidores de cada archivo de schema del repo (imports por nombre de archivo)
    src_files = [f for f in glob.glob(os.path.join(SRC, "**", "*.ts*"), recursive=True)]
    importers = defaultdict(list)
    for f in src_files:
        rel = os.path.relpath(f, REPO).replace("\\", "/")
        try:
            lines = open(f, encoding="utf-8", errors="replace").read().splitlines()
        except OSError:
            continue
        for i, l in enumerate(lines):
            for name in repo:
                if name in l and ("import" in l or "require(" in l or "from" in l):
                    importers[name].append(f"{rel}:{i + 1}")

    def info(name, path, b, origin):
        s = loads(b)
        fl = Flat(s)
        return {"nombre": name, "ruta": path, "origen": origin, "tamano": len(b), "sha256": sha256_bytes(b),
                "bom_utf8": b.startswith(b"\xef\xbb\xbf"), "title": s.get("title"),
                "version_declarada": version_of(s), "tipoDte_declarado": tipodte_of(s),
                "sha256_semantico": sha256_bytes(canon(s).encode()), "_s": s,
                "keywords_no_estandar": sorted({f"{p}#{k}" for p, k in fl.anomalies}),
                "refs_externas": fl.ext_refs}

    inv_hist = [info(n, "docs/dte-official/raw/svfe-json-schemas.zip!svfe-json-schemas/" + n, b, "HISTORICO_OFICIAL")
                for n, b in sorted(hist.items())]
    inv_new = []
    for rel, b in sorted(new.items()):
        d = info(os.path.basename(rel), "docs/fiscal/mh-normativa-2.0/originales/svfe-json-schemas/" + rel, b, "NUEVO_OFICIAL")
        d["coincide_con_zip_julio2026"] = (jul.get(rel) == d["sha256"]) if jul else None
        inv_new.append(d)
    inv_repo = []
    for n, b in sorted(repo.items()):
        d = info(n, f"{DTE}/schemas/mh/{n}", b, "REPOSITORIO")
        sem = d["sha256_semantico"]
        d["equivale_semanticamente_a"] = [h["nombre"] + " (histórico)" for h in inv_hist if h["sha256_semantico"] == sem] + \
                                         [x["nombre"] + " (nuevo 2.0)" for x in inv_new if x["sha256_semantico"] == sem]
        d["consumidores_import"] = importers.get(n, [])
        d["usado_por_validador"] = any(("validate-dte-json-schema" in c or "build-invalidation-event-json.service" in c
                                        or "build-contingency-event-json.service" in c) for c in d["consumidores_import"])
        inv_repo.append(d)

    sem_new = {x["nombre"]: x["sha256_semantico"] for x in inv_new}
    efectivos = []
    for pid, label, h, n, eff, prio, offered in PAIRS:
        if not eff:
            continue
        r = next(x for x in inv_repo if x["nombre"] == eff)
        efectivos.append({"id": pid, "documento": label, "schema_efectivo": r["ruta"], "version": r["version_declarada"],
                          "sha256": r["sha256"], "equivale_a_historico": h if any(h in e for e in r["equivale_semanticamente_a"]) else None,
                          "equivale_a_nuevo_2_0": sem_new.get(os.path.basename(n)) == r["sha256_semantico"],
                          "consumidores_import": r["consumidores_import"]})

    all_fields = set()
    for x in inv_hist + inv_new:
        all_fields |= {leaf(p) for p in Flat(x["_s"]).nodes}
    req_fieldmap = {r["id"]: req_fields(r, all_fields) for r in reqs}
    req_by_id = {r["id"]: r for r in reqs}

    diffs = []
    pairs_out = []
    business_rules = defaultdict(set)
    seq = 0
    for pid, label, h, n, eff, prio, offered in PAIRS:
        new_s = loads(new[n])
        ent = {"id": pid, "documento": label, "prioridad_comparacion": prio, "ofrecido_por_zolvi": offered,
               "historico": h, "nuevo": n, "efectivo_zolvi": eff,
               "version_anterior": version_of(loads(hist[h])) if h else None, "version_nueva": version_of(new_s)}
        applicable = [r for r in reqs if req_applies(r, pid)]
        ent["mh20_aplicables"] = [r["id"] for r in applicable]
        if not h:
            ent["estado"] = "NUEVO_SIN_BASE_HISTORICA"
            fl = Flat(new_s)
            ent["campos_nuevo"] = len(fl.nodes)
            seq += 1
            diffs.append({"id": f"SCH20-{seq:03d}", "dte": pid, "documento": label, "tipo_cambio": "NEW_SCHEMA",
                          "ruta_instancia": "/", "campo": "", "json_pointer_anterior": None, "json_pointer_nuevo": "",
                          "valor_anterior": None, "valor_nuevo": {"title": new_s.get("title"), "version": version_of(new_s),
                                                                   "nodos": len(fl.nodes)},
                          "compatibilidad": "NUEVO_SIN_BASE_HISTORICA", "consumidores": [],
                          "mh20": [r["id"] for r in applicable], "clasificacion_normativa": "VINCULADO_MH20" if applicable else "SCHEMA_ONLY",
                          "incidencias": sorted({i for i, v in incidents.items() if set(v["mh20"]) & {r["id"] for r in applicable}}),
                          "afecta_zolvi": False,
                          "nota": "Sin generador en Zolvi; tipo no ofrecido actualmente (no ampliar alcance comercial)."})
            pairs_out.append(ent)
            continue
        raw, A, B = diff_pair(pid, loads(hist[h]), new_s)
        ent["estado"] = "COMPARADO"
        eff_equals_new = bool(eff) and any(e["id"] == pid and e["equivale_a_nuevo_2_0"] for e in efectivos)
        ent["efectivo_igual_a_nuevo"] = eff_equals_new
        ent["nodos_anterior"], ent["nodos_nuevo"] = len(A.nodes), len(B.nodes)
        cnt = defaultdict(int)
        for d in raw:
            seq += 1
            cnt[d["tipo_cambio"]] += 1
            f = d["campo"]
            refs = set()
            for r in applicable:
                if f and f in req_fieldmap[r["id"]]:
                    refs.add(r["id"])
            if d["tipo_cambio"] == "VERSION_CHANGED":
                refs |= {r["id"] for r in applicable if "versi" in r["titulo"].lower()} | {"MH20-001"}
            if pid in EVENT_IDS and f in ("codEstableMH", "codPuntoVentaMH", "codEstable", "codPuntoVenta",
                                          "puntoVentaMH", "puntoVenta", "tipoEstablecimiento", "nomEstablecimiento"):
                refs |= {"MH20-006"} & set(req_by_id)
            refs = sorted(refs)
            incs = sorted({i for i, v in incidents.items() if set(v["mh20"]) & set(refs)})
            if pid == "FEX11" and d["tipo_cambio"] == "VERSION_CHANGED":
                incs = sorted(set(incs) | {"INC-003"})
            if pid == "CONT" and d["tipo_cambio"] == "VERSION_CHANGED":
                incs = sorted(set(incs) | {"INC-005"})
            if f == "modoTransp":
                incs = sorted(set(incs) | {"INC-002"})
            d2 = OrderedDict([("id", f"SCH20-{seq:03d}"), ("dte", pid), ("documento", label)])
            d2.update(d)
            d2["consumidores"] = find_consumers(pid, f)
            d2["mh20"] = refs
            d2["clasificacion_normativa"] = "VINCULADO_MH20" if refs else "SCHEMA_ONLY"
            d2["incidencias"] = incs
            d2["afecta_zolvi"] = bool(offered) and not eff_equals_new
            if eff_equals_new:
                d2["nota"] = "Schema efectivo de Zolvi ya coincide con el nuevo 2.0: cambio ya absorbido."
            elif not offered:
                d2["nota"] = "Tipo no implementado por Zolvi (MH20-097); informativo."
            diffs.append(d2)
            for rid in refs:
                business_rules[rid].add(pid)
        ent["conteo_por_tipo"] = dict(sorted(cnt.items()))
        ent["total_diferencias"] = sum(cnt.values())
        pairs_out.append(ent)

    # Requisitos BUSINESS_RULE: requisitos P0/P1 aplicables a tipos Zolvi que no quedan
    # cubiertos por ninguna diferencia estructural (no expresables totalmente en JSON Schema).
    zolvi_pids = [p[0] for p in PAIRS if p[6]]
    covered = {r for d in diffs for r in d["mh20"]}
    br = []
    for r in reqs:
        aps = [pid for pid in zolvi_pids if req_applies(r, pid)]
        if aps and r.get("prioridad") in ("P0", "P1") and r["id"] not in covered and r.get("tipo_cambio") != "SIN_CAMBIO":
            br.append({"mh20": r["id"], "prioridad": r.get("prioridad"), "titulo": r["titulo"], "tipos": aps,
                       "clasificacion": "BUSINESS_RULE",
                       "incidencias": sorted(i for i, v in incidents.items() if r["id"] in v["mh20"])})

    for x in inv_hist + inv_new + inv_repo:
        x.pop("_s", None)

    inventario = OrderedDict([
        ("fase", "FASE_2"), ("generado_por", "scripts/02-compare-schemas.py"),
        ("nota", "Cuatro capas: histórico oficial (zip), repositorio, efectivo (usado por validador/builders) y nuevo oficial 2.0."),
        ("resumen", {"historicos_oficiales": len(inv_hist), "repositorio": len(inv_repo), "efectivos": len(efectivos),
                     "nuevos_oficiales": len(inv_new), "refs_externas_total": sum(len(x["refs_externas"]) for x in inv_hist + inv_new)}),
        ("historicos_oficiales", inv_hist), ("repositorio", inv_repo), ("efectivos_zolvi", efectivos),
        ("nuevos_oficiales", inv_new), ("emparejamientos", pairs_out),
    ])
    tot = defaultdict(int)
    for d in diffs:
        tot[d["tipo_cambio"]] += 1
    diff_out = OrderedDict([
        ("fase", "FASE_2"), ("generado_por", "scripts/02-compare-schemas.py"),
        ("convenciones", {"ruta_instancia": "ruta del dato JSON; '[]' = elemento de array; '{oneOf:i}' = rama",
                          "json_pointer_*": "RFC 6901 dentro del schema anterior/nuevo",
                          "compatibilidad": "respecto a un emisor que hoy cumple el schema anterior",
                          "afecta_zolvi": "true si el tipo es emitido por Zolvi y su schema efectivo NO es ya el 2.0",
                          "POSSIBLE_RENAME": "heurística estructural; no confirmado documentalmente"}),
        ("resumen", {"total": len(diffs), "por_tipo": dict(sorted(tot.items())),
                     "por_documento": {p["id"]: p.get("total_diferencias", 0) for p in pairs_out},
                     "afectan_zolvi": sum(1 for d in diffs if d["afecta_zolvi"]),
                     "vinculadas_mh20": sum(1 for d in diffs if d["mh20"]),
                     "schema_only": sum(1 for d in diffs if not d["mh20"])}),
        ("requisitos_business_rule", br),
        ("incidencias_abiertas", {k: v for k, v in incidents.items()}),
        ("diferencias", diffs),
    ])
    with open(os.path.join(AUD, "02-inventario-schemas.json"), "w", encoding="utf-8") as f:
        json.dump(inventario, f, ensure_ascii=False, indent=1)
    with open(os.path.join(AUD, "02-schema-diff.json"), "w", encoding="utf-8") as f:
        json.dump(diff_out, f, ensure_ascii=False, indent=1)
    print(json.dumps(diff_out["resumen"], ensure_ascii=False))
    for p in pairs_out:
        print(p["id"], p.get("version_anterior"), "->", p.get("version_nueva"), p["estado"], p.get("total_diferencias"),
              p.get("conteo_por_tipo", ""), "efectivo=nuevo" if p.get("efectivo_igual_a_nuevo") else "")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
