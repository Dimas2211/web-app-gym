// DTE-MH-TEST-RUNS — clave idempotente de un ítem de corrida en el runtime
// (DteOutgoingDocument.certification_item_key, UNIQUE). Módulo sin
// dependencias para que el motor del Control Plane la use sin cargar Prisma.
export function mhTestItemKey(runId: string, seq: number): string {
  return `${runId}:${seq}`;
}
