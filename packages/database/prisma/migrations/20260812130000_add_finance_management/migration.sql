CREATE TYPE "FinanceTransactionType" AS ENUM ('INCOME', 'EXPENSE');

CREATE TABLE "finance_categories" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "symbol_name" VARCHAR(80) NOT NULL,
  "type" "FinanceTransactionType" NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_transactions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "type" "FinanceTransactionType" NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "title" VARCHAR(255) NOT NULL,
  "notes" TEXT,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_monthly_budgets" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "month" DATE NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "finance_monthly_budgets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_categories_user_id_slug_key" ON "finance_categories"("user_id", "slug");
CREATE INDEX "finance_categories_user_id_type_is_archived_idx" ON "finance_categories"("user_id", "type", "is_archived");
CREATE INDEX "finance_transactions_user_id_occurred_at_idx" ON "finance_transactions"("user_id", "occurred_at" DESC);
CREATE INDEX "finance_transactions_user_id_type_occurred_at_idx" ON "finance_transactions"("user_id", "type", "occurred_at");
CREATE UNIQUE INDEX "finance_monthly_budgets_user_id_month_currency_key" ON "finance_monthly_budgets"("user_id", "month", "currency");
CREATE INDEX "finance_monthly_budgets_user_id_month_idx" ON "finance_monthly_budgets"("user_id", "month");

ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_monthly_budgets" ADD CONSTRAINT "finance_monthly_budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
