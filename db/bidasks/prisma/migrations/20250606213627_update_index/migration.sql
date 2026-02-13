/*
  Warnings:

  - A unique constraint covering the columns `[ts,tf,pair_id,type]` on the table `fpp` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "fpp_ts_tf_pair_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "fpp_ts_tf_pair_id_type_key" ON "fpp"("ts", "tf", "pair_id", "type");
