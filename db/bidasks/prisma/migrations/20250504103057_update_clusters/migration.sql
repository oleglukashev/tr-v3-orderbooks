/*
  Warnings:

  - You are about to drop the column `trade_id` on the `clusters` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "clusters" DROP CONSTRAINT "clusters_trade_id_fkey";

-- DropIndex
DROP INDEX "clusters_trade_id_idx";

-- DropIndex
DROP INDEX "clusters_trade_id_key";

-- AlterTable
ALTER TABLE "clusters" DROP COLUMN "trade_id",
ADD COLUMN     "tf" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "clusters_pair_id_idx" ON "clusters"("pair_id");
