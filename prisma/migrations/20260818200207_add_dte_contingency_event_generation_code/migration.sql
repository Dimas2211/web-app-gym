-- AlterTable
-- dte_contingency_events estaba vacía en el momento de esta migración
-- (Bloque A solo agregó persistencia, ningún Evento fue creado todavía),
-- por lo que agregar la columna NOT NULL UNIQUE directamente es seguro.
ALTER TABLE "dte_contingency_events" ADD COLUMN "generation_code" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "dte_contingency_events_generation_code_key" ON "dte_contingency_events"("generation_code");
