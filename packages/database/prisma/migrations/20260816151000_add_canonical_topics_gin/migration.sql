CREATE INDEX "canonical_contents_topics_gin_idx"
ON "canonical_contents" USING GIN ("topics");
