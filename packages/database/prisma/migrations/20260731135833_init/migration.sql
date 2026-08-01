-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "InterestStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('COMPANY', 'STOCK', 'CRYPTO', 'SPORTS_TEAM', 'MOVIE', 'PERSON', 'TECHNOLOGY', 'PRODUCT', 'JOB', 'TOPIC', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('PUBLIC_API', 'RSS', 'WEB_SCRAPING', 'OAUTH_CONNECTOR');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'PROCESSED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('SUMMARY', 'CLASSIFICATION', 'ALERT', 'TREND');

-- CreateEnum
CREATE TYPE "UserInsightStatus" AS ENUM ('UNREAD', 'READ', 'DISMISSED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DailyBriefStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "WatchRuleType" AS ENUM ('KEYWORD', 'PRICE_ABOVE', 'PRICE_BELOW', 'PERCENT_CHANGE', 'EVENT_MATCH');

-- CreateEnum
CREATE TYPE "WatchRuleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255),
    "display_name" VARCHAR(120) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "locale" VARCHAR(16) NOT NULL DEFAULT 'en',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "notification_prefs" JSONB NOT NULL DEFAULT '{}',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "device_identifier" VARCHAR(191) NOT NULL,
    "push_token" VARCHAR(512),
    "push_token_hash" VARCHAR(64),
    "app_version" VARCHAR(32),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID,
    "family_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoke_reason" VARCHAR(64),
    "replaced_by_token_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "normalized_name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "type" "EntityType" NOT NULL,
    "status" "InterestStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "type" "EntityType" NOT NULL,
    "canonical_name" VARCHAR(200) NOT NULL,
    "normalized_name" VARCHAR(200) NOT NULL,
    "canonical_key" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "canonical_url" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interest_entities" (
    "interest_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interest_entities_pkey" PRIMARY KEY ("interest_id","entity_id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "adapter_key" VARCHAR(120) NOT NULL,
    "base_url" TEXT,
    "status" "SourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentials_ref" VARCHAR(255),
    "default_interval_sec" INTEGER NOT NULL,
    "rate_limit_per_minute" INTEGER,
    "last_synced_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_subscriptions" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "entity_id" UUID,
    "subscription_key" VARCHAR(255) NOT NULL,
    "external_reference" VARCHAR(255),
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "cursor" TEXT,
    "next_sync_at" TIMESTAMPTZ(3) NOT NULL,
    "last_sync_at" TIMESTAMPTZ(3),
    "last_success_at" TIMESTAMPTZ(3),
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "source_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "source_subscription_id" UUID,
    "external_id" VARCHAR(512) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT,
    "author" VARCHAR(255),
    "language" VARCHAR(16),
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3),
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ingested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_entities" (
    "event_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "relevance_score" DECIMAL(5,4) NOT NULL,
    "mention_count" INTEGER NOT NULL DEFAULT 1,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_entities_pkey" PRIMARY KEY ("event_id","entity_id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" UUID NOT NULL,
    "type" "InsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" VARCHAR(16),
    "importance_score" DECIMAL(5,4) NOT NULL,
    "confidence_score" DECIMAL(5,4),
    "model_provider" VARCHAR(64),
    "model_name" VARCHAR(120),
    "prompt_version" VARCHAR(32),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insight_events" (
    "insight_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_events_pkey" PRIMARY KEY ("insight_id","event_id")
);

-- CreateTable
CREATE TABLE "insight_entities" (
    "insight_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "relevance_score" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_entities_pkey" PRIMARY KEY ("insight_id","entity_id")
);

-- CreateTable
CREATE TABLE "user_insights" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "insight_id" UUID NOT NULL,
    "interest_id" UUID,
    "status" "UserInsightStatus" NOT NULL DEFAULT 'UNREAD',
    "relevance_score" DECIMAL(5,4) NOT NULL,
    "matched_reason" JSONB NOT NULL DEFAULT '{}',
    "seen_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "interest_id" UUID,
    "entity_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "type" "WatchRuleType" NOT NULL,
    "status" "WatchRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "conditions" JSONB NOT NULL,
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 3600,
    "last_triggered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "watch_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_insight_id" UUID,
    "watch_rule_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "action_url" TEXT,
    "deduplication_key" VARCHAR(255) NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "provider_message_id" VARCHAR(255),
    "last_error_code" VARCHAR(64),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_briefs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "brief_date" DATE NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "status" "DailyBriefStatus" NOT NULL DEFAULT 'PENDING',
    "title" VARCHAR(255) NOT NULL,
    "summary" TEXT,
    "generated_at" TIMESTAMPTZ(3),
    "failure_code" VARCHAR(64),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_brief_items" (
    "id" UUID NOT NULL,
    "daily_brief_id" UUID NOT NULL,
    "user_insight_id" UUID,
    "position" INTEGER NOT NULL,
    "section" VARCHAR(80) NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "action_url" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_brief_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_created_at_idx" ON "users"("status", "created_at");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "devices_push_token_hash_key" ON "devices"("push_token_hash");

-- CreateIndex
CREATE INDEX "devices_user_id_is_active_idx" ON "devices"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "devices_user_id_device_identifier_key" ON "devices"("user_id", "device_identifier");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_token_id_key" ON "refresh_tokens"("replaced_by_token_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_family_id_idx" ON "refresh_tokens"("user_id", "family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_device_id_revoked_at_idx" ON "refresh_tokens"("device_id", "revoked_at");

-- CreateIndex
CREATE INDEX "interests_user_id_status_idx" ON "interests"("user_id", "status");

-- CreateIndex
CREATE INDEX "interests_type_status_idx" ON "interests"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "interests_user_id_normalized_name_key" ON "interests"("user_id", "normalized_name");

-- CreateIndex
CREATE INDEX "entities_type_normalized_name_idx" ON "entities"("type", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "entities_type_canonical_key_key" ON "entities"("type", "canonical_key");

-- CreateIndex
CREATE INDEX "interest_entities_entity_id_interest_id_idx" ON "interest_entities"("entity_id", "interest_id");

-- CreateIndex
CREATE UNIQUE INDEX "sources_slug_key" ON "sources"("slug");

-- CreateIndex
CREATE INDEX "sources_status_kind_idx" ON "sources"("status", "kind");

-- CreateIndex
CREATE INDEX "sources_adapter_key_idx" ON "sources"("adapter_key");

-- CreateIndex
CREATE INDEX "source_subscriptions_status_next_sync_at_idx" ON "source_subscriptions"("status", "next_sync_at");

-- CreateIndex
CREATE INDEX "source_subscriptions_entity_id_status_idx" ON "source_subscriptions"("entity_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "source_subscriptions_source_id_subscription_key_key" ON "source_subscriptions"("source_id", "subscription_key");

-- CreateIndex
CREATE INDEX "events_content_hash_idx" ON "events"("content_hash");

-- CreateIndex
CREATE INDEX "events_status_ingested_at_idx" ON "events"("status", "ingested_at");

-- CreateIndex
CREATE INDEX "events_published_at_idx" ON "events"("published_at" DESC);

-- CreateIndex
CREATE INDEX "events_source_subscription_id_published_at_idx" ON "events"("source_subscription_id", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "events_source_id_external_id_key" ON "events"("source_id", "external_id");

-- CreateIndex
CREATE INDEX "event_entities_entity_id_event_id_idx" ON "event_entities"("entity_id", "event_id");

-- CreateIndex
CREATE INDEX "insights_type_generated_at_idx" ON "insights"("type", "generated_at" DESC);

-- CreateIndex
CREATE INDEX "insight_events_event_id_insight_id_idx" ON "insight_events"("event_id", "insight_id");

-- CreateIndex
CREATE INDEX "insight_entities_entity_id_insight_id_idx" ON "insight_entities"("entity_id", "insight_id");

-- CreateIndex
CREATE INDEX "user_insights_user_id_status_created_at_idx" ON "user_insights"("user_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_insights_interest_id_created_at_idx" ON "user_insights"("interest_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "user_insights_user_id_insight_id_interest_id_key" ON "user_insights"("user_id", "insight_id", "interest_id");

-- CreateIndex
CREATE INDEX "watch_rules_user_id_status_idx" ON "watch_rules"("user_id", "status");

-- CreateIndex
CREATE INDEX "watch_rules_interest_id_status_idx" ON "watch_rules"("interest_id", "status");

-- CreateIndex
CREATE INDEX "watch_rules_entity_id_status_idx" ON "watch_rules"("entity_id", "status");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_at_idx" ON "notifications"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_channel_deduplication_key_key" ON "notifications"("user_id", "channel", "deduplication_key");

-- CreateIndex
CREATE INDEX "daily_briefs_user_id_brief_date_idx" ON "daily_briefs"("user_id", "brief_date" DESC);

-- CreateIndex
CREATE INDEX "daily_briefs_status_brief_date_idx" ON "daily_briefs"("status", "brief_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_briefs_user_id_brief_date_key" ON "daily_briefs"("user_id", "brief_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_brief_items_daily_brief_id_position_key" ON "daily_brief_items"("daily_brief_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "daily_brief_items_daily_brief_id_user_insight_id_key" ON "daily_brief_items"("daily_brief_id", "user_insight_id");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_token_id_fkey" FOREIGN KEY ("replaced_by_token_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interests" ADD CONSTRAINT "interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_entities" ADD CONSTRAINT "interest_entities_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "interests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_entities" ADD CONSTRAINT "interest_entities_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_subscriptions" ADD CONSTRAINT "source_subscriptions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_subscriptions" ADD CONSTRAINT "source_subscriptions_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_source_subscription_id_fkey" FOREIGN KEY ("source_subscription_id") REFERENCES "source_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_entities" ADD CONSTRAINT "event_entities_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_entities" ADD CONSTRAINT "event_entities_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_events" ADD CONSTRAINT "insight_events_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_events" ADD CONSTRAINT "insight_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_entities" ADD CONSTRAINT "insight_entities_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_entities" ADD CONSTRAINT "insight_entities_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_insights" ADD CONSTRAINT "user_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_insights" ADD CONSTRAINT "user_insights_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_insights" ADD CONSTRAINT "user_insights_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "interests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_rules" ADD CONSTRAINT "watch_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_rules" ADD CONSTRAINT "watch_rules_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "interests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_rules" ADD CONSTRAINT "watch_rules_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_insight_id_fkey" FOREIGN KEY ("user_insight_id") REFERENCES "user_insights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_watch_rule_id_fkey" FOREIGN KEY ("watch_rule_id") REFERENCES "watch_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_briefs" ADD CONSTRAINT "daily_briefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_brief_items" ADD CONSTRAINT "daily_brief_items_daily_brief_id_fkey" FOREIGN KEY ("daily_brief_id") REFERENCES "daily_briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_brief_items" ADD CONSTRAINT "daily_brief_items_user_insight_id_fkey" FOREIGN KEY ("user_insight_id") REFERENCES "user_insights"("id") ON DELETE SET NULL ON UPDATE CASCADE;
