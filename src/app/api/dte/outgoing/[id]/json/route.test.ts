// ─────────────────────────────────────────────────────────────────
// api/dte/outgoing/[id]/json — route.test.ts
//
// GET /api/dte/outgoing/:id/json — JSON original persistido (READ-ONLY).
// Usa la query real contra un cliente Prisma falso que emula el filtro
// id + tenant_id + location_id, y que falla ante cualquier operación
// distinta de dteOutgoingDocument.findFirst (sin efectos secundarios).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getDteApiContextMock = vi.fn();
vi.mock("../../../dte-api-context", () => ({
  getDteApiContext: (...args: unknown[]) => getDteApiContextMock(...args),
}));

import { GET } from "./route";

// ── Fixtures ──────────────────────────────────────────────────────

interface StoredDoc {
  id:              string;
  tenant_id:       string;
  location_id:     string;
  sale_id:         string | null;
  purchase_id:     string | null;
  dte_type_code:   string;
  generation_code: string | null;
  control_number:  string | null;
  environment:     string;
  dte_status:      string;
  json_document:   unknown;
  signed_jws:      string | null;
  mh_response:     unknown;
  reception_stamp: string | null;
}

const FE_JSON = {
  identificacion: {
    version: 1,
    ambiente: "00",
    tipoDte: "01",
    codigoGeneracion: "CB09D13B-EFB3-40C5-933C-41E7C1C9606D",
    tipoContingencia: null,
    motivoContin: null,
  },
  cuerpoDocumento: [
    { numItem: 1, cantidad: 2, precioUni: 12.5, ventaGravada: 25, tributos: null },
    { numItem: 2, cantidad: 1, precioUni: 0.01, ventaGravada: 0.01, tributos: ["20"] },
  ],
  resumen: { totalPagar: 25.01, totalLetras: "VEINTICINCO 01/100 USD", pagos: [] },
  extension: null,
  apendice: null,
};

function doc(over: Partial<StoredDoc>): StoredDoc {
  return {
    id:              "dte-fe",
    tenant_id:       "tenant-A",
    location_id:     "loc-1",
    sale_id:         "sale-1",
    purchase_id:     null,
    dte_type_code:   "01",
    generation_code: "CB09D13B-EFB3-40C5-933C-41E7C1C9606D",
    control_number:  "DTE-01-M001P001-000000000000002",
    environment:     "TEST",
    dte_status:      "ACCEPTED",
    json_document:   FE_JSON,
    signed_jws:      "eyJhbGciOiJSUzUxMiJ9.SECRET.SIG",
    mh_response:     { selloRecibido: "SELLO-SECRETO" },
    reception_stamp: "SELLO-SECRETO",
    ...over,
  };
}

// ── Cliente Prisma falso (solo findFirst; cualquier otra op → throw) ──

function makeClient(store: StoredDoc[]) {
  const calls: string[] = [];
  const findFirst = vi.fn(async (args: {
    where: { id: string; tenant_id: string; location_id: string };
    select: Record<string, boolean>;
  }) => {
    calls.push("dteOutgoingDocument.findFirst");
    const hit = store.find((d) =>
      d.id === args.where.id &&
      d.tenant_id === args.where.tenant_id &&
      d.location_id === args.where.location_id,
    );
    if (!hit) return null;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args.select)) if (v) out[k] = (hit as unknown as Record<string, unknown>)[k];
    return out;
  });

  const forbidden = (path: string) => {
    throw new Error(`Operación no permitida en endpoint read-only: ${path}`);
  };

  const dteOutgoingDocument = new Proxy({ findFirst }, {
    get(target, prop: string) {
      if (prop === "findFirst") return target.findFirst;
      return () => forbidden(`dteOutgoingDocument.${prop}`);
    },
  });

  const client = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "dteOutgoingDocument") return dteOutgoingDocument;
      if (prop === "then") return undefined;
      return new Proxy(() => forbidden(String(prop)), {
        get: (_x, sub: string) => () => forbidden(`${String(prop)}.${sub}`),
        apply: () => forbidden(String(prop)),
      });
    },
  });

  return { client, findFirst, calls };
}

function okContext(client: unknown, over: Partial<{ tenant_id: string; location_id: string }> = {}) {
  return {
    ok:          true,
    user_id:     "user-1",
    tenant_id:   "tenant-A",
    location_id: "loc-1",
    client,
    runtime:     null,
    readOnly:    false,
    dispose:     vi.fn(async () => {}),
    ...over,
  };
}

function req(download = false) {
  const url = new URL(`http://localhost/api/dte/outgoing/x/json${download ? "?download=1" : ""}`);
  return { nextUrl: url } as never;
}

function call(id: string, download = false) {
  return GET(req(download), { params: Promise.resolve({ id }) });
}

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/dte/outgoing/:id/json", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getDteApiContextMock.mockReset();
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("usa el guard fiscal compartido con resolución de location runtime (solo lectura)", async () => {
    const { client } = makeClient([doc({})]);
    getDteApiContextMock.mockResolvedValue(okContext(client));
    await call("dte-fe");
    expect(getDteApiContextMock).toHaveBeenCalledWith(expect.anything(), {
      resolveRuntimeActiveLocation: true,
    });
  });

  it("sin sesión → 401 sin consultar documento", async () => {
    getDteApiContextMock.mockResolvedValue({ ok: false, status: 401, error: "No autorizado." });
    const res = await call("dte-fe");
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("usuario sin permiso fiscal → 403", async () => {
    getDteApiContextMock.mockResolvedValue({ ok: false, status: 403, error: "Sin permisos para esta operación." });
    const res = await call("dte-fe", true);
    expect(res.status).toBe(403);
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });

  it("vista: retorna exactamente json_document persistido + metadatos, sin campos sensibles", async () => {
    const { client, findFirst } = makeClient([doc({})]);
    const ctx = okContext(client);
    getDteApiContextMock.mockResolvedValue(ctx);

    const res  = await call("dte-fe");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(body.ok).toBe(true);
    expect(body.data.json_document).toEqual(FE_JSON);
    expect(body.data).toMatchObject({
      id: "dte-fe", dte_type_code: "01", environment: "TEST", dte_status: "ACCEPTED",
      generation_code: "CB09D13B-EFB3-40C5-933C-41E7C1C9606D",
      file_name: "DTE_01_CB09D13B-EFB3-40C5-933C-41E7C1C9606D.json",
    });

    const raw = JSON.stringify(body);
    expect(raw).not.toContain("SECRET");
    expect(raw).not.toContain("SELLO-SECRETO");
    expect(body.data).not.toHaveProperty("signed_jws");
    expect(body.data).not.toHaveProperty("mh_response");
    expect(body.data).not.toHaveProperty("reception_stamp");

    // La query nunca selecciona columnas sensibles y siempre filtra el scope.
    const args = findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: "dte-fe", tenant_id: "tenant-A", location_id: "loc-1" });
    expect(args.select).not.toHaveProperty("signed_jws");
    expect(args.select).not.toHaveProperty("mh_response");
    expect(args.select).not.toHaveProperty("reception_stamp");
    expect(ctx.dispose).toHaveBeenCalledTimes(1);
  });

  it("descarga: attachment .json válido cuyo contenido coincide con json_document (números, nulos, arreglos)", async () => {
    const { client } = makeClient([doc({})]);
    getDteApiContextMock.mockResolvedValue(okContext(client));

    const res = await call("dte-fe", true);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="DTE_01_CB09D13B-EFB3-40C5-933C-41E7C1C9606D.json"',
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");

    const text = await res.text();
    const parsed = JSON.parse(text);
    expect(parsed).toEqual(FE_JSON);
    expect(parsed.identificacion.tipoContingencia).toBeNull();
    expect(parsed.cuerpoDocumento[1].precioUni).toBe(0.01);
    expect(Array.isArray(parsed.resumen.pagos)).toBe(true);
    expect(text).not.toContain("SECRET");
  });

  it("documento sin JSON generado → 409 en vista y descarga", async () => {
    const { client } = makeClient([doc({ json_document: null, dte_status: "PENDING_GENERATION" })]);
    getDteApiContextMock.mockResolvedValue(okContext(client));

    const view = await call("dte-fe");
    expect(view.status).toBe(409);
    expect((await view.json()).error).toMatch(/JSON generado/);

    const dl = await call("dte-fe", true);
    expect(dl.status).toBe(409);
    expect(dl.headers.get("Content-Disposition")).toBeNull();
  });

  it("documento inexistente → 404", async () => {
    const { client } = makeClient([doc({})]);
    getDteApiContextMock.mockResolvedValue(okContext(client));
    const res = await call("dte-nope");
    expect(res.status).toBe(404);
  });

  it("aislamiento entre tenants: documento de otro tenant → 404", async () => {
    const { client } = makeClient([doc({ tenant_id: "tenant-B" })]);
    getDteApiContextMock.mockResolvedValue(okContext(client));
    const res = await call("dte-fe", true);
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });

  it("aislamiento por location: documento de otra sucursal → 404", async () => {
    const { client } = makeClient([doc({ location_id: "loc-2" })]);
    getDteApiContextMock.mockResolvedValue(okContext(client));
    const res = await call("dte-fe");
    expect(res.status).toBe(404);

    // La misma sucursal correcta sí lo ve.
    getDteApiContextMock.mockResolvedValue(okContext(client, { location_id: "loc-2" }));
    expect((await call("dte-fe")).status).toBe(200);
  });

  it("venta con factura y NC: cada id devuelve su propio documento sin confundirlos", async () => {
    const NC_JSON = { identificacion: { tipoDte: "05", codigoGeneracion: "NC-GEN" }, documentoRelacionado: [{ tipoDocumento: "03" }] };
    const { client } = makeClient([
      doc({ id: "dte-ccfe", dte_type_code: "03", generation_code: "CCFE-GEN", json_document: { identificacion: { tipoDte: "03" } } }),
      doc({ id: "dte-nc", dte_type_code: "05", generation_code: "NC-GEN", json_document: NC_JSON }),
    ]);
    getDteApiContextMock.mockResolvedValue(okContext(client));

    const nc = await (await call("dte-nc")).json();
    expect(nc.data.dte_type_code).toBe("05");
    expect(nc.data.json_document).toEqual(NC_JSON);

    const ccfeDl = await call("dte-ccfe", true);
    expect(ccfeDl.headers.get("Content-Disposition")).toContain("DTE_03_CCFE-GEN.json");
    expect(JSON.parse(await ccfeDl.text())).toEqual({ identificacion: { tipoDte: "03" } });
  });

  it("documento vinculado a compra (FSE 14, purchase_id, PRODUCTION) → descarga", async () => {
    const FSE_JSON = { identificacion: { tipoDte: "14", ambiente: "01" }, sujetoExcluido: { nombre: "Proveedor X", correo: null } };
    const { client } = makeClient([
      doc({ id: "dte-fse", sale_id: null, purchase_id: "pur-1", dte_type_code: "14",
            environment: "PRODUCTION", generation_code: "ab12cd34-0000-4000-8000-000000000014", json_document: FSE_JSON }),
    ]);
    getDteApiContextMock.mockResolvedValue(okContext(client));

    const view = await (await call("dte-fse")).json();
    expect(view.data).toMatchObject({ purchase_id: "pur-1", sale_id: null, environment: "PRODUCTION" });

    const dl = await call("dte-fse", true);
    expect(dl.headers.get("Content-Disposition")).toContain("DTE_14_AB12CD34-0000-4000-8000-000000000014.json");
    expect(JSON.parse(await dl.text())).toEqual(FSE_JSON);
  });

  it.each([
    ["01", "TEST",       "ACCEPTED"],
    ["03", "PRODUCTION", "REJECTED"],
    ["05", "TEST",       "SIGNED"],
    ["11", "PRODUCTION", "GENERATED"],
    ["14", "TEST",       "INVALIDATED"],
  ])("tipo %s en %s con estado %s → JSON disponible", async (code, env, status) => {
    const json = { identificacion: { tipoDte: code } };
    const { client } = makeClient([doc({ id: `d-${code}`, dte_type_code: code, environment: env, dte_status: status, json_document: json })]);
    getDteApiContextMock.mockResolvedValue(okContext(client));

    const body = await (await call(`d-${code}`)).json();
    expect(body.data).toMatchObject({ dte_type_code: code, environment: env, dte_status: status });
    expect(body.data.json_document).toEqual(json);
  });

  it("sin efectos secundarios: solo una lectura findFirst y el log no incluye el contenido", async () => {
    const { client, calls } = makeClient([doc({})]);
    getDteApiContextMock.mockResolvedValue(okContext(client));

    await call("dte-fe");
    await call("dte-fe", true);

    expect(calls).toEqual(["dteOutgoingDocument.findFirst", "dteOutgoingDocument.findFirst"]);
    const logged = infoSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("dte=dte-fe");
    expect(logged).not.toContain("cuerpoDocumento");
    expect(logged).not.toContain("VEINTICINCO");
    expect(logged).not.toContain("SECRET");
  });
});
