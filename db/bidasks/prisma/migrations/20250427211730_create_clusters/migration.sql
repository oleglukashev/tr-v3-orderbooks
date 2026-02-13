-- CreateTable
CREATE TABLE "clusters" (
    "id" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "trade_id" TEXT NOT NULL,
    "pair_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clusters_id_key" ON "clusters"("id");

-- CreateIndex
CREATE UNIQUE INDEX "clusters_trade_id_key" ON "clusters"("trade_id");

-- CreateIndex
CREATE INDEX "clusters_trade_id_idx" ON "clusters"("trade_id");

-- AddForeignKey
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
