ALTER TABLE "interests" ADD COLUMN "topic_key" VARCHAR(80);
CREATE UNIQUE INDEX "interests_user_id_topic_key_key" ON "interests"("user_id", "topic_key");
