"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-manual-deployment-checklist.tsx
//
// Checklist interactivo de los 11 pasos del deployment manual.
// El super_admin marca cada paso como en progreso / completado /
// fallido / saltado. Llama server actions para persistir estado.
// ─────────────────────────────────────────────────────────────────

import { useTransition } from "react";
import { updateManualStepStatusAction } from "../actions/update-manual-step-status.action";
import { PlatformDeploymentStepStatusBadge } from "./platform-deployment-step-status-badge";
import type {
  PlatformDeploymentStepItem,
  ManualStepStatusUpdate,
} from "../types/platform.types";

interface Props {
  steps:    PlatformDeploymentStepItem[];
  jobId:    string;
  jobDone:  boolean;
}

const STEP_DESCRIPTIONS: Record<string, string> = {
  REVIEW_BUNDLE:      "Revisar el Deployment Bundle exportado: organización, módulos, branding y configuración.",
  CREATE_DATABASE:    "Crear la base de datos PostgreSQL destino. Asignar usuario y permisos.",
  CONFIGURE_ENV_VARS: "Configurar todas las variables de entorno en el archivo .env o en el proveedor de hosting.",
  RUN_MIGRATIONS:     "Ejecutar npx prisma migrate deploy contra la base de datos destino.",
  RUN_SEEDS:          "Ejecutar los seeds requeridos según los módulos activos.",
  CONFIGURE_BRANDING: "Copiar assets de branding (logo, favicon) y configurar colores en el build.",
  VALIDATE_MODULES:   "Confirmar que todos los módulos activos están habilitados en la instancia.",
  RUN_BUILD:          "Ejecutar npm run build y verificar que no hay errores de compilación.",
  DEPLOY_INSTANCE:    "Subir el build a Vercel / VPS / servidor destino y verificar que arranca.",
  SMOKE_TEST:         "Ejecutar el smoke test completo desde el panel de abajo.",
  REGISTER_RESULT:    "Registrar el resultado final del deployment usando el botón de completar.",
};

const STATUS_ACTIONS: {
  status:    ManualStepStatusUpdate;
  label:     string;
  className: string;
}[] = [
  { status: "RUNNING", label: "Iniciar",  className: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
  { status: "SUCCESS", label: "Completar", className: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" },
  { status: "FAILED",  label: "Marcar fallido", className: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" },
  { status: "SKIPPED", label: "Saltado",  className: "bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100" },
];

function StepRow({
  step,
  jobId,
  jobDone,
}: {
  step:    PlatformDeploymentStepItem;
  jobId:   string;
  jobDone: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const desc = STEP_DESCRIPTIONS[step.step_key] ?? "";

  function handleAction(newStatus: ManualStepStatusUpdate) {
    startTransition(async () => {
      await updateManualStepStatusAction(step.id, jobId, newStatus);
    });
  }

  const isDone = step.status === "SUCCESS" || step.status === "FAILED" || step.status === "SKIPPED";

  return (
    <div
      className={`border rounded-xl p-4 transition-colors ${
        step.status === "SUCCESS" ? "border-green-200 bg-green-50/30" :
        step.status === "FAILED"  ? "border-red-200 bg-red-50/30" :
        step.status === "RUNNING" ? "border-blue-200 bg-blue-50/30" :
        step.status === "SKIPPED" ? "border-zinc-200 bg-zinc-50 opacity-60" :
        "border-zinc-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="w-6 h-6 shrink-0 bg-zinc-100 text-zinc-500 rounded-full flex items-center justify-center text-xs font-bold">
            {step.step_order}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-zinc-800">{step.step_name}</span>
              <PlatformDeploymentStepStatusBadge status={step.status} />
            </div>
            {desc && (
              <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
            )}
            {step.message && (
              <p className="text-xs text-zinc-400 mt-0.5 italic">{step.message}</p>
            )}
          </div>
        </div>

        {!jobDone && (
          <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
            {STATUS_ACTIONS.map((action) => {
              if (action.status === step.status) return null;
              if (isDone && action.status !== "RUNNING") return null;
              return (
                <button
                  key={action.status}
                  onClick={() => handleAction(action.status)}
                  disabled={isPending}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${action.className}`}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function PlatformManualDeploymentChecklist({ steps, jobId, jobDone }: Props) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-zinc-400 italic text-center py-4">
        Sin pasos registrados en este job.
      </p>
    );
  }

  const done    = steps.filter((s) => s.status === "SUCCESS").length;
  const failed  = steps.filter((s) => s.status === "FAILED").length;
  const skipped = steps.filter((s) => s.status === "SKIPPED").length;
  const total   = steps.length;

  return (
    <div className="space-y-3">

      {/* Resumen de progreso */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span className="text-green-600 font-semibold">{done} completados</span>
        {failed  > 0 && <span className="text-red-600 font-semibold">{failed} fallidos</span>}
        {skipped > 0 && <span className="text-zinc-400">{skipped} saltados</span>}
        <span className="text-zinc-400">/ {total} pasos</span>
        <div className="flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              failed > 0 ? "bg-red-400" : "bg-green-500"
            }`}
            style={{ width: `${Math.round(((done + skipped) / total) * 100)}%` }}
          />
        </div>
      </div>

      {/* Pasos */}
      {steps.map((step) => (
        <StepRow key={step.id} step={step} jobId={jobId} jobDone={jobDone} />
      ))}

    </div>
  );
}
