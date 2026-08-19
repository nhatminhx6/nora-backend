CREATE TYPE "SourceCircuitState" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN', 'MANUAL_PAUSED');

ALTER TABLE "source_subscriptions"
ADD COLUMN "circuit_state" "SourceCircuitState" NOT NULL DEFAULT 'CLOSED',
ADD COLUMN "circuit_opened_at" TIMESTAMPTZ(3),
ADD COLUMN "next_probe_at" TIMESTAMPTZ(3),
ADD COLUMN "health_metrics" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "source_subscriptions_circuit_state_next_probe_at_idx"
ON "source_subscriptions"("circuit_state", "next_probe_at");
