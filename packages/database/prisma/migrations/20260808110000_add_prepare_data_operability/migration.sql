CREATE TABLE "insight_localization_revisions" (
  "id" UUID NOT NULL,
  "insight_id" UUID NOT NULL,
  "locale" VARCHAR(2) NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "relevance_reason" TEXT NOT NULL,
  "suggested_action" TEXT,
  "provider" VARCHAR(64) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "prompt_version" VARCHAR(32) NOT NULL,
  "source_content_hash" VARCHAR(64) NOT NULL,
  "validation_status" VARCHAR(32) NOT NULL,
  "quality_score" DECIMAL(5,4) NOT NULL,
  "failure_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "correction_reason" VARCHAR(120),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "insight_localization_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "insight_localization_revisions_identity_key" ON "insight_localization_revisions"("insight_id", "locale", "source_content_hash", "prompt_version");
CREATE INDEX "insight_localization_revisions_quality_idx" ON "insight_localization_revisions"("locale", "validation_status", "created_at" DESC);
ALTER TABLE "insight_localization_revisions" ADD CONSTRAINT "insight_localization_revisions_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pipeline_runs" (
  "id" UUID NOT NULL,
  "pipeline" VARCHAR(40) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "source_id" UUID,
  "insight_id" UUID,
  "locale" VARCHAR(16),
  "processed_count" INTEGER NOT NULL DEFAULT 0,
  "rejected_count" INTEGER NOT NULL DEFAULT 0,
  "error_code" VARCHAR(80),
  "duration_ms" INTEGER,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pipeline_runs_pipeline_status_started_at_idx" ON "pipeline_runs"("pipeline", "status", "started_at" DESC);
CREATE INDEX "pipeline_runs_error_code_started_at_idx" ON "pipeline_runs"("error_code", "started_at" DESC);
