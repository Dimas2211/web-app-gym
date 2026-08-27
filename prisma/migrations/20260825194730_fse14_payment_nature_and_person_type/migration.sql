-- CreateEnum
CREATE TYPE "PurchasePaymentNature" AS ENUM ('GOODS', 'SERVICES', 'GOODS_AND_SERVICES', 'LUMP_SUM_CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplierPersonType" AS ENUM ('NATURAL_PERSON', 'LEGAL_ENTITY', 'UNKNOWN');

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "income_tax_withholding_base" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_nature" "PurchasePaymentNature";

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "person_type" "SupplierPersonType" NOT NULL DEFAULT 'UNKNOWN';
