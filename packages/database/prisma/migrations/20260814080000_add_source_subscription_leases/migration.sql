ALTER TABLE "source_subscriptions"
ADD COLUMN "lease_owner" VARCHAR(160),
ADD COLUMN "lease_expires_at" TIMESTAMPTZ(3),
ADD COLUMN "last_claimed_at" TIMESTAMPTZ(3);

CREATE INDEX "source_subscriptions_status_next_sync_at_lease_expires_at_idx"
ON "source_subscriptions"("status", "next_sync_at", "lease_expires_at");
