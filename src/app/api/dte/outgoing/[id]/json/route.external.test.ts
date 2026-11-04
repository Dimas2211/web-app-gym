// ─────────────────────────────────────────────────────────────────
// api/dte/outgoing/[id]/json — route.external.test.ts
//
// variant=external — payload completo de entrega externa (MariaDB):
// campos DTE + codigoEmpresa + responseMH + token. READ-ONLY.
// Usa la query real + buildExternalDtePayload real contra un cliente
// Prisma falso que solo permite dteOutgoingDocument.findFirst, y
// compara el archivo con el string exacto que el adaptador MariaDB
// pasaría al INSERT (mysql2 mockeado, sin red).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getDteApiContextMock = vi.fn();
vi.mock("../../../dte-api-context", () => ({
  getDteApiContext: (...args: unknown[]) => getDteApiContextMock(...args),
}));

// mysql2 mockeado: captura los parámetros del INSERT sin conectar.
const executeMock = vi.fn(async () => [{ insertId: 3, affectedRows: 1 }]);
vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: vi.fn(async () => ({ execute: executeMock, end: vi.fn(async () => {}) })),
  },
}));

import { GET } from "./route";
import { buildExternalDtePayload } from "@/modules/commerce/dte/services/build-external-dte-payload.service";
import { ExternalDteMariaDbAdapter } from "@/modules/commerce/dte/adapters/external-dte-mariadb.adapter";

// ── Fixtures ──────────────────────────────────────────────────────

const GEN = "CB09D13B-EFB3-40C5-933C-41E7C1C9606D";
const JWS = "eyJhbGciOiJSUzUxMiJ9." + "A".repeat(4096) + ".FIRMA-COMPLETA-SIN-TRUNCAR";
const SELLO = "2026B0A1C2D3E4F5A6B7C8D9E0F1A2B3C4D5E6F7";

function fiscalJson(nrc: string, nombre: string, tipoDte = "01") {
  return {
    identificacion: {
      version: 1, ambiente: "00", tipoDte,
      codigoGeneracion: GEN, numeroControl: "DTE-01-M001P001-000000000000002", tipoContingencia: null,
    },
    emisor:   { nit: "06140000000000", nrc, nombre },
    receptor: null,
    cuerpoDocumento: [{ numItem: 1, cantidad: 1, precioUni: 11.3, ventaGravada: 11.3, tributos: null }],
    resumen:  { totalPagar: 11.3, pagos: [{ codigo: "01", montoPago: 11.3 }] },
    extension: null,
    apendice:  null,
  };
}

const EXT_JSON = fiscalJson("3456789", "EMISOR DH APPS");

const MH_RESPONSE = {
  version: 2, versionApp: 2, estado: "PROCESADO",
  fhProcesamiento: "02/11/2026 10:15:00", clasificaMsg: "10",
  codigoMsg: "001", descripcionMsg: "RECIBIDO", observaciones: [],
};

type LogRow = { response_body: unknown; error_message: string | null; http_status: number | null; created_at: Date };

const OK_DELIVERY_LOG: LogRow = {
  response_body: {
    ok: true, insertId: "3", affectedRows: 1,
    targetTable: "dtes_metatraining", targetDatabase: "tecnicodhcp_db_fe",
    tipoDte: "01", deliveredBy: "user-1",
  },
  error_message: null, http_status: null, created_at: new Date("2026-11-02T16:20:00Z"),
};

interface StoredDoc {
  id: string; tenant_id: string; location_id: string;
  sale_id: string | null; purchase_id: string | null;
  dte_type_code: string; control_number: string | null; generation_code: string | null;
  environment: string; dte_status: string; accepted_at: Date | null;
  json_document: unknown; signed_jws: string | null; reception_stamp: string | null; mh_response: unknown;
  transmission_logs: LogRow[];
}

function extDoc(over: Partial<StoredDoc> = {}): StoredDoc {
  return {
    id: "dte-fe", tenant_id: "tenant-A", location_id: "loc-1",
    sale_id: "sale-1", purchase_id: null,
    dte_type_code: "01", control_number: "DTE-01-M001P001-000000000000002", generation_code: GEN,
    environment: "TEST", dte_status: "ACCEPTED", accepted_at: new Date("2026-11-02T16:15:00Z"),
    json_document: EXT_JSON, signed_jws: JWS, reception_stamp: SELLO, mh_response: MH_RESPONSE,
    transmission_logs: [],
    ...over,
  };
}

// ── Cliente Prisma falso (solo findFirst; cualquier otra op → throw) ──

function makeClient(store: StoredDoc[]) {
  const calls: string[] = [];
  const findFirst = vi.fn(async (args: {
    where: { id: string; tenant_id: string; location_id: string };
    select: Record<string, unknown>;
  }) => {
    calls.push("dteOutgoingDocument.findFirst");
    const hit = store.find((d) =>
      d.id === args.where.id && d.tenant_id === args.where.tenant_id && d.location_id === args.where.location_id,
    );
    if (!hit) return null;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args.select)) if (v) out[k] = (hit as unknown as Record<string, unknown>)[k];
    return out;
  });
  const forbidden = (path: string) => { throw new Error(`Operación no permitida (read-only): ${path}`); };
  const dteOutgoingDocument = new Proxy({ findFirst }, {
    get: (t, prop: string) => (prop === "findFirst" ? t.findFirst : () => forbidden(`dteOutgoingDocument.${prop}`)),
  });
  const client = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "dteOutgoingDocument") return dteOutgoingDocument;
      if (prop === "then") return undefined;
      return new Proxy(() => forbidden(prop), {
        get: (_x, sub: string) => () => forbidden(`${prop}.${sub}`),
        apply: () => forbidden(prop),
      });
    },
  });
  return { client, findFirst, calls };
}

function okContext(client: unknown, over: Record<string, unknown> = {}) {
  return {
    ok: true, user_id: "user-1", tenant_id: "tenant-A", location_id: "loc-1",
    client, runtime: null, readOnly: false, dispose: vi.fn(async () => {}),
    ...over,
  };
}

function get(id: string, qs: string) {
  return GET({ nextUrl: new URL(`http://localhost/api/dte/outgoing/${id}/json?${qs}`) } as never, {
    params: Promise.resolve({ id }),
  });
}
const view     = (id: string) => get(id, "variant=external");
const download = (id: string) => get(id, "variant=external&download=1");

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/dte/outgoing/:id/json?variant=external", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    getDteApiContextMock.mockReset();
    executeMock.mockClear();
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => infoSpy.mockRestore());

  it("variante desconocida → 400 sin resolver contexto", async () => {
    const res = await get("dte-fe", "variant=otra");
    expect(res.status).toBe(400);
    expect(getDteApiContextMock).not.toHaveBeenCalled();
  });

  it("entregado → mode RECONSTRUCTED con metadatos de entrega; +codigoEmpresa/responseMH/token; resto intacto", async () => {
    const stored = extDoc({ transmission_logs: [OK_DELIVERY_LOG] });
    const { client } = makeClient([stored]);
    getDteApiContextMock.mockResolvedValue(okContext(client));

    const res  = await view("dte-fe");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(body.data).toMatchObject({
      variant: "external", mode: "RECONSTRUCTED",
      file_name: `DTE_COMPLETO_${GEN}.json`,
      delivery: { target_database: "tecnicodhcp_db_fe", target_table: "dtes_metatraining", insert_id: "3" },
    });

    const p = body.data.json_document;
    expect(p.codigoEmpresa).toBe(EXT_JSON.emisor.nrc);
    expect(p.token).toBe(JWS);
    expect(p.responseMH).toEqual({
      version: 2, ambiente: "00", versionApp: 2, estado: "PROCESADO",
      codigoGeneracion: GEN, selloRecibido: SELLO,
      fhProcesamiento: "02/11/2026 10:15:00", clasificaMsg: "10",
      codigoMsg: "001", descripcionMsg: "RECIBIDO", observaciones: [],
    });

    const rest = { ...p };
    delete rest.codigoEmpresa;
    delete rest.responseMH;
    delete rest.token;
    expect(rest).toEqual(EXT_JSON);

    // Mismo resultado que el builder compartido — no hay generador paralelo.
    const built = buildExternalDtePayload(stored);
    expect(built.ok).toBe(true);
    if (built.ok) expect(JSON.parse(JSON.stringify(built.payload))).toEqual(p);
  });

  it("sin entrega exitosa → mode PREVIEW y delivery null", async () => {
    const failed: LogRow = { response_body: { ok: false, errorCode: "INSERT_FAILED" }, error_message: "x", http_status: null, created_at: new Date() };
    const { client } = makeClient([extDoc({ transmission_logs: [failed] })]);
    getDteApiContextMock.mockResolvedValue(okContext(client));

    const body = await (await view("dte-fe")).json();
    expect(body.data.mode).toBe("PREVIEW");
    expect(body.data.delivery).toBeNull();
  });

  it("descarga = string EXACTO que el adaptador MariaDB enviaría en el INSERT; JWS sin truncar", async () => {
    const stored = extDoc({ transmission_logs: [OK_DELIVERY_LOG] });
    const { client } = makeClient([stored]);
    getDteApiContextMock.mockResolvedValue(okContext(client));

    const res = await download("dte-fe");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="DTE_COMPLETO_${GEN}.json"`);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");

    const text   = await res.text();
    const parsed = JSON.parse(text);                 // JSON válido
    expect(parsed.token).toBe(JWS);
    expect(parsed.token.length).toBe(JWS.length);

    // Lo que el adaptador real pasaría a `INSERT ... (json, estado, ...)`.
    const built = buildExternalDtePayload(stored);
    if (!built.ok) throw new Error(built.error);
    await new ExternalDteMariaDbAdapter().insert(
      { host: "h", port: 3306, user: "u", password: "p", database: "db", table: "t",
        invalidationTable: "ti", enabled: true, timeoutMs: 1000 },
      built.payload,
    );
    const insertedJson = (executeMock.mock.calls[0] as unknown as [string, unknown[]])[1][0];
    expect(text).toBe(insertedJson);
  });

  it("estructura idéntica entre organizaciones (p.ej. DH APPS vs METALCO): mismas claves y forma", async () => {
    const a = buildExternalDtePayload(extDoc({ json_document: fiscalJson("3456789", "DH APPS") }));
    const b = buildExternalDtePayload(extDoc({
      tenant_id: "tenant-M", json_document: fiscalJson("1112223", "METALCO"),
      signed_jws: "h.p.s", reception_stamp: "OTRO-SELLO",
    }));
    if (!a.ok || !b.ok) throw new Error("builder falló");
    expect(Object.keys(a.payload)).toEqual(Object.keys(b.payload));
    expect(Object.keys(a.payload.responseMH)).toEqual(Object.keys(b.payload.responseMH));
    expect(Object.keys(a.payload).slice(-3)).toEqual(["codigoEmpresa", "responseMH", "token"]);
    expect(b.payload.codigoEmpresa).toBe("1112223");
  });

  it("variante fiscal sigue devolviendo json_document original, sin token ni responseMH", async () => {
    const { client } = makeClient([extDoc({ transmission_logs: [OK_DELIVERY_LOG] })]);
    getDteApiContextMock.mockResolvedValue(okContext(client));

    const res  = await get("dte-fe", "");
    const body = await res.json();
    expect(body.data.variant).toBe("fiscal");
    expect(body.data.json_document).toEqual(EXT_JSON);
    expect(JSON.stringify(body)).not.toContain("FIRMA-COMPLETA");
  });

  it("DTE no recibido por MH (SIGNED) → 409 con motivo del builder, sin archivo", async () => {
    const { client } = makeClient([extDoc({ dte_status: "SIGNED", reception_stamp: null })]);
    getDteApiContextMock.mockResolvedValue(okContext(client));
    const res = await download("dte-fe");
    expect(res.status).toBe(409);
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect((await res.json()).error).toMatch(/recibido fiscalmente/);
  });

  it("sin sesión → 401 y sin permiso → 403: nunca se obtiene el JWS", async () => {
    getDteApiContextMock.mockResolvedValueOnce({ ok: false, status: 401, error: "No autorizado." });
    getDteApiContextMock.mockResolvedValueOnce({ ok: false, status: 403, error: "Sin permisos para esta operación." });
    const r1 = await download("dte-fe");
    const r2 = await download("dte-fe");
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(403);
    expect(await r2.text()).not.toContain("eyJ");
  });

  it("sesión de soporte solo lectura → 403 sin consultar el documento", async () => {
    const { client, findFirst } = makeClient([extDoc()]);
    getDteApiContextMock.mockResolvedValue(okContext(client, { readOnly: true }));
    expect((await view("dte-fe")).status).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("aislamiento entre organizaciones y por location → 404 sin JWS", async () => {
    const { client } = makeClient([extDoc({ tenant_id: "tenant-B" }), extDoc({ id: "dte-2", location_id: "loc-9" })]);
    getDteApiContextMock.mockResolvedValue(okContext(client));
    const a = await download("dte-fe");
    const b = await view("dte-2");
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(await a.text()).not.toContain("eyJ");
  });

  it("DTE de compra (FSE 14, purchase_id, PRODUCTION) → payload externo disponible", async () => {
    const { client } = makeClient([extDoc({
      id: "dte-fse", sale_id: null, purchase_id: "pur-1", dte_type_code: "14",
      environment: "PRODUCTION", json_document: fiscalJson("3456789", "X", "14"),
    })]);
    getDteApiContextMock.mockResolvedValue(okContext(client));
    const body = await (await view("dte-fse")).json();
    expect(body.data).toMatchObject({ purchase_id: "pur-1", sale_id: null, dte_type_code: "14", mode: "PREVIEW" });
    expect(body.data.json_document.token).toBe(JWS);
  });

  it("sin efectos secundarios: solo findFirst, sin MariaDB, sin JWS ni payload en logs", async () => {
    const { client, calls } = makeClient([extDoc({ transmission_logs: [OK_DELIVERY_LOG] })]);
    getDteApiContextMock.mockResolvedValue(okContext(client));

    await view("dte-fe");
    await download("dte-fe");

    expect(calls).toEqual(["dteOutgoingDocument.findFirst", "dteOutgoingDocument.findFirst"]);
    expect(executeMock).not.toHaveBeenCalled();
    const logged = infoSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("variant=external");
    expect(logged).not.toContain("eyJ");
    expect(logged).not.toContain(SELLO);
    expect(logged).not.toContain("EMISOR DH APPS");
  });
});
