// COR-01 — reinicio anual del correlativo (unitario, sin BD).
//
// Antes de M-COR-01 este archivo caracterizaba el comportamiento anterior
// (la secuencia continuaba al cambiar de año y el año salía de la zona del
// proceso). Se actualizó a propósito al implementar COR-01 (opción B):
//   - el año es SIEMPRE el de El Salvador (UTC−6), con `now` explícito;
//   - la secuencia reinicia en 1 en cada ejercicio;
//   - el piso solo mira el mismo ejercicio + heredados sin año (fail-safe);
//   - estado y alineación administrativa son por ejercicio;
//   - la generación rechaza emitir un número de otro ejercicio.
// La concurrencia y la unicidad reales se prueban en dte-correlative.cor01.pg.test.ts.

import { describe, expect, it, vi } from "vitest";
import {
  alignDteCorrelativeBaseline,
  currentDteFiscalYear,
  getDteCorrelativeStatus,
  reserveDteControlNumber,
  reserveDteControlNumberBlock,
} from "./dte-correlative.service";
import {
  checkDteFiscalYearForGeneration,
  DTE_FISCAL_YEAR_MISMATCH,
  fiscalYearFromFecEmi,
  fiscalYearInElSalvador,
} from "../utils/dte-fiscal-year";

const ctx = {
  tenant_id: "t1", location_id: "l1", issuer_config_id: "ic1", environment: "TEST" as const,
  dte_type_code: "01", cod_estable_mh: "M001", cod_punto_venta_mh: "P001",
};
const cn = (seq: number) => `DTE-01-M001P001-${String(seq).padStart(15, "0")}`;

// Medianoche de El Salvador = 06:00 UTC.
const SV_2026_12_31_2359 = new Date("2027-01-01T05:59:59.999Z");
const SV_2027_01_01_0000 = new Date("2027-01-01T06:00:00.000Z");

type Doc = { control_number: string; fiscal_year: number | null };
type Row = { last_sequence: number; external_baseline_last_used_sequence: number | null };

function fakeDb(docs: Doc[]) {
  const rows = new Map<number, Row>();
  const yearOf = (where: any) => where.tenant_id_location_id_issuer_config_id_environment_dte_type_code_year.year as number;
  const client = {
    dteCorrelative: {
      createMany: vi.fn(async ({ data }: any) => {
        const y = data[0].year as number;
        if (rows.has(y)) return { count: 0 };
        rows.set(y, { last_sequence: 0, external_baseline_last_used_sequence: null });
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const r = rows.get(yearOf(where));
        if (!r) throw Object.assign(new Error("not found"), { code: "P2025" });
        if (typeof data.last_sequence === "number") r.last_sequence = data.last_sequence;
        else if (data.last_sequence?.increment) r.last_sequence += data.last_sequence.increment;
        return { ...r };
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const r = rows.get(yearOf(where));
        return r ? { ...r, external_baseline_source: null, external_baseline_notes: null, external_baseline_evidence_ref: null, external_baseline_set_by: null, external_baseline_set_at: null } : null;
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const y = yearOf(where);
        const r = rows.get(y);
        if (r) Object.assign(r, update);
        else rows.set(y, { last_sequence: create.last_sequence, external_baseline_last_used_sequence: create.external_baseline_last_used_sequence });
        return {};
      }),
    },
    dteOutgoingDocument: {
      // Respeta el filtro COR-01: OR [{ fiscal_year: Y }, { fiscal_year: null }].
      findMany: vi.fn(async ({ where }: any) => {
        const years: Array<number | null> = (where.OR ?? []).map((c: any) => c.fiscal_year);
        return docs
          .filter((d) => d.control_number.startsWith(where.control_number.startsWith))
          .filter((d) => years.length === 0 || years.includes(d.fiscal_year))
          .map((d) => ({ control_number: d.control_number }));
      }),
    },
  };
  return { rows, client: client as any };
}

describe("COR-01 — año fiscal en hora de El Salvador (COR-02)", () => {
  it("límite de medianoche SV: 23:59:59.999 del 31/12 es 2026; 00:00 del 01/01 es 2027", () => {
    expect(fiscalYearInElSalvador(SV_2026_12_31_2359)).toBe(2026);
    expect(fiscalYearInElSalvador(SV_2027_01_01_0000)).toBe(2027);
    // 31/12 18:30 SV = 00:30 UTC del 01/01: con el proceso en UTC getFullYear daría 2027.
    expect(fiscalYearInElSalvador(new Date("2027-01-01T00:30:00Z"))).toBe(2026);
    expect(currentDteFiscalYear(new Date("2027-01-01T00:30:00Z"))).toBe(2026);
  });

  it("no depende de la zona del proceso (cálculo por instante UTC)", () => {
    const instant = new Date(Date.UTC(2027, 0, 1, 3, 0, 0)); // 31/12 21:00 SV
    expect(fiscalYearInElSalvador(instant)).toBe(2026);
    expect(new Date(instant.getTime()).getUTCFullYear()).toBe(2027);
  });

  it("año desde fecEmi (solo lectura)", () => {
    expect(fiscalYearFromFecEmi("2026-12-31")).toBe(2026);
    expect(fiscalYearFromFecEmi("bad")).toBeNull();
    expect(fiscalYearFromFecEmi(null)).toBeNull();
  });
});

describe("COR-01 — reserva simple", () => {
  it("transición 2026 → 2027: el primer DTE del ejercicio nuevo lleva la secuencia 1", async () => {
    const { client, rows } = fakeDb([{ control_number: cn(41), fiscal_year: 2026 }]);
    const r = await reserveDteControlNumber(client, ctx, { now: SV_2027_01_01_0000 });
    expect(rows.has(2027)).toBe(true);
    expect(r).toEqual({ sequence: 1, control_number: cn(1), fiscal_year: 2027 });
  });

  it("31/12 23:59 SV sigue en el ejercicio anterior y continúa su secuencia", async () => {
    const { client } = fakeDb([{ control_number: cn(41), fiscal_year: 2026 }]);
    const r = await reserveDteControlNumber(client, ctx, { now: SV_2026_12_31_2359 });
    expect(r).toEqual({ sequence: 42, control_number: cn(42), fiscal_year: 2026 });
  });

  it("reservas sucesivas del mismo año son contiguas", async () => {
    const { client } = fakeDb([]);
    const a = await reserveDteControlNumber(client, ctx, { now: SV_2027_01_01_0000 });
    const b = await reserveDteControlNumber(client, ctx, { now: SV_2027_01_01_0000 });
    expect([a.sequence, b.sequence]).toEqual([1, 2]);
  });

  it("alta de la fila con createMany(skipDuplicates) y lock por UPDATE (R-COR-3), nunca upsert", async () => {
    const { client } = fakeDb([]);
    await reserveDteControlNumber(client, ctx, { now: SV_2027_01_01_0000 });
    expect(client.dteCorrelative.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(client.dteCorrelative.upsert).not.toHaveBeenCalled();
  });

  it("heredados sin fiscal_year (ambiguos) cuentan en el piso de cualquier año: no se reutilizan", async () => {
    const { client } = fakeDb([{ control_number: cn(7), fiscal_year: null }, { control_number: cn(41), fiscal_year: 2026 }]);
    const r = await reserveDteControlNumber(client, ctx, { now: SV_2027_01_01_0000 });
    expect(r.sequence).toBe(8);
  });

  it("el piso filtra por ejercicio (consulta con OR fiscal_year / NULL)", async () => {
    const { client } = fakeDb([]);
    await reserveDteControlNumber(client, ctx, { now: SV_2027_01_01_0000 });
    const where = client.dteOutgoingDocument.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ fiscal_year: 2027 }, { fiscal_year: null }]);
  });
});

describe("COR-01 — reserva en bloque (MH TEST)", () => {
  it("en el ejercicio nuevo el bloque puede empezar en 1 aunque el anterior llegó a 41", async () => {
    const { client } = fakeDb([{ control_number: cn(41), fiscal_year: 2026 }]);
    const r = await reserveDteControlNumberBlock(client, ctx, { firstSequence: 1, count: 3, now: SV_2027_01_01_0000 });
    expect(r).toMatchObject({ ok: true, floor: 0, fiscal_year: 2027 });
  });

  it("en el mismo ejercicio sigue rechazando números ya usados", async () => {
    const { client } = fakeDb([{ control_number: cn(41), fiscal_year: 2026 }]);
    const r = await reserveDteControlNumberBlock(client, ctx, { firstSequence: 1, count: 3, now: SV_2026_12_31_2359 });
    expect(r).toMatchObject({ ok: false, code: "FIRST_SEQUENCE_ALREADY_USED", next_available: 42 });
  });
});

describe("COR-01 — estado y alineación administrativa por ejercicio", () => {
  it("getDteCorrelativeStatus informa el ejercicio y su propio piso", async () => {
    const { client } = fakeDb([{ control_number: cn(41), fiscal_year: 2026 }]);
    const s2026 = await getDteCorrelativeStatus({ ...ctx, fiscal_year: 2026 }, client);
    const s2027 = await getDteCorrelativeStatus({ ...ctx, fiscal_year: 2027 }, client);
    expect(s2026).toMatchObject({ fiscal_year: 2026, next_sequence: 42 });
    expect(s2027).toMatchObject({ fiscal_year: 2027, next_sequence: 1, exists: false });
  });

  it("el baseline externo se registra en el ejercicio pedido y no afecta otro", async () => {
    const { client, rows } = fakeDb([{ control_number: cn(41), fiscal_year: 2026 }]);
    const r = await alignDteCorrelativeBaseline({ ...ctx, last_used_sequence: 100, source: "Sistema anterior", notes: "Evidencia folio 100", user_id: "u1", fiscal_year: 2027 }, client);
    expect(r).toEqual({ ok: true, next_sequence: 101 });
    expect(rows.get(2027)?.external_baseline_last_used_sequence).toBe(100);
    expect(rows.has(2026)).toBe(false);
    const next = await reserveDteControlNumber(client, ctx, { now: SV_2027_01_01_0000 });
    expect(next.sequence).toBe(101);
  });

  it("el baseline no puede retroceder por debajo de lo usado en el MISMO ejercicio", async () => {
    const { client } = fakeDb([{ control_number: cn(41), fiscal_year: 2026 }]);
    const r = await alignDteCorrelativeBaseline({ ...ctx, last_used_sequence: 10, source: "x", notes: "y", user_id: "u1", fiscal_year: 2026 }, client);
    expect(r.ok).toBe(false);
  });

  it("rechaza un ejercicio inválido", async () => {
    const { client } = fakeDb([]);
    const r = await alignDteCorrelativeBaseline({ ...ctx, last_used_sequence: 1, source: "x", notes: "y", user_id: "u1", fiscal_year: 27 }, client);
    expect(r.ok).toBe(false);
  });
});

describe("COR-01 — guarda de generación (pendientes de años anteriores)", () => {
  it("mismo ejercicio → permite", () => {
    expect(checkDteFiscalYearForGeneration({ fiscal_year: 2027, control_number: cn(1) }, SV_2027_01_01_0000)).toEqual({ ok: true, fiscal_year: 2027 });
  });

  it("pendiente reservado en 2026 y generado en 2027 → rechazo explícito, sin renumerar", () => {
    const doc = { fiscal_year: 2026, control_number: cn(42) };
    const r = checkDteFiscalYearForGeneration(doc, SV_2027_01_01_0000);
    expect(r).toMatchObject({ ok: false, code: DTE_FISCAL_YEAR_MISMATCH });
    expect(doc.control_number).toBe(cn(42));
  });

  it("heredado sin fiscal_year: compara con el año SV de created_at (sin escribir)", () => {
    const legacy = { fiscal_year: null, created_at: new Date("2026-12-31T12:00:00Z"), control_number: cn(9) };
    expect(checkDteFiscalYearForGeneration(legacy, SV_2026_12_31_2359).ok).toBe(true);
    expect(checkDteFiscalYearForGeneration(legacy, SV_2027_01_01_0000).ok).toBe(false);
  });

  it("sin evidencia alguna → no bloquea (comportamiento histórico)", () => {
    expect(checkDteFiscalYearForGeneration({ fiscal_year: null, created_at: null }, SV_2027_01_01_0000).ok).toBe(true);
  });
});
