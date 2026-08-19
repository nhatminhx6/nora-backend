ALTER TABLE "users"
ADD COLUMN "home_market" VARCHAR(16) NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN "followed_markets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "users"
SET "home_market" = 'VN',
    "followed_markets" = ARRAY['GLOBAL']::TEXT[]
WHERE "locale" = 'vi';

ALTER TABLE "users"
ADD CONSTRAINT "users_home_market_check"
CHECK ("home_market" IN ('VN', 'GLOBAL', 'US', 'CN')),
ADD CONSTRAINT "users_followed_markets_check"
CHECK ("followed_markets" <@ ARRAY['VN', 'GLOBAL', 'US', 'CN']::TEXT[]);
