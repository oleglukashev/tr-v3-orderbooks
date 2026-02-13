-- CreateTable
CREATE TABLE "fpp" (
    "id" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "tf" INTEGER NOT NULL DEFAULT 1,
    "direction" TEXT NOT NULL DEFAULT 'up',
    "pair_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fpp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fpp_id_key" ON "fpp"("id");

-- CreateIndex
CREATE INDEX "fpp_pair_id_idx" ON "fpp"("pair_id");

-- CreateIndex
CREATE UNIQUE INDEX "fpp_ts_tf_pair_id_key" ON "fpp"("ts", "tf", "pair_id");
