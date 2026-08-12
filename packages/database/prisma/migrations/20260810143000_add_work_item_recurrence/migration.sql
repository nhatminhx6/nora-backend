CREATE TYPE "WorkItemRecurrenceType" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'LUNAR_MONTHLY');

ALTER TABLE "work_items"
ADD COLUMN "recurrence_type" "WorkItemRecurrenceType" NOT NULL DEFAULT 'NONE',
ADD COLUMN "recurrence_interval" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "recurrence_weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "recurrence_lunar_days" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "recurrence_timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
ADD COLUMN "recurrence_until" TIMESTAMPTZ(3),
ADD COLUMN "recurrence_series_id" UUID,
ADD COLUMN "recurrence_sequence" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "work_items_recurrence_series_id_recurrence_sequence_key"
ON "work_items"("recurrence_series_id", "recurrence_sequence");
