CREATE TABLE "insight_localizations" (
    "id" UUID NOT NULL,
    "insight_id" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "relevance_reason" TEXT NOT NULL,
    "suggested_action" TEXT,
    "provider" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "insight_localizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "insight_localizations_insight_id_locale_key"
ON "insight_localizations"("insight_id", "locale");

CREATE INDEX "insight_localizations_locale_updated_at_idx"
ON "insight_localizations"("locale", "updated_at" DESC);

ALTER TABLE "insight_localizations"
ADD CONSTRAINT "insight_localizations_insight_id_fkey"
FOREIGN KEY ("insight_id") REFERENCES "insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;
