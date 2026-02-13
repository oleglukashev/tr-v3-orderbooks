/*
  Warnings:

  - A unique constraint covering the columns `[ts,tf,pair_id]` on the table `clusters` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "clusters_ts_tf_pair_id_key" ON "clusters"("ts", "tf", "pair_id");
