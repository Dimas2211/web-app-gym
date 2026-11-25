#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ZOLVI — Actualización normativa MH 2.0 — FASE 3
Comparación reproducible de catálogos fiscales MH.

Solo lectura (openpyxl read_only). No modifica catálogos, seeds, Prisma ni código.
Ejecutar desde la raíz del repositorio:

    python -I docs/fiscal/mh-normativa-2.0/auditoria/scripts/03-compare-catalogs.py

Ejes de comparación:
  A) OFICIAL  : "Catálogos del Sistema de Transmisión V 1.2.xlsx" (database/catalogs/, fuente
                declarada por prisma/importers/import-excel-catalogs.ts)  →  Excel 2.0
                (originales/Catálogos - Facturación Electrónica.xlsx).
  B) ZOLVI    : datos de catálogo efectivamente cargados/usados por Zolvi (seeds, datos generados,
                artefactos runtime)  →  Excel 2.0.

Salidas (sobrescribe solo estas):
  auditoria/03-inventario-catalogos.json
  auditoria/03-catalogos-diff.json

Reglas: códigos como texto; no se convierten a número; un int de Excel se registra con su tipo
y su number_format. CAT-008 y CAT-013 no traen columna de departamento en el Excel: la clave
compuesta se construye por segmento (reinicio de la secuencia de códigos) y el departamento
asociado al segmento se marca como INFERIDO y se corrobora por coincidencia de nombres.
"""
import csv
import difflib
import glob
import hashlib
import json
import os
import re
import sys
import unicodedata
from collections import OrderedDict, defaultdict, Counter

try:
    import openpyxl
except ImportError:
    sys.exit("Requiere openpyxl (no se instala nada automáticamente).")

REPO = os.getcwd()
BASE = os.path.join(REPO, "docs", "fiscal", "mh-normativa-2.0")
AUD = os.path.join(BASE, "auditoria")
NEW_XLSX = os.path.join(BASE, "originales", "Catálogos - Facturación Electrónica.xlsx")
OLD_XLSX = os.path.join(REPO, "database", "catalogs", "Catálogos del Sistema de Transmisión V 1.2.xlsx")
if not (os.path.isfile(NEW_XLSX) and os.path.isfile(OLD_XLSX)):
    sys.exit("Ejecutar desde la raíz del repositorio (no se encontraron los Excel).")

REL = lambda p: os.path.relpath(p, REPO).replace("\\", "/")
DIRECTION_WORDS = {"norte", "sur", "centro", "este", "oeste", "costa"}
TITLE_RX = re.compile(r"^\s*CAT-(\d{3})\b\s*(.*)$")
TERRITORIAL_SEGMENTED = {"CAT-008", "CAT-013"}
CRITICAL = {"CAT-002", "CAT-003", "CAT-004", "CAT-005", "CAT-008", "CAT-009", "CAT-011", "CAT-012", "CAT-013",
            "CAT-014", "CAT-015", "CAT-016", "CAT-017", "CAT-019", "CAT-020", "CAT-022", "CAT-024"}

# Campo JSON (Fase 2) → catálogo. Se usa solo para enlazar SCH20 (y se verifica con el título del Excel).
FIELD_CAT = {
    "ambiente": "CAT-001", "tipoDte": "CAT-002", "tipoDoc": "CAT-002", "tipoModelo": "CAT-003",
    "tipoOperacion": "CAT-004", "tipoContingencia": "CAT-005", "codigoRetencionMH": "CAT-006",
    "tipoGeneracion": "CAT-007", "distrito": "CAT-008", "tipoEstablecimiento": "CAT-009",
    "tipoServicio": "CAT-010", "tipoItem": "CAT-011", "departamento": "CAT-012", "municipio": "CAT-013",
    "uniMedida": "CAT-014", "codTributo": "CAT-015", "tributos": "CAT-015", "condicionOperacion": "CAT-016",
    "codigo": "CAT-017", "plazo": "CAT-018", "codActividad": "CAT-019", "codPais": "CAT-020",
    "codDocAsociado": "CAT-021", "tipoDocumento": "CAT-022", "tipDocResponsable": "CAT-022",
    "tipDocSolicita": "CAT-022", "tipoDocResponsable": "CAT-022", "tipoAnulacion": "CAT-024",
    "bienTitulo": "CAT-025", "tipoDonacion": "CAT-026", "recintoFiscal": "CAT-027", "regimen": "CAT-028",
    "tipoPersona": "CAT-029", "modoTransp": "CAT-030", "codIncoterms": "CAT-031", "codDomiciliado": "CAT-032",
    "tipoRegimen": "CAT-033",
}

# Consumidores: tokens exactos por catálogo, buscados solo en rutas fiscales/catálogo.
CONSUMER_GLOBS = [
    "src/modules/commerce/dte/**/*.ts", "src/modules/commerce/customers/**/*.ts*", "src/modules/commerce/suppliers/**/*.ts*",
    "src/modules/commerce/sales/**/*.ts*", "src/modules/commerce/purchases/**/*.ts*", "src/modules/commerce/cash/**/*.ts",
    "src/modules/platform/dte-onboarding/**/*.ts", "src/modules/platform/components/platform-mh-test-runs-section.tsx",
    "src/modules/platform/components/platform-fiscal-onboarding-panel.tsx", "src/modules/platform/lib/seed-runners/*.ts",
    "src/app/api/catalogs/**/*.ts", "src/app/(dashboard)/dashboard/sales/**/*.tsx",
    "prisma/seeds/**/*.ts", "prisma/importers/*.ts", "prisma/scripts/*.ts", "prisma/schema.prisma",
]
CONSUMER_TOKENS = {
    "CAT-001": [r"CAT-001"], "CAT-002": [r"CAT-002"], "CAT-003": [r"CAT-003", r"tipoModelo"],
    "CAT-004": [r"CAT-004", r"tipoOperacion"], "CAT-005": [r"CAT-005", r"tipoContingencia", r"contingencyTypeCode"],
    "CAT-006": [r"CAT-006", r"codigoRetencionMH"], "CAT-007": [r"CAT-007", r"tipoGeneracion"],
    "CAT-008": [r"CAT-008", r"\bdistrito\b", r"district_code", r"district_name"],
    "CAT-009": [r"CAT-009", r"tipoEstablecimiento", r"establishment_type_code"],
    "CAT-010": [r"CAT-010", r"tipoServicio"], "CAT-011": [r"CAT-011", r"tipoItem\b", r"item_type"],
    "CAT-012": [r"CAT-012", r"\bdept_code\b", r"\bdepartamento\b"],
    "CAT-013": [r"CAT-013", r"municipality_code", r"\bmunicipio\b", r"new_municipality_code"],
    "CAT-014": [r"CAT-014", r"uniMedida", r"mh_unit_code"], "CAT-015": [r"CAT-015", r"codTributo"],
    "CAT-016": [r"CAT-016", r"condicionOperacion", r"condition_operation_code"],
    "CAT-017": [r"CAT-017", r"mh_payment_form_code", r"payment_method_code"],
    "CAT-018": [r"CAT-018", r"payment_term_code"], "CAT-019": [r"CAT-019", r"codActividad", r"activity_code"],
    "CAT-020": [r"CAT-020", r"codPais", r"country_code"], "CAT-021": [r"CAT-021", r"codDocAsociado"],
    "CAT-022": [r"CAT-022", r"id_type_code", r"idTypeCode", r"identification_type"],
    "CAT-023": [r"CAT-023"], "CAT-024": [r"CAT-024", r"tipoAnulacion", r"invalidationTypeCode"],
    "CAT-025": [r"CAT-025", r"bienTitulo"], "CAT-026": [r"CAT-026", r"tipoDonacion"],
    "CAT-027": [r"CAT-027", r"recintoFiscal"], "CAT-028": [r"CAT-028", r"\bregimen\b"],
    "CAT-029": [r"CAT-029", r"tipoPersona"], "CAT-030": [r"CAT-030", r"modoTransp"],
    "CAT-031": [r"CAT-031", r"codIncoterms"], "CAT-032": [r"CAT-032", r"codDomiciliado"],
    "CAT-033": [r"CAT-033", r"tipoRegimen"],
}


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def norm_text(s):
    if s is None:
        return ""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c)).casefold()
    s = re.sub(r"[^0-9a-z]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def code_text(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


# ───────────────────────────── parser de bloques ─────────────────────────────
def parse_workbook(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = []
    for r in ws.iter_rows(min_row=1, max_row=ws.max_row):
        cells = list(r)[:2] + [None] * (2 - len(list(r)[:2]))
        a, b = cells[0], cells[1]
        rows.append(((a.value if a is not None else None), (b.value if b is not None else None),
                     (getattr(a, "number_format", None) if a is not None else None)))
    meta = {"archivo": REL(path), "sha256": sha256_file(path), "hoja": ws.title, "max_row": ws.max_row,
            "titulo_libro": next((str(x[0]).strip() for x in rows[:8] if isinstance(x[0], str) and "CAT" in x[0].upper() and "LOGO" in x[0].upper()), None)}
    titles = [(i + 1, m.group(1), m.group(2).strip()) for i, (a, b, nf) in enumerate(rows)
              if isinstance(a, str) and (m := TITLE_RX.match(a))]
    cats = OrderedDict()
    for k, (trow, num, title) in enumerate(titles):
        end = (titles[k + 1][0] - 1) if k + 1 < len(titles) else len(rows)
        code = f"CAT-{num}"
        header_row, headers = None, None
        for j in range(trow + 1, min(end, trow + 4) + 1):
            a, b, _ = rows[j - 1]
            if isinstance(a, str) and re.match(r"^\s*c[oó]digo\s*$", a, re.I):
                header_row, headers = j, [a, b]
                break
        start = (header_row or trow) + 1
        entries, labels_run, notes, blank = [], [], [], 0
        for j in range(start, end + 1):
            a, b, nf = rows[j - 1]
            if a is None and b is None:
                blank += 1
                continue
            if a is None and b is not None:
                labels_run.append({"fila": j, "texto": str(b)})
                continue
            if b is None and isinstance(a, str) and (len(a.strip()) > 12 or re.match(r"^\s*\d+\s*[:\-]\s", a)):
                labels_run.append({"fila": j, "texto": a, "columna": "A"})
                continue
            ct = code_text(a)
            entries.append({"fila": j, "codigo_raw": a if not isinstance(a, float) else ct, "tipo_celda": type(a).__name__,
                            "number_format": nf, "codigo": ct, "descripcion": (None if b is None else str(b)),
                            "jerarquia": [x["texto"] for x in labels_run] if labels_run else None})
            if labels_run:
                last_labels = labels_run
            labels_run = []
        notes = labels_run  # etiquetas al final del bloque = notas
        # jerarquía acumulada (CAT-019): sección = etiqueta superior vigente, grupo = última
        sec, grp = None, None
        for e in entries:
            if e["jerarquia"]:
                if len(e["jerarquia"]) >= 2:
                    sec, grp = e["jerarquia"][-2], e["jerarquia"][-1]
                else:
                    grp = e["jerarquia"][-1]
            e["seccion"], e["grupo"] = sec, grp
        cats[code] = {"code": code, "titulo": title, "fila_titulo": trow, "fila_encabezado": header_row,
                      "encabezados": headers, "ultima_fila": end, "entradas": entries, "notas": notes,
                      "filas_vacias": blank}
    wb.close()
    return meta, cats


def segment_keys(cat):
    """Clave compuesta (segmento|código) para CAT-008/CAT-013 por reinicio de secuencia."""
    seg, prev = 0, None
    for e in cat["entradas"]:
        c = e["codigo"]
        if c in ("00",) and (e["descripcion"] or "").lower().startswith("otro"):
            e["segmento"] = 0
            e["clave"] = "00"
            continue
        try:
            n = int(c)
        except (TypeError, ValueError):
            n = None
        if n is not None and (prev is None or n <= prev):
            seg += 1
        prev = n if n is not None else prev
        e["segmento"] = seg
        e["departamento_inferido"] = f"{seg:02d}"
        e["clave"] = f"{seg:02d}|{c.zfill(2) if c and c.isdigit() else c}"


def keyed(cat):
    if cat["code"] in TERRITORIAL_SEGMENTED:
        segment_keys(cat)
    else:
        for e in cat["entradas"]:
            e["clave"] = (e["codigo"] or "").strip()
        dup = [k for k, n in Counter(e["clave"] for e in cat["entradas"]).items() if n > 1]
        if dup and all(e.get("grupo") for e in cat["entradas"]):
            # Códigos repetidos en grupos distintos (p. ej. CAT-015): clave = número de grupo|código
            for e in cat["entradas"]:
                m = re.match(r"^\s*(\d+)", e["grupo"] or "")
                e["clave"] = f"G{m.group(1) if m else '?'}|{e['clave']}"
            cat["clave_por_grupo"] = True
    return cat


def quality(cat):
    issues = []
    keys = Counter(e["clave"] for e in cat["entradas"])
    for k, n in keys.items():
        if n > 1:
            issues.append({"tipo": "CLAVE_DUPLICADA", "clave": k, "veces": n,
                           "filas": [e["fila"] for e in cat["entradas"] if e["clave"] == k]})
    types = Counter(e["tipo_celda"] for e in cat["entradas"])
    str_lens = Counter(len(e["codigo"]) for e in cat["entradas"] if e["tipo_celda"] == "str" and e["codigo"] and e["codigo"].isdigit())
    for e in cat["entradas"]:
        c = e["codigo"]
        if c is None or c.strip() == "":
            issues.append({"tipo": "CODIGO_VACIO", "fila": e["fila"]})
            continue
        if c != c.strip():
            issues.append({"tipo": "ESPACIOS_EN_CODIGO", "fila": e["fila"], "codigo_raw": c})
        if e["descripcion"] is None or not str(e["descripcion"]).strip():
            issues.append({"tipo": "DESCRIPCION_VACIA", "fila": e["fila"], "codigo": c})
        elif e["descripcion"] != e["descripcion"].strip():
            issues.append({"tipo": "ESPACIOS_EN_DESCRIPCION", "fila": e["fila"], "codigo": c})
        if e["tipo_celda"] == "int" and str_lens:
            width = max(str_lens)
            if len(c) < width:
                issues.append({"tipo": "POSIBLE_CERO_INICIAL_PERDIDO", "fila": e["fila"], "codigo": c,
                               "ancho_textual_del_bloque": width, "number_format": e["number_format"]})
    if len(types) > 1:
        issues.append({"tipo": "TIPOS_DE_CELDA_MIXTOS", "conteo": dict(types)})
    return issues


# ───────────────────────────── fuentes Zolvi ─────────────────────────────────
OBJ_RX = re.compile(r"\{\s*catalog_code:\s*\"(CAT-\d{3})\",\s*item_code:\s*\"([^\"]*)\",\s*item_label:\s*\"([^\"]*)\"")


def read(rel):
    with open(os.path.join(REPO, rel), encoding="utf-8", errors="replace") as f:
        return f.read()


def zolvi_sources():
    src = defaultdict(list)   # CAT -> [ {fuente, filas:{clave:(desc, linea)}} ]

    def add(cat, fuente, rows, nota=None):
        src[cat].append({"fuente": fuente, "nota": nota, "filas": rows})

    for rel in ("prisma/seeds/seed.dte-catalog-items.ts", "prisma/seeds/data/fex11-catalog-rows.ts"):
        txt = read(rel)
        per = defaultdict(OrderedDict)
        for i, line in enumerate(txt.splitlines(), 1):
            for m in OBJ_RX.finditer(line):
                per[m.group(1)][m.group(2)] = (m.group(3), i)
        for cat, rows in per.items():
            add(cat, rel, rows, "DteCatalogItem (seed)")
    # CAT-014
    rel = "prisma/seeds/data/cat014-units.ts"
    rows = OrderedDict()
    for i, line in enumerate(read(rel).splitlines(), 1):
        m = re.search(r"mh_code:\s*(\d+),\s*name:\s*\"([^\"]*)\"", line)
        if m:
            rows[m.group(1)] = (m.group(2), i)
    add("CAT-014", rel, rows, "UnitOfMeasure.mh_unit_code (seed; mh_code numérico)")
    # CAT-019 / CAT-020 / CAT-013 v1.2 (generado desde Excel V1.2)
    rel = "prisma/importers/generated/commerce-catalogs.data.ts"
    act, cty, mun = OrderedDict(), OrderedDict(), OrderedDict()
    for i, line in enumerate(read(rel).splitlines(), 1):
        m = re.search(r"\{ code: \"([^\"]*)\", name: \"((?:[^\"\\]|\\.)*)\", section: \"((?:[^\"\\]|\\.)*)\" \}", line)
        if m:
            act[m.group(1)] = (m.group(2), i, m.group(3))
            continue
        m = re.search(r"\{ dept_code: \"(\d\d)\", dept_name: \"[^\"]*\", code: \"(\d\d)\", name: \"([^\"]*)\" \}", line)
        if m:
            mun[f"{m.group(1)}|{m.group(2)}" if m.group(1) != "00" else "00"] = (m.group(3), i)
            continue
        m = re.search(r"\{ code: \"([A-Z0-9]{2,3})\", name: \"((?:[^\"\\]|\\.)*)\" \}", line)
        if m:
            cty[m.group(1)] = (m.group(2), i)
    add("CAT-019", rel, act, "EconomicActivity (seed vía seed.commerce-catalogs.ts)")
    add("CAT-020", rel, cty, "Country (seed vía seed.commerce-catalogs.ts)")
    add("CAT-013", rel, mun, "MUNICIPALITIES V1.2 generado (no importado por seed.commerce-catalogs.ts)")
    # CAT-022 maestro commerce
    rel = "prisma/seeds/seed.commerce-catalogs.ts"
    rows = OrderedDict()
    for i, line in enumerate(read(rel).splitlines(), 1):
        m = re.search(r"\{ code: \"(\d\d)\",\s*name: \"([^\"]*)\"", line)
        if m:
            rows[m.group(1)] = (m.group(2), i)
    add("CAT-022", rel, rows, "identification_types (seed commerce)")
    # Municipality (seed activo): CAT-012 + CAT-008 (distritos) + municipio nuevo agrupado
    rel = "prisma/importers/generated/municipalities.data.ts"
    dept, dist = OrderedDict(), OrderedDict()
    newmun = {}
    for i, line in enumerate(read(rel).splitlines(), 1):
        m = re.search(r"dept_code: \"(\d\d)\", dept_name: \"([^\"]*)\", code: \"(\d\d)\", dte_full_code: \"(\d+)\", "
                      r"district_code: \"(\d*)\", district_name: \"([^\"]*)\", new_municipality_code: \"(\d*)\", "
                      r"new_municipality_name: \"([^\"]*)\"", line)
        if m:
            d, dn, c, full, dc, dname, nmc, nmn = m.groups()
            dept.setdefault(d, (dn, i))
            dist[f"{d}|{c}"] = (dname, i, {"district_code": dc, "new_municipality_code": nmc, "new_municipality_name": nmn})
    add("CAT-012", rel, dept, "Municipality.dept_code/dept_name (seed activo)")
    add("CAT-008", rel, dist, "Municipality (dept_code|code → district_name) (seed activo)")
    # CAT-013 runtime FEX v3 y transcripción documental v1.2
    rel = "src/modules/commerce/dte/utils/cat013-fex-v3-municipalities.ts"
    rows = OrderedDict()
    for i, line in enumerate(read(rel).splitlines(), 1):
        m = re.search(r"\[\"(\d\d)\",\s*\"(\d\d)\",\s*\"([^\"]*)\"\]", line)
        if m:
            rows[f"{m.group(1)}|{m.group(2)}"] = (m.group(3), i)
    add("CAT-013", rel, rows, "Artefacto runtime FEX 11 v3 (44 municipios, sin '00')")
    rel = "docs/dte-official/catalogs/cat-013-municipios-v1.2.csv"
    rows = OrderedDict()
    with open(os.path.join(REPO, rel), encoding="utf-8-sig") as f:
        for i, r in enumerate(csv.DictReader(f), 2):
            rows[f"{r['dept_code']}|{r['code']}"] = (r["name"], i)
    add("CAT-013", rel, rows, "Transcripción documental CAT-013 v1.2")
    return src, newmun


# ───────────────────────────── consumidores ──────────────────────────────────
def consumer_index():
    files = []
    for g in CONSUMER_GLOBS:
        files += [REL(p) for p in glob.glob(os.path.join(REPO, g), recursive=True)]
    files = sorted(set(f for f in files if os.path.isfile(os.path.join(REPO, f))))
    content = {}
    for f in files:
        try:
            content[f] = read(f).splitlines()
        except OSError:
            pass
    out = {}
    for cat, toks in CONSUMER_TOKENS.items():
        rx = re.compile("|".join(toks))
        hits = []
        for f, lines in content.items():
            ln = [i + 1 for i, l in enumerate(lines) if rx.search(l)]
            if ln:
                hits.append({"archivo": f, "lineas": ln[:6], "total": len(ln), "es_test": ".test." in f})
        hits.sort(key=lambda h: (h["es_test"], -h["total"]))
        out[cat] = hits
    return out


def consumer_summary(hits, n=12):
    return [f"{h['archivo']}:{','.join(map(str, h['lineas']))}{'…' if h['total'] > len(h['lineas']) else ''}"
            for h in hits if not h["es_test"]][:n]


# ─────────────────────────────── comparación ─────────────────────────────────
def _is_subseq(short, long_):
    it = iter(long_)
    return all(ch in it for ch in short)


FOOTNOTE_RX = re.compile(r"\s+\d+(\s*,\s*\d+)*\s*$")


def desc_change(a, b, territorial=False, footnotes=False):
    if a == b:
        return None
    if footnotes and a is not None and b is not None:
        fa, fb = FOOTNOTE_RX.sub("", str(a)), FOOTNOTE_RX.sub("", str(b))
        if (fa != str(a) or fb != str(b)) and norm_text(fa) == norm_text(fb):
            return "REFERENCIA_A_NOTA"
    if norm_text(a) == norm_text(b):
        return "ORTOGRAFICO"
    na, nb = norm_text(a), norm_text(b)
    if territorial:
        da = set(na.split()) & DIRECTION_WORDS
        db = set(nb.split()) & DIRECTION_WORDS
        if da != db:
            return "SEMANTICO"
        s, l = (na, nb) if len(na) <= len(nb) else (nb, na)
        if s and l and s[0] == l[0] and _is_subseq(s.replace(" ", ""), l.replace(" ", "")):
            return "ABREVIATURA_O_VARIANTE"
    r = difflib.SequenceMatcher(None, na, nb).ratio()
    return "MENOR_REVISAR" if r >= 0.85 else "SEMANTICO"




def assign_cat013_departments(cat013, cat012):
    """Departamento de cada municipio 2.0 por coincidencia de nombre con CAT-012 (evidencia textual)."""
    depts = {}
    for e in cat012["entradas"]:
        depts[norm_text(e["descripcion"])] = (e["codigo"] or "").zfill(2)
    for e in cat013["entradas"]:
        if e["codigo"] == "00":
            e["clave"], e["segmento"] = "00", 0
            continue
        toks = norm_text(e["descripcion"]).split()
        while toks and toks[-1] in DIRECTION_WORDS:
            toks = toks[:-1]
        d = depts.get(" ".join(toks))
        e["departamento_inferido"] = d
        e["metodo_departamento"] = "NOMBRE_CAT012" if d else "NO_DETERMINADO"
        e["clave"] = f"{d}|{(e['codigo'] or '').zfill(2)}" if d else f"??|{e['codigo']}"
        e["segmento"] = int(d) if d else None


def main():
    meta_new, new = parse_workbook(NEW_XLSX)
    meta_old, old = parse_workbook(OLD_XLSX)
    for c in list(new.values()) + list(old.values()):
        keyed(c)
    # CAT-013: el reinicio de secuencia no separa departamentos de forma fiable → nombre vs CAT-012
    for book in (new, old):
        if "CAT-013" in book and "CAT-012" in book and book["CAT-013"]["entradas"]:
            assign_cat013_departments(book["CAT-013"], book["CAT-012"])
    zsrc, _ = zolvi_sources()
    cons = consumer_index()
    with open(os.path.join(AUD, "01-matriz-normativa.json"), encoding="utf-8") as f:
        reqs = json.load(f)["requisitos"]
    try:
        with open(os.path.join(AUD, "02-schema-diff.json"), encoding="utf-8") as f:
            sch = json.load(f)["diferencias"]
    except OSError:
        sch = []
    mh20_by_cat = defaultdict(set)
    for r in reqs:
        text = json.dumps({k: r.get(k) for k in ("titulo", "regla_nueva", "regla_anterior", "observaciones", "fuente_nueva")}, ensure_ascii=False)
        for m in re.findall(r"CAT-\d{3}", text):
            mh20_by_cat[m].add(r["id"])
    sch_by_cat = defaultdict(list)
    for d in sch:
        cat = FIELD_CAT.get(d.get("campo"))
        if cat == "CAT-017" and "/pagos/" not in d.get("ruta_instancia", ""):
            cat = None
        if cat == "CAT-022" and not re.search(r"/(receptor|documento|motivo|sujetoExcluido|emisor)/", d.get("ruta_instancia", "")):
            cat = None
        if cat and d.get("afecta_zolvi"):
            sch_by_cat[cat].append(d["id"])

    diffs, seq = [], 0

    def add(cat, eje, tipo, clave, va, vn, fila_new, fila_old, extra=None):
        nonlocal seq
        seq += 1
        d = OrderedDict([("id", f"CAT20-{seq:03d}"), ("catalogo", cat), ("eje", eje), ("clave", clave),
                         ("tipo_cambio", tipo), ("valor_anterior", va), ("valor_nuevo", vn),
                         ("fuente_nueva", f"{meta_new['archivo']}!Hoja1" + (f"!A{fila_new}" if fila_new else "")),
                         ("fila_excel_nuevo", fila_new), ("fila_excel_anterior", fila_old)])
        if extra:
            d.update(extra)
        diffs.append(d)
        return d

    all_codes = sorted(set(new) | set(old), key=lambda c: int(c[4:]))
    inventory = []
    for cat in all_codes:
        cn, co = new.get(cat), old.get(cat)
        has_fn = any(re.match(r"^\s*\d+\s*[:\-]", x["texto"]) for x in ((cn or {}).get("notas") or []) + ((co or {}).get("notas") or []))
        if cn and not co:
            add(cat, "OFICIAL_V1.2→2.0", "CATALOG_ADDED", None, None, cn["titulo"], cn["fila_titulo"], None)
        if co and not cn:
            add(cat, "OFICIAL_V1.2→2.0", "CATALOG_REMOVED", None, co["titulo"], None, None, co["fila_titulo"])
        if cn and co:
            if norm_text(cn["titulo"]) != norm_text(co["titulo"]):
                add(cat, "OFICIAL_V1.2→2.0", "METADATA_CHANGED", "titulo", co["titulo"], cn["titulo"], cn["fila_titulo"], co["fila_titulo"],
                    {"subtipo": desc_change(co["titulo"], cn["titulo"]) or "ORTOGRAFICO"})
            if [norm_text(x) for x in (cn["encabezados"] or [])] != [norm_text(x) for x in (co["encabezados"] or [])]:
                add(cat, "OFICIAL_V1.2→2.0", "METADATA_CHANGED", "encabezados", co["encabezados"], cn["encabezados"], cn["fila_encabezado"], co["fila_encabezado"])
            if not co["entradas"] and cn["entradas"]:
                add(cat, "OFICIAL_V1.2→2.0", "BASELINE_UNAVAILABLE", None, f"V1.2 '{co['titulo'] or '(sin título)'}' sin registros",
                    f"{len(cn['entradas'])} registros", cn["fila_titulo"], co["fila_titulo"],
                    {"nota": "El código de catálogo existía sin contenido en V1.2; todo el contenido 2.0 es nuevo."})
            elif co["entradas"]:
                mo = {e["clave"]: e for e in co["entradas"]}
                mn = {e["clave"]: e for e in cn["entradas"]}
                for k in mn:
                    if k not in mo:
                        add(cat, "OFICIAL_V1.2→2.0", "CODE_ADDED", k, None, mn[k]["descripcion"], mn[k]["fila"], None)
                for k in mo:
                    if k not in mn:
                        extra = None
                        m = re.match(r"^([A-Z]{2}-\d)\.(.+)$", k)
                        if m and m.group(2) in mn and (norm_text(mo[k]["descripcion"]) == norm_text(mn[m.group(2)]["descripcion"]) or norm_text(mo[k]["descripcion"]).endswith(norm_text(mn[m.group(2)]["descripcion"]))):
                            extra = {"posible_equivalente_2_0": m.group(2), "prefijo_retirado": m.group(1),
                                     "prefijo_en_cat033": m.group(1) in {e["clave"] for e in new.get("CAT-033", {"entradas": []})["entradas"]},
                                     "incertidumbre_reformateo": "Equivalencia por patrón de código (prefijo CAT-033 + código 2.0) y descripción 2.0 contenida al final de la V1.2; no confirmada documentalmente."}
                        add(cat, "OFICIAL_V1.2→2.0", "CODE_REMOVED", k, mo[k]["descripcion"], None, None, mo[k]["fila"], extra)
                for k in mn:
                    if k in mo:
                        a, b = mo[k], mn[k]
                        sub = desc_change(a["descripcion"], b["descripcion"], cat in TERRITORIAL_SEGMENTED or cat == "CAT-012", has_fn)
                        if sub:
                            add(cat, "OFICIAL_V1.2→2.0", "DESCRIPTION_CHANGED", k, a["descripcion"], b["descripcion"], b["fila"], a["fila"], {"subtipo": sub})
                        if (a.get("seccion"), a.get("grupo")) != (b.get("seccion"), b.get("grupo")) and (a.get("grupo") or b.get("grupo")):
                            if norm_text(a.get("grupo")) != norm_text(b.get("grupo")) or norm_text(a.get("seccion")) != norm_text(b.get("seccion")):
                                add(cat, "OFICIAL_V1.2→2.0", "HIERARCHY_CHANGED", k, {"seccion": a.get("seccion"), "grupo": a.get("grupo")},
                                    {"seccion": b.get("seccion"), "grupo": b.get("grupo")}, b["fila"], a["fila"])
                        if a["tipo_celda"] != b["tipo_celda"]:
                            add(cat, "OFICIAL_V1.2→2.0", "METADATA_CHANGED", k, {"tipo_celda": a["tipo_celda"]}, {"tipo_celda": b["tipo_celda"]}, b["fila"], a["fila"])
                        ca = re.findall(r"\(([^)]*aplica[^)]*)\)", a["descripcion"] or "", re.I)
                        cb = re.findall(r"\(([^)]*aplica[^)]*)\)", b["descripcion"] or "", re.I)
                        if [norm_text(x) for x in ca] != [norm_text(x) for x in cb]:
                            add(cat, "OFICIAL_V1.2→2.0", "CONSTRAINT_CHANGED", k, ca, cb, b["fila"], a["fila"])
                if not any(d["catalogo"] == cat and d["eje"] == "OFICIAL_V1.2→2.0" and d["tipo_cambio"] != "METADATA_CHANGED" for d in diffs):
                    add(cat, "OFICIAL_V1.2→2.0", "UNCHANGED", None, len(co["entradas"]), len(cn["entradas"]), cn["fila_titulo"], co["fila_titulo"])
            if [norm_text(x["texto"]) for x in cn["notas"]] != [norm_text(x["texto"]) for x in co["notas"]]:
                add(cat, "OFICIAL_V1.2→2.0", "CONSTRAINT_CHANGED", "notas", [x["texto"] for x in co["notas"]], [x["texto"] for x in cn["notas"]],
                    cn["notas"][0]["fila"] if cn["notas"] else None, co["notas"][0]["fila"] if co["notas"] else None, {"nota": "Notas al pie del bloque"})

        # ── Eje Zolvi → 2.0 ──
        zl = zsrc.get(cat, [])
        if cn and not zl:
            add(cat, "ZOLVI→2.0", "BASELINE_UNAVAILABLE", None, None, f"{len(cn['entradas'])} registros", cn["fila_titulo"], None,
                {"nota": "Zolvi no tiene copia de datos de este catálogo (seed/artefacto). No implica eliminación."})
        for z in zl:
            mn = {e["clave"]: e for e in cn["entradas"]} if cn else {}
            zrows = z["filas"]
            # alineación de clave: códigos numéricos del Excel guardados como int vs texto con cero inicial en Zolvi
            def match(zk):
                if zk in mn:
                    return zk, "EXACTA"
                if zk.isdigit() and zk.lstrip("0") in mn:
                    return zk.lstrip("0"), "SIN_CERO_INICIAL_EN_EXCEL"
                if zk.isdigit() and zk.zfill(2) in mn:
                    return zk.zfill(2), "CERO_INICIAL_EN_EXCEL"
                suf = [k for k in mn if k.startswith("G") and k.split("|", 1)[-1] == zk]
                if len(suf) == 1:
                    return suf[0], "EXACTA_EN_GRUPO"
                if "|" in zk:
                    d, c = zk.split("|")
                    alt = f"{d}|{c.zfill(2)}"
                    if alt in mn:
                        return alt, "EXACTA"
                return None, None
            matched = set()
            name_ok = name_bad = 0
            for zk, val in zrows.items():
                desc, line = val[0], val[1]
                k, how = match(zk)
                if k is None:
                    add(cat, "ZOLVI→2.0", "CODE_REMOVED", zk, desc, None, None, None,
                        {"fuente_zolvi": f"{z['fuente']}:{line}", "nota": "Código presente en Zolvi y ausente en el catálogo 2.0."})
                    continue
                matched.add(k)
                e = mn[k]
                sub = desc_change(desc, e["descripcion"], cat in TERRITORIAL_SEGMENTED or cat == "CAT-012", has_fn)
                if cat in TERRITORIAL_SEGMENTED:
                    if sub in (None, "ORTOGRAFICO", "ABREVIATURA_O_VARIANTE", "REFERENCIA_A_NOTA"):
                        name_ok += 1
                    else:
                        name_bad += 1
                if sub and sub not in ("ORTOGRAFICO", "ABREVIATURA_O_VARIANTE", "REFERENCIA_A_NOTA"):
                    add(cat, "ZOLVI→2.0", "DESCRIPTION_CHANGED", k, desc, e["descripcion"], e["fila"], None,
                        {"subtipo": sub, "fuente_zolvi": f"{z['fuente']}:{line}", "alineacion_clave": how})
                elif sub in ("ORTOGRAFICO", "ABREVIATURA_O_VARIANTE", "REFERENCIA_A_NOTA") and cat not in ("CAT-019", "CAT-020", "CAT-008"):
                    add(cat, "ZOLVI→2.0", "DESCRIPTION_CHANGED", k, desc, e["descripcion"], e["fila"], None,
                        {"subtipo": sub, "fuente_zolvi": f"{z['fuente']}:{line}", "alineacion_clave": how})
                if how not in ("EXACTA", "EXACTA_EN_GRUPO"):
                    add(cat, "ZOLVI→2.0", "METADATA_CHANGED", k, {"codigo_zolvi": zk}, {"codigo_excel": e["codigo"], "tipo_celda": e["tipo_celda"]},
                        e["fila"], None, {"subtipo": how, "fuente_zolvi": f"{z['fuente']}:{line}",
                                          "nota": "Diferencia de representación del código (no de valor)."})
                if cat == "CAT-019" and len(val) > 2 and norm_text(val[2]) not in (norm_text(e.get("grupo")), norm_text(e.get("seccion"))):
                    add(cat, "ZOLVI→2.0", "HIERARCHY_CHANGED", k, {"section_zolvi": val[2]}, {"seccion": e.get("seccion"), "grupo": e.get("grupo")},
                        e["fila"], None, {"fuente_zolvi": f"{z['fuente']}:{line}"})
            if cn:
                missing = [k for k in mn if k not in matched]
                subset_note = "Fuente Zolvi es subconjunto declarado." if z["nota"] and ("FEX" in z["nota"] or "runtime" in z["nota"]) else None
                for k in missing:
                    add(cat, "ZOLVI→2.0", "CODE_ADDED", k, None, mn[k]["descripcion"], mn[k]["fila"], None,
                        {"fuente_zolvi": z["fuente"], "nota": subset_note or "Código 2.0 no presente en la fuente Zolvi."})
            z["_stats"] = {"filas_zolvi": len(zrows), "coinciden": len(matched),
                           "faltan_en_zolvi": (len(mn) - len(matched)) if cn else None,
                           "nombres_territoriales_coinciden": name_ok if cat in TERRITORIAL_SEGMENTED else None,
                           "nombres_territoriales_difieren": name_bad if cat in TERRITORIAL_SEGMENTED else None}

        inv = OrderedDict([("codigo", cat), ("titulo_2_0", cn["titulo"] if cn else None), ("titulo_v1_2", co["titulo"] if co else None),
                           ("critico_para_zolvi", cat in CRITICAL)])
        if cn:
            inv.update({"fila_titulo": cn["fila_titulo"], "fila_encabezado": cn["fila_encabezado"], "ultima_fila": cn["ultima_fila"],
                        "encabezados": cn["encabezados"], "registros": len(cn["entradas"]),
                        "tipos_celda": dict(Counter(e["tipo_celda"] for e in cn["entradas"])),
                        "con_jerarquia": any(e.get("grupo") for e in cn["entradas"]),
                        "clave_compuesta": "segmento|codigo (departamento INFERIDO por reinicio de secuencia)" if cat in TERRITORIAL_SEGMENTED else "codigo",
                        "segmentos": (max((e.get("segmento") or 0) for e in cn["entradas"]) if cat in TERRITORIAL_SEGMENTED else None),
                        "notas": [x["texto"] for x in cn["notas"]], "calidad": quality(cn)})
        inv["registros_v1_2"] = len(co["entradas"]) if co else None
        inv["fuentes_zolvi"] = [{"fuente": z["fuente"], "nota": z["nota"], **z.get("_stats", {})} for z in zl]
        inv["consumidores"] = consumer_summary(cons.get(cat, []))
        inv["consumidores_tests"] = [h["archivo"] for h in cons.get(cat, []) if h["es_test"]][:8]
        inventory.append(inv)

    # Corroboración del departamento inferido (CAT-008/013) contra CAT-012 y nombres Zolvi
    corroboracion = {}
    for cat in TERRITORIAL_SEGMENTED:
        cn = new[cat]
        segs = sorted({e["segmento"] for e in cn["entradas"] if e.get("segmento")})
        corroboracion[cat] = {"segmentos_detectados": len(segs), "departamentos_cat012": len(new["CAT-012"]["entradas"]) if "CAT-012" in new else None,
                              "fuentes": [{"fuente": z["fuente"], **z.get("_stats", {})} for z in zsrc.get(cat, [])]}

    # Correspondencia territorial candidata (distrito 2.0 → municipio 2.0) para registros Zolvi
    terr = []
    c13 = {}
    for e in new["CAT-013"]["entradas"]:
        if e.get("segmento"):
            c13.setdefault((e["departamento_inferido"], norm_text(e["descripcion"])), []).append(e["codigo"])
    dist_src = next((z for z in zsrc["CAT-008"] if "municipalities.data" in z["fuente"]), None)
    c8 = {e["clave"]: e for e in new["CAT-008"]["entradas"]}
    stats = Counter()
    colisiones = []
    c13_by_key = {e["clave"]: e for e in new["CAT-013"]["entradas"]}
    for zk, val in (dist_src["filas"].items() if dist_src else []):
        name, line, extra = val
        d, c = zk.split("|")
        e8 = c8.get(f"{d}|{c}")
        dist_ok = bool(e8) and desc_change(name, e8["descripcion"], True) in (None, "ORTOGRAFICO", "ABREVIATURA_O_VARIANTE")
        cands = c13.get((d, norm_text(extra["new_municipality_name"])), [])
        status = ("INEQUIVOCA" if dist_ok and len(cands) == 1 else
                  "AMBIGUA" if dist_ok and len(cands) > 1 else
                  "SIN_MUNICIPIO_2_0" if dist_ok else "DISTRITO_NO_CORROBORADO")
        stats[status] += 1
        e13 = c13_by_key.get(f"{d}|{c}")
        if e13:
            stats["COLISION_CODIGO_ACTUAL_CON_CAT013_2_0"] += 1
            if not cands or e13["codigo"] not in cands:
                stats["COLISION_CON_SIGNIFICADO_DISTINTO"] += 1
                colisiones.append({"zolvi": f"{dist_src['fuente']}:{line}", "dept_code": d, "municipio_enviado_hoy": c,
                                   "distrito_zolvi": name, "cat013_2_0_con_ese_codigo": e13["descripcion"],
                                   "municipio_2_0_correcto_candidato": cands})
        else:
            stats["CODIGO_ACTUAL_INEXISTENTE_EN_CAT013_2_0"] += 1
        if status != "INEQUIVOCA":
            terr.append({"zolvi": f"{dist_src['fuente']}:{line}", "dept_code": d, "code": c, "district_name": name,
                         "new_municipality_name": extra["new_municipality_name"],
                         "cat008_2_0": e8["descripcion"] if e8 else None, "cat013_candidatos": cands, "estado": status})

    # Enlaces MH20/SCH20, riesgo y acción
    for d in diffs:
        cat = d["catalogo"]
        d["consumidores"] = consumer_summary(cons.get(cat, []), 6)
        d["mh20"] = sorted(mh20_by_cat.get(cat, []))
        s = sch_by_cat.get(cat, [])
        d["sch20"] = s[:15] + ([f"…(+{len(s) - 15})"] if len(s) > 15 else [])
        t = d["tipo_cambio"]
        crit = cat in CRITICAL
        oficial = d["eje"].startswith("OFICIAL")
        semantico = d.get("subtipo") == "SEMANTICO"
        if t == "UNCHANGED":
            r = "NINGUNO"
        elif oficial:
            r = ("ALTO" if crit and (t in ("CODE_REMOVED", "HIERARCHY_CHANGED") or (t in ("DESCRIPTION_CHANGED", "METADATA_CHANGED") and semantico))
                 else "MEDIO" if crit and t in ("CODE_ADDED", "CATALOG_ADDED", "BASELINE_UNAVAILABLE", "CONSTRAINT_CHANGED")
                 else "BAJO")
        else:  # ZOLVI→2.0: el código transmitido es lo que importa; etiquetas solo afectan UI
            r = ("ALTO" if crit and t == "CODE_REMOVED"
                 else "MEDIO" if crit and (t in ("CODE_ADDED", "BASELINE_UNAVAILABLE", "HIERARCHY_CHANGED") or semantico)
                 else "BAJO")
        d["riesgo_datos_existentes"] = r
        d["accion_potencial"] = {
            "CODE_REMOVED": "Revisar registros maestros que usen el código; bloquear su uso en nuevas emisiones sin alterar documentos históricos.",
            "CODE_ADDED": "Evaluar incorporación al catálogo Zolvi (seed) si el flujo lo requiere.",
            "DESCRIPTION_CHANGED": "Actualizar etiqueta si es semántico; verificar que el significado del código no cambió.",
            "HIERARCHY_CHANGED": "Revisar agrupación/relación jerárquica en datos maestros y UI de selección.",
            "CATALOG_ADDED": "Determinar si algún DTE ofrecido por Zolvi lo exige; no ampliar alcance comercial.",
            "CATALOG_REMOVED": "Verificar consumidores.", "METADATA_CHANGED": "Documentar; validar representación del código.",
            "CONSTRAINT_CHANGED": "Revisar regla de uso asociada.", "BASELINE_UNAVAILABLE": "Definir fuente Zolvi si el catálogo es requerido.",
            "UNCHANGED": "Ninguna."}.get(t)
        inc = []
        if cat in TERRITORIAL_SEGMENTED and d["eje"] == "ZOLVI→2.0" or cat in TERRITORIAL_SEGMENTED and t in ("CODE_ADDED", "CODE_REMOVED"):
            inc.append("Clave territorial con departamento INFERIDO por orden del Excel (sin columna de departamento).")
        if t in ("DESCRIPTION_CHANGED",) and d.get("subtipo") == "MENOR_REVISAR":
            inc.append("Diferencia menor: puede ser errata o cambio de significado; requiere revisión humana.")
        d["incertidumbres"] = inc

    tot = Counter((d["eje"], d["tipo_cambio"]) for d in diffs)
    by_cat = defaultdict(Counter)
    for d in diffs:
        by_cat[d["catalogo"]][f"{d['eje']}:{d['tipo_cambio']}"] += 1

    inv_out = OrderedDict([
        ("fase", "FASE_3"), ("generado_por", "scripts/03-compare-catalogs.py"),
        ("excel_2_0", meta_new), ("excel_v1_2", meta_old),
        ("resumen", {"catalogos_2_0": len(new), "catalogos_v1_2": len(old),
                     "registros_2_0": sum(len(c["entradas"]) for c in new.values()),
                     "registros_v1_2": sum(len(c["entradas"]) for c in old.values()),
                     "catalogos_con_fuente_zolvi": sorted(zsrc)}),
        ("corroboracion_territorial", corroboracion),
        ("catalogos", inventory),
    ])
    diff_out = OrderedDict([
        ("fase", "FASE_3"), ("generado_por", "scripts/03-compare-catalogs.py"),
        ("convenciones", {"eje": "OFICIAL_V1.2→2.0 (Excel MH anterior vs 2.0) | ZOLVI→2.0 (datos Zolvi vs 2.0)",
                          "clave": "código; CAT-008/CAT-013 usan 'DD|CC' con DD = departamento inferido por segmento",
                          "subtipo DESCRIPTION_CHANGED": "ORTOGRAFICO (solo tildes/mayúsculas/espacios/puntuación) | MENOR_REVISAR | SEMANTICO",
                          "principio": "Los documentos fiscales históricos aceptados no se modifican por actualizar catálogos."}),
        ("resumen", {"total": len(diffs), "por_eje_y_tipo": {f"{a}:{b}": n for (a, b), n in sorted(tot.items())},
                     "por_catalogo": {k: dict(v) for k, v in sorted(by_cat.items())},
                     "correspondencia_territorial_zolvi": dict(stats)}),
        ("correspondencia_territorial_revision_manual", terr),
        ("colisiones_municipio_actual_vs_cat013_2_0", colisiones),
        ("diferencias", diffs),
    ])
    with open(os.path.join(AUD, "03-inventario-catalogos.json"), "w", encoding="utf-8") as f:
        json.dump(inv_out, f, ensure_ascii=False, indent=1, default=str)
    with open(os.path.join(AUD, "03-catalogos-diff.json"), "w", encoding="utf-8") as f:
        json.dump(diff_out, f, ensure_ascii=False, indent=1, default=str)
    print(json.dumps(diff_out["resumen"]["por_eje_y_tipo"], ensure_ascii=False))
    print("territorial:", dict(stats))
    print("corroboracion:", json.dumps(corroboracion, ensure_ascii=False))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
