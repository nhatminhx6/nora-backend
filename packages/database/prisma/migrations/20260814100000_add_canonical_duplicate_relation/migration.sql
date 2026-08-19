ALTER TABLE "canonical_contents"
ADD COLUMN "duplicate_of_id" UUID,
ADD COLUMN "duplicate_kind" VARCHAR(40),
ADD COLUMN "duplicate_score" DECIMAL(5,4);

CREATE INDEX "canonical_contents_duplicate_of_id_idx" ON "canonical_contents"("duplicate_of_id");

ALTER TABLE "canonical_contents"
ADD CONSTRAINT "canonical_contents_duplicate_of_id_fkey"
FOREIGN KEY ("duplicate_of_id") REFERENCES "canonical_contents"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "canonical_contents"
ADD CONSTRAINT "canonical_contents_not_self_duplicate_check"
CHECK ("duplicate_of_id" IS NULL OR "duplicate_of_id" <> "id");

ALTER TABLE "canonical_contents"
ADD CONSTRAINT "canonical_contents_duplicate_score_check"
CHECK ("duplicate_score" IS NULL OR ("duplicate_score" >= 0 AND "duplicate_score" <= 1));
