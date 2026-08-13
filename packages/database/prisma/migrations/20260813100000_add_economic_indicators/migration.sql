CREATE TABLE "economic_indicators" (
  "id" UUID NOT NULL, "key" VARCHAR(80) NOT NULL, "name_vi" VARCHAR(160) NOT NULL,
  "name_en" VARCHAR(160) NOT NULL, "category" VARCHAR(60) NOT NULL, "unit" VARCHAR(40) NOT NULL,
  "frequency" VARCHAR(30) NOT NULL, "source_name" VARCHAR(160) NOT NULL, "source_url" TEXT,
  "symbol_name" VARCHAR(80) NOT NULL, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "economic_indicators_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "economic_indicator_observations" (
  "id" UUID NOT NULL, "indicator_id" UUID NOT NULL, "observed_at" TIMESTAMPTZ(3) NOT NULL,
  "value" DECIMAL(20,4) NOT NULL, "change_value" DECIMAL(20,4), "change_pct" DECIMAL(10,4),
  "metadata" JSONB NOT NULL DEFAULT '{}', "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "economic_indicator_observations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "economic_indicators_key_key" ON "economic_indicators"("key");
CREATE INDEX "economic_indicators_category_sort_order_idx" ON "economic_indicators"("category", "sort_order");
CREATE UNIQUE INDEX "economic_indicator_observations_indicator_id_observed_at_key" ON "economic_indicator_observations"("indicator_id", "observed_at");
CREATE INDEX "economic_indicator_observations_indicator_id_observed_at_idx" ON "economic_indicator_observations"("indicator_id", "observed_at" DESC);
ALTER TABLE "economic_indicator_observations" ADD CONSTRAINT "economic_indicator_observations_indicator_id_fkey" FOREIGN KEY ("indicator_id") REFERENCES "economic_indicators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
