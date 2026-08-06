ALTER TABLE "insight_localizations"
ADD COLUMN "model" VARCHAR(120),
ADD COLUMN "prompt_version" VARCHAR(32),
ADD COLUMN "source_content_hash" VARCHAR(64),
ADD COLUMN "validation_status" VARCHAR(32),
ADD COLUMN "quality_score" DECIMAL(5,4),
ADD COLUMN "generated_at" TIMESTAMPTZ(3),
ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "insight_localizations_source_content_hash_locale_prompt_version_idx"
ON "insight_localizations"("source_content_hash", "locale", "prompt_version");
