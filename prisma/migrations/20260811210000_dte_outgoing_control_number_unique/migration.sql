-- F3-C24 — Guardián final en base de datos contra numeroControl duplicado.
--
-- La reserva de correlativo (reserveDteControlNumber) ya evita duplicados
-- a nivel de aplicación mediante el lock de fila de dte_correlatives, pero
-- no existía ningún constraint en la base que impidiera, ante un bug futuro
-- o un INSERT manual, que dos DteOutgoingDocument del mismo tenant
-- terminaran con el mismo control_number. Este unique lo cierra a nivel
-- de esquema. NULLs (documentos sin numeroControl aún) no colisionan entre
-- sí en Postgres, así que no afecta documentos en PENDING_GENERATION antes
-- de tener control_number asignado.

CREATE UNIQUE INDEX "dte_outgoing_documents_tenant_id_control_number_key"
  ON "dte_outgoing_documents"("tenant_id", "control_number");
