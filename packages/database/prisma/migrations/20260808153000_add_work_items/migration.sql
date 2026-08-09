CREATE TYPE "WorkItemStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TYPE "WorkItemPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "WorkItemSource" AS ENUM ('MANUAL', 'EXTRACTED', 'CONNECTOR');

CREATE TABLE "work_items" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "notes" TEXT,
  "status" "WorkItemStatus" NOT NULL DEFAULT 'TODO',
  "priority" "WorkItemPriority" NOT NULL DEFAULT 'MEDIUM',
  "due_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "source" "WorkItemSource" NOT NULL DEFAULT 'MANUAL',
  "source_ref" VARCHAR(255),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_items_user_id_source_source_ref_key"
  ON "work_items"("user_id", "source", "source_ref");
CREATE INDEX "work_items_user_id_status_due_at_idx"
  ON "work_items"("user_id", "status", "due_at");
CREATE INDEX "work_items_user_id_created_at_idx"
  ON "work_items"("user_id", "created_at" DESC);
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
