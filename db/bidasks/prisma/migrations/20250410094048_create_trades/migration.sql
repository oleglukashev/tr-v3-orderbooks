-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "side" VARCHAR(10) NOT NULL,
    "price" VARCHAR(50) NOT NULL,
    "amount" VARCHAR(50) NOT NULL,
    "cost" VARCHAR(50) NOT NULL,
    "pair_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trades_id_key" ON "trades"("id");
