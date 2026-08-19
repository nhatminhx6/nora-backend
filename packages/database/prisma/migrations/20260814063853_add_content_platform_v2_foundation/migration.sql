-- CreateEnum
CREATE TYPE "ContentRetentionPolicy" AS ENUM ('FULL_TEXT', 'EXCERPT_ONLY', 'METADATA_ONLY');

-- CreateEnum
CREATE TYPE "CanonicalContentStatus" AS ENUM ('PENDING', 'READY', 'REJECTED', 'RETRACTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContentProvenanceStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ContentLocalizationStatus" AS ENUM ('PENDING', 'GENERATING', 'VERIFIED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContentClusterStatus" AS ENUM ('ACTIVE', 'REBUILDING', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentAudienceMatchStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'EXPIRED');

-- CreateTable
CREATE TABLE "raw_source_payloads" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "subscription_id" UUID,
    "external_id" VARCHAR(512),
    "request_url" TEXT NOT NULL,
    "final_url" TEXT,
    "http_status" INTEGER,
    "content_type" VARCHAR(255),
    "payload" BYTEA,
    "payload_ref" TEXT,
    "payload_hash" VARCHAR(64) NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "retention_policy" "ContentRetentionPolicy" NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_source_payloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_contents" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "raw_payload_id" UUID,
    "canonical_url" TEXT,
    "external_id" VARCHAR(512) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "original_title" TEXT NOT NULL,
    "original_content" TEXT,
    "original_excerpt" TEXT,
    "source_language" VARCHAR(16) NOT NULL,
    "publisher" VARCHAR(255) NOT NULL,
    "author" VARCHAR(255),
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at_from_source" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "status" "CanonicalContentStatus" NOT NULL DEFAULT 'PENDING',
    "provenance_status" "ContentProvenanceStatus" NOT NULL DEFAULT 'PENDING',
    "markets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_tier" INTEGER NOT NULL,
    "authority_score" DECIMAL(5,4) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "canonical_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_revisions" (
    "id" UUID NOT NULL,
    "canonical_content_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "canonical_url" TEXT,
    "original_title" TEXT NOT NULL,
    "original_content" TEXT,
    "original_excerpt" TEXT,
    "source_language" VARCHAR(16) NOT NULL,
    "publisher" VARCHAR(255) NOT NULL,
    "author" VARCHAR(255),
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at_from_source" TIMESTAMPTZ(3),
    "provenance_status" "ContentProvenanceStatus" NOT NULL,
    "change_reason" VARCHAR(120) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_claims" (
    "id" UUID NOT NULL,
    "canonical_content_id" UUID NOT NULL,
    "claim_hash" VARCHAR(64) NOT NULL,
    "claim_type" VARCHAR(64) NOT NULL,
    "text" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "entities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "numbers" JSONB NOT NULL DEFAULT '[]',
    "dates" TIMESTAMPTZ(3)[] DEFAULT ARRAY[]::TIMESTAMPTZ(3)[],
    "certainty" VARCHAR(32),
    "attribution" TEXT,
    "extraction_version" VARCHAR(64) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_localizations" (
    "id" UUID NOT NULL,
    "canonical_content_id" UUID NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "source_content_hash" VARCHAR(64) NOT NULL,
    "policy_version" VARCHAR(64) NOT NULL,
    "glossary_version" VARCHAR(64) NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "claims" JSONB NOT NULL DEFAULT '[]',
    "status" "ContentLocalizationStatus" NOT NULL DEFAULT 'PENDING',
    "quality_score" DECIMAL(5,4),
    "failure_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" VARCHAR(64),
    "model" VARCHAR(120),
    "generated_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "content_localizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_localization_revisions" (
    "id" UUID NOT NULL,
    "content_localization_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "claims" JSONB NOT NULL DEFAULT '[]',
    "status" "ContentLocalizationStatus" NOT NULL,
    "quality_score" DECIMAL(5,4),
    "failure_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "provider" VARCHAR(64),
    "model" VARCHAR(120),
    "correction_reason" VARCHAR(120),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_localization_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_clusters" (
    "id" UUID NOT NULL,
    "cluster_key" VARCHAR(255) NOT NULL,
    "primary_canonical_content_id" UUID,
    "policy_version" VARCHAR(64) NOT NULL,
    "status" "ContentClusterStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT,
    "primary_entities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "protected_values" JSONB NOT NULL DEFAULT '[]',
    "event_started_at" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "content_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_cluster_members" (
    "id" UUID NOT NULL,
    "cluster_id" UUID NOT NULL,
    "canonical_content_id" UUID NOT NULL,
    "similarity_score" DECIMAL(5,4),
    "membership_reason" JSONB NOT NULL DEFAULT '{}',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_cluster_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminology_entries" (
    "id" UUID NOT NULL,
    "source_language" VARCHAR(16) NOT NULL,
    "target_locale" VARCHAR(16) NOT NULL,
    "source_term" VARCHAR(255) NOT NULL,
    "normalized_source_term" VARCHAR(255) NOT NULL,
    "preferred_term" VARCHAR(255) NOT NULL,
    "short_term" VARCHAR(120),
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "domain" VARCHAR(80) NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "terminology_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_audience_matches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "canonical_content_id" UUID NOT NULL,
    "cluster_id" UUID,
    "locale" VARCHAR(16) NOT NULL,
    "policy_version" VARCHAR(64) NOT NULL,
    "relevance_score" DECIMAL(7,4) NOT NULL,
    "ranking_score" DECIMAL(7,4),
    "matched_reason" JSONB NOT NULL DEFAULT '{}',
    "status" "ContentAudienceMatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "content_audience_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raw_source_payloads_subscription_id_fetched_at_idx" ON "raw_source_payloads"("subscription_id", "fetched_at" DESC);

-- CreateIndex
CREATE INDEX "raw_source_payloads_expires_at_idx" ON "raw_source_payloads"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "raw_source_payloads_source_id_payload_hash_key" ON "raw_source_payloads"("source_id", "payload_hash");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_contents_canonical_url_key" ON "canonical_contents"("canonical_url");

-- CreateIndex
CREATE INDEX "canonical_contents_content_hash_idx" ON "canonical_contents"("content_hash");

-- CreateIndex
CREATE INDEX "canonical_contents_status_published_at_idx" ON "canonical_contents"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "canonical_contents_provenance_status_verified_at_idx" ON "canonical_contents"("provenance_status", "verified_at" DESC);

-- CreateIndex
CREATE INDEX "canonical_contents_raw_payload_id_idx" ON "canonical_contents"("raw_payload_id");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_contents_source_id_external_id_key" ON "canonical_contents"("source_id", "external_id");

-- CreateIndex
CREATE INDEX "content_revisions_canonical_content_id_content_hash_idx" ON "content_revisions"("canonical_content_id", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "content_revisions_canonical_content_id_revision_number_key" ON "content_revisions"("canonical_content_id", "revision_number");

-- CreateIndex
CREATE INDEX "content_claims_claim_type_created_at_idx" ON "content_claims"("claim_type", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "content_claims_canonical_content_id_claim_hash_extraction_v_key" ON "content_claims"("canonical_content_id", "claim_hash", "extraction_version");

-- CreateIndex
CREATE INDEX "content_localizations_locale_status_verified_at_idx" ON "content_localizations"("locale", "status", "verified_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "content_localizations_canonical_content_id_locale_source_co_key" ON "content_localizations"("canonical_content_id", "locale", "source_content_hash", "policy_version", "glossary_version");

-- CreateIndex
CREATE INDEX "content_localization_revisions_status_created_at_idx" ON "content_localization_revisions"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "content_localization_revisions_content_localization_id_atte_key" ON "content_localization_revisions"("content_localization_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "content_clusters_cluster_key_key" ON "content_clusters"("cluster_key");

-- CreateIndex
CREATE INDEX "content_clusters_status_event_started_at_idx" ON "content_clusters"("status", "event_started_at" DESC);

-- CreateIndex
CREATE INDEX "content_clusters_primary_canonical_content_id_idx" ON "content_clusters"("primary_canonical_content_id");

-- CreateIndex
CREATE INDEX "content_cluster_members_canonical_content_id_idx" ON "content_cluster_members"("canonical_content_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_cluster_members_cluster_id_canonical_content_id_key" ON "content_cluster_members"("cluster_id", "canonical_content_id");

-- CreateIndex
CREATE INDEX "terminology_entries_target_locale_domain_version_idx" ON "terminology_entries"("target_locale", "domain", "version");

-- CreateIndex
CREATE UNIQUE INDEX "terminology_entries_source_language_target_locale_normalize_key" ON "terminology_entries"("source_language", "target_locale", "normalized_source_term", "domain", "version");

-- CreateIndex
CREATE INDEX "content_audience_matches_user_id_status_ranking_score_creat_idx" ON "content_audience_matches"("user_id", "status", "ranking_score" DESC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "content_audience_matches_cluster_id_idx" ON "content_audience_matches"("cluster_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_audience_matches_user_id_canonical_content_id_local_key" ON "content_audience_matches"("user_id", "canonical_content_id", "locale", "policy_version");

-- AddForeignKey
ALTER TABLE "raw_source_payloads" ADD CONSTRAINT "raw_source_payloads_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_source_payloads" ADD CONSTRAINT "raw_source_payloads_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "source_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_contents" ADD CONSTRAINT "canonical_contents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_contents" ADD CONSTRAINT "canonical_contents_raw_payload_id_fkey" FOREIGN KEY ("raw_payload_id") REFERENCES "raw_source_payloads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_canonical_content_id_fkey" FOREIGN KEY ("canonical_content_id") REFERENCES "canonical_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_claims" ADD CONSTRAINT "content_claims_canonical_content_id_fkey" FOREIGN KEY ("canonical_content_id") REFERENCES "canonical_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_localizations" ADD CONSTRAINT "content_localizations_canonical_content_id_fkey" FOREIGN KEY ("canonical_content_id") REFERENCES "canonical_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_localization_revisions" ADD CONSTRAINT "content_localization_revisions_content_localization_id_fkey" FOREIGN KEY ("content_localization_id") REFERENCES "content_localizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_clusters" ADD CONSTRAINT "content_clusters_primary_canonical_content_id_fkey" FOREIGN KEY ("primary_canonical_content_id") REFERENCES "canonical_contents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_cluster_members" ADD CONSTRAINT "content_cluster_members_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "content_clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_cluster_members" ADD CONSTRAINT "content_cluster_members_canonical_content_id_fkey" FOREIGN KEY ("canonical_content_id") REFERENCES "canonical_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_audience_matches" ADD CONSTRAINT "content_audience_matches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_audience_matches" ADD CONSTRAINT "content_audience_matches_canonical_content_id_fkey" FOREIGN KEY ("canonical_content_id") REFERENCES "canonical_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_audience_matches" ADD CONSTRAINT "content_audience_matches_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "content_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity constraints not expressible in the Prisma schema.
ALTER TABLE "raw_source_payloads" ADD CONSTRAINT "raw_source_payloads_payload_or_ref_check" CHECK ("payload" IS NOT NULL OR "payload_ref" IS NOT NULL);

ALTER TABLE "canonical_contents" ADD CONSTRAINT "canonical_contents_source_tier_check" CHECK ("source_tier" BETWEEN 1 AND 3);

ALTER TABLE "canonical_contents" ADD CONSTRAINT "canonical_contents_authority_score_check" CHECK ("authority_score" BETWEEN 0 AND 1);

ALTER TABLE "content_localizations" ADD CONSTRAINT "content_localizations_quality_score_check" CHECK ("quality_score" IS NULL OR "quality_score" BETWEEN 0 AND 1);

ALTER TABLE "content_localization_revisions" ADD CONSTRAINT "content_localization_revisions_quality_score_check" CHECK ("quality_score" IS NULL OR "quality_score" BETWEEN 0 AND 1);

ALTER TABLE "content_cluster_members" ADD CONSTRAINT "content_cluster_members_similarity_score_check" CHECK ("similarity_score" IS NULL OR "similarity_score" BETWEEN 0 AND 1);

ALTER TABLE "content_audience_matches" ADD CONSTRAINT "content_audience_matches_relevance_score_check" CHECK ("relevance_score" BETWEEN 0 AND 1);
