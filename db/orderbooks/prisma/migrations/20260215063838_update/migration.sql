/*
  Warnings:

  - You are about to drop the `clusters` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "clusters";

-- CreateTable
CREATE TABLE "orderbooks" (
    "id" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "tf" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL DEFAULT '{}',
    "v" INTEGER NOT NULL DEFAULT 0,
    "pair_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orderbooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orderbooks_id_key" ON "orderbooks"("id");

-- CreateIndex
CREATE INDEX "orderbooks_pair_id_idx" ON "orderbooks"("pair_id");

-- CreateIndex
CREATE UNIQUE INDEX "orderbooks_ts_tf_pair_id_key" ON "orderbooks"("ts", "tf", "pair_id");
