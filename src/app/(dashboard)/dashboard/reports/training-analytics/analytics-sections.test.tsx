// GYM-5D — revisión independiente: enlaces de clases según gym.classes y nota
// de solapes heredados entre sucursales (§8). Render puro, sin base de datos.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { progressBuckets } from "@/modules/client-portal/progress-rules";
import { currentAnalytics, type AnalyticsPlanInput } from "@/modules/weekly-plans/training-analytics-rules";
import type { TrainingAnalytics } from "@/modules/weekly-plans/training-analytics-queries";
import { BranchesSection, CROSS_BRANCH_DETECTED, CROSS_BRANCH_SCOPE, RelatedLinks, TrainersSection } from "./analytics-sections";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const TODAY = "2026-03-11";
const CLASS_LINKS = ['href="/dashboard/reports/trainers/classes-taught"', 'href="/dashboard/reports/attendance/by-period"'];

const plan = (id: string, branchId: string, start: string, end: string, createdAt: number): AnalyticsPlanInput => ({
  id,
  clientId: "lu",
  branchId,
  trainerId: "T1",
  modality: "NORMAL",
  start,
  end,
  status: "active",
  createdAt,
  days: [{ id: `${id}-d`, weekday: 1 }],
  executions: [],
});
const OLD = plan("old", "B1", "2026-02-23", "2026-03-15", 1);
const RECENT = plan("recent", "B2", "2026-03-02", "2026-03-29", 2);

function analytics(plans: AnalyticsPlanInput[], branches = [{ id: "B1", name: "Sede 1", active: true }, { id: "B2", name: "Sede 2", active: true }]): TrainingAnalytics {
  return {
    today: TODAY,
    range: "semanas",
    buckets: progressBuckets("semanas", TODAY),
    branches,
    current: currentAnalytics(plans, TODAY),
    evolution: null,
    compliance: true,
    incomplete: false,
    trackingUnavailable: false,
    trackingStart: null,
    trainers: new Map([["T1", { name: "Uno, Entrenador", active: true }]]),
    attendance: null,
  };
}

describe("GYM-5D secciones — enlaces dependientes de gym.classes", () => {
  it("con gym.classes: Relacionados y Entrenadores enlazan a Asistencia por período y Clases impartidas", () => {
    const html = renderToStaticMarkup(
      <>
        <TrainersSection data={analytics([OLD])} classes />
        <RelatedLinks classes />
      </>
    );
    for (const l of CLASS_LINKS) expect(html).toContain(l);
    expect(html).toContain('href="/dashboard/weekly-plans/client-plans"');
  });

  it("sin gym.classes: ningún enlace a reportes de clases; se conservan Planes semanales y la tabla de entrenadores", () => {
    const data = analytics([OLD]);
    const html = renderToStaticMarkup(
      <>
        <TrainersSection data={data} classes={false} />
        <RelatedLinks classes={false} />
      </>
    );
    for (const l of CLASS_LINKS) expect(html).not.toContain(l);
    expect(html).not.toContain("Clases impartidas");
    expect(html).toContain('href="/dashboard/weekly-plans/client-plans"');
    expect(html).toContain("Uno, Entrenador");
    expect(html).toContain("no son una evaluación del");
    // Los cálculos no dependen del módulo de clases.
    expect(renderToStaticMarkup(<TrainersSection data={data} classes />).replace(/ Las clases impartidas[\s\S]*?<\/a>\./, "")).toBe(
      renderToStaticMarkup(<TrainersSection data={data} classes={false} />)
    );
  });
});

describe("GYM-5D secciones — solapes heredados entre sucursales (§8)", () => {
  it("comparación del tenant con solape detectado: nota discreta, sin afirmar que coincide con la vista por sede", () => {
    const html = renderToStaticMarkup(<BranchesSection data={analytics([OLD, RECENT])} title="Comparación entre sucursales" single={false} />);
    expect(html).toContain(CROSS_BRANCH_DETECTED);
    expect(html).not.toContain(CROSS_BRANCH_SCOPE);
    expect(html).not.toMatch(/siempre coincide/i);
  });

  it("comparación del tenant sin solape entre sedes: sin nota", () => {
    const html = renderToStaticMarkup(
      <BranchesSection data={analytics([OLD, { ...RECENT, start: "2026-03-16" }])} title="Comparación entre sucursales" single={false} />
    );
    expect(html).not.toContain(CROSS_BRANCH_DETECTED);
    expect(html).not.toContain(CROSS_BRANCH_SCOPE);
  });

  it("vista de una sede (branch_admin o filtro): nota fija de alcance; solo planes de la sede, nada de la otra", () => {
    const html = renderToStaticMarkup(<BranchesSection data={analytics([OLD], [{ id: "B1", name: "Sede 1", active: true }])} title="Tu sucursal" single />);
    expect(html).toContain(CROSS_BRANCH_SCOPE);
    expect(html).not.toContain(CROSS_BRANCH_DETECTED);
    expect(html).not.toContain("Sede 2");
  });
});
