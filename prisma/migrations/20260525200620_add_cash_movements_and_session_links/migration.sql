-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('MANUAL_IN', 'MANUAL_OUT', 'CASH_WITHDRAWAL', 'PETTY_EXPENSE', 'ADJUSTMENT_UP', 'ADJUSTMENT_DOWN', 'REFUND_OUT');

-- CreateEnum
CREATE TYPE "CashMovementDirection" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "sale_payments" ADD COLUMN     "cash_session_id" TEXT;

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "cash_session_id" TEXT NOT NULL,
    "cash_register_id" TEXT NOT NULL,
    "movement_type" "CashMovementType" NOT NULL,
    "direction" "CashMovementDirection" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "performed_by" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_movements_tenant_id_location_id_cash_session_id_idx" ON "cash_movements"("tenant_id", "location_id", "cash_session_id");

-- CreateIndex
CREATE INDEX "cash_movements_tenant_id_location_id_performed_at_idx" ON "cash_movements"("tenant_id", "location_id", "performed_at");

-- CreateIndex
CREATE INDEX "cash_movements_cash_register_id_idx" ON "cash_movements"("cash_register_id");

-- CreateIndex
CREATE INDEX "cash_movements_performed_by_idx" ON "cash_movements"("performed_by");

-- CreateIndex
CREATE INDEX "cash_movements_movement_type_idx" ON "cash_movements"("movement_type");

-- CreateIndex
CREATE INDEX "sale_payments_mh_payment_form_code_idx" ON "sale_payments"("mh_payment_form_code");

-- CreateIndex
CREATE INDEX "sale_payments_cash_session_id_idx" ON "sale_payments"("cash_session_id");

-- CreateIndex
CREATE INDEX "sales_tenant_id_location_id_cash_session_id_idx" ON "sales"("tenant_id", "location_id", "cash_session_id");

-- CreateIndex
CREATE INDEX "sales_cash_session_id_idx" ON "sales"("cash_session_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
