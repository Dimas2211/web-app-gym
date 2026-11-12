export interface DteContinuationRequest {
  dteId: string;
  origin: "sale" | "purchase";
  originId: string;
}
export type DteContinuationOperation =
  | "generate"
  | "sign"
  | "transmit"
  | "deliver"
  | "reopen"
  | "reconcile";
export interface DteContinuationState {
  id: string;
  type: string;
  environment: string;
  status: string;
  originStatus: string;
  controlNumber: string | null;
  generationCode: string | null;
  hasJson: boolean;
  hasSignature: boolean;
  hasStamp: boolean;
  delivered: boolean;
  canReopen: boolean;
  lastError: string | null;
}
export type DteContinuationResult =
  | { ok: true; state: DteContinuationState }
  | { ok: false; error: string };
