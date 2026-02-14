-- CreateTable
CREATE TABLE "clusters" (
    "id" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "tf" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL DEFAULT '{}',
    "v" INTEGER NOT NULL DEFAULT 0,
    "pair_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clusters_id_key" ON "clusters"("id");

-- CreateIndex
CREATE INDEX "clusters_pair_id_idx" ON "clusters"("pair_id");

-- CreateIndex
CREATE UNIQUE INDEX "clusters_ts_tf_pair_id_key" ON "clusters"("ts", "tf", "pair_id");
