-- Migration: Add AI Usage Log table for rate limiting and telemetry
-- Date: 2026-03-11

CREATE TABLE IF NOT EXISTS "public"."ai_usage_log" (
  "id"              BIGSERIAL          PRIMARY KEY,
  "organization_id" UUID               NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "user_id"         UUID               NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "provider"        TEXT               NOT NULL,
  "task_type"       TEXT               NOT NULL DEFAULT 'chat_reply',
  "created_at"      TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- Index for efficient rate-limit queries (per org, newest first)
CREATE INDEX "idx_ai_usage_org_time"
  ON "public"."ai_usage_log" ("organization_id", "created_at" DESC);

-- Auto-purge rows older than 7 days to keep the table lean
-- (Run this manually or via a scheduled job / pg_cron)
-- DELETE FROM ai_usage_log WHERE created_at < NOW() - INTERVAL '7 days';

-- RLS: only the Edge Function (service role) can write; org members can read their own usage
ALTER TABLE "public"."ai_usage_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ai_usage_log"
  ON "public"."ai_usage_log"
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Org members can read own ai usage"
  ON "public"."ai_usage_log"
  FOR SELECT
  USING (organization_id = get_auth_user_org_id());
