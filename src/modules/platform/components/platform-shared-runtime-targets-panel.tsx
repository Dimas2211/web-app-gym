"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-shared-runtime-targets-panel.tsx
//
// SHARED-PILOT-4C-B0. Sección "Shared Runtime Targets" dentro de
// /dashboard/platform/database-profiles. Independiente de los perfiles
// Dedicated (PlatformDatabaseProfilesClient) — modelos distintos.
//
// Reglas de seguridad:
// - Recibe solo PlatformSharedRuntimeTargetItem (sin encrypted_password).
// - El feedback de test usa solo el mensaje sanitizado de la action.
// - No se escribe ningún secret en la consola del browser.
// - No asigna organizaciones.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition, useEffect } from "react";
import { Plus, Share2 } from "lucide-react";

import { PlatformSharedRuntimeTargetsTable }     from "./platform-shared-runtime-targets-table";
import { PlatformSharedRuntimeTargetFormDialog } from "./platform-shared-runtime-target-form-dialog";
import { setSharedRuntimeTargetActiveAction }    from "../actions/set-shared-runtime-target-active.action";
import { testSharedRuntimeTargetConnectionAction } from "../actions/test-shared-runtime-target-connection.action";
import type { PlatformSharedRuntimeTargetItem } from "../queries/list-shared-runtime-targets";

interface Feedback {
  type:    "success" | "error";
  message: string;
}

export interface PlatformSharedRuntimeTargetsPanelProps {
  targets:              PlatformSharedRuntimeTargetItem[];
  encryptionKeyMissing: boolean;
}

export function PlatformSharedRuntimeTargetsPanel({
  targets,
  encryptionKeyMissing,
}: PlatformSharedRuntimeTargetsPanelProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [testingId,  setTestingId]  = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [feedback,   setFeedback]   = useState<Feedback | null>(null);

  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(t);
  }, [feedback]);

  function handleToggleActive(t: PlatformSharedRuntimeTargetItem) {
    // Desactivar hace fail closed para todas las organizaciones asignadas
    if (
      t.is_active &&
      t.organizationCount > 0 &&
      !window.confirm(
        `"${t.label}" tiene ${t.organizationCount} organización(es) asignada(s). ` +
        "Al desactivarlo, su runtime dejará de resolverse. ¿Continuar?",
      )
    ) {
      return;
    }

    setTogglingId(t.id);
    startTransition(async () => {
      const result = await setSharedRuntimeTargetActiveAction(t.id, !t.is_active);
      setTogglingId(null);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({
          type:    "success",
          message: `Shared Runtime "${t.label}" ${!t.is_active ? "activado" : "desactivado"} correctamente.`,
        });
      }
    });
  }

  function handleTestConnection(t: PlatformSharedRuntimeTargetItem) {
    setTestingId(t.id);
    startTransition(async () => {
      // Mensaje ya sanitizado por la action (sanitizeDatabaseError)
      const result = await testSharedRuntimeTargetConnectionAction(t.id);
      setTestingId(null);
      setFeedback({
        type:    result.success ? "success" : "error",
        message: result.message,
      });
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-violet-500" />
            <h2 className="text-base font-bold text-zinc-800">Shared Runtime Targets</h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide
                             bg-violet-100 text-violet-700">
              SHARED
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">
            Bases físicas reutilizables por múltiples organizaciones · {targets.length} target
            {targets.length !== 1 ? "s" : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowDialog(true)}
          disabled={encryptionKeyMissing}
          className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg
                     text-sm font-semibold hover:bg-zinc-800 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          title={encryptionKeyMissing ? "PLATFORM_ENCRYPTION_KEY no configurada" : undefined}
        >
          <Plus size={15} />
          Nuevo Shared Runtime
        </button>
      </div>

      {feedback && (
        <div className={`px-4 py-3 rounded-xl border text-sm ${
          feedback.type === "success"
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {feedback.message}
        </div>
      )}

      <div className="bg-white rounded-xl border border-violet-200 shadow-sm overflow-hidden">
        <PlatformSharedRuntimeTargetsTable
          items={targets}
          testingId={testingId}
          togglingId={togglingId}
          onToggleActive={handleToggleActive}
          onTest={handleTestConnection}
        />
      </div>

      {showDialog && (
        <PlatformSharedRuntimeTargetFormDialog onClose={() => setShowDialog(false)} />
      )}
    </section>
  );
}
