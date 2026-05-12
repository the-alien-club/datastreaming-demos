-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "is_forkable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "specialists" ADD COLUMN     "is_forkable" BOOLEAN NOT NULL DEFAULT false;
