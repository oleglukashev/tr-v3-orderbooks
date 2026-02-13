-- AlterTable
ALTER TABLE "clusters" ADD COLUMN     "v" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "fpp" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'interception';
