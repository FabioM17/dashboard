-- Migration: API rate-limit rolling counters
-- Used by the external-api edge function to enforce rate_limit_per_minute per key+endpoint+window.

-- 1. Table: rolling-minute counters (auto-expires via row TTL cleanup)
CREATE TABLE IF NOT EXISTS public.api_rate_counters (
  counter_key  text        PRIMARY KEY,
  count        integer     NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL
);

-- 2. Enable RLS (service_role bypasses it; no client should access this table directly)
ALTER TABLE public.api_rate_counters ENABLE ROW LEVEL SECURITY;

-- 3. Index for fast cleanup of expired rows
CREATE INDEX IF NOT EXISTS idx_api_rate_counters_expires ON public.api_rate_counters (expires_at);

-- 3. RPC: atomically increment a counter (insert or increment)
CREATE OR REPLACE FUNCTION public.increment_rate_counter(p_key text, p_expires_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO api_rate_counters (counter_key, count, expires_at)
  VALUES (p_key, 1, p_expires_at)
  ON CONFLICT (counter_key) DO UPDATE
    SET count = api_rate_counters.count + 1;
END;
$$;

-- 4. RPC: purge expired counter rows (call periodically via pg_cron or manually)
CREATE OR REPLACE FUNCTION public.purge_expired_rate_counters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM api_rate_counters WHERE expires_at < now();
END;
$$;

-- 5. Permissions
GRANT ALL ON TABLE public.api_rate_counters TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_rate_counter(text, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_rate_counters() TO service_role;

-- 6. Also seed contacts-bulk config row for existing organizations
-- (new orgs get it via seed_api_endpoint_defaults)
INSERT INTO public.api_endpoint_configs (organization_id, endpoint_name, method, is_enabled, rate_limit_per_minute)
SELECT DISTINCT organization_id, 'contacts-bulk', 'POST', true, 10
FROM public.api_endpoint_configs
ON CONFLICT (organization_id, endpoint_name, method) DO NOTHING;

-- 7. Update seed function to include contacts-bulk
CREATE OR REPLACE FUNCTION public.seed_api_endpoint_defaults(org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO api_endpoint_configs (organization_id, endpoint_name, method, is_enabled, rate_limit_per_minute)
  VALUES
    (org_id, 'contacts',       'GET',    true, 60),
    (org_id, 'contacts',       'POST',   true, 30),
    (org_id, 'contacts',       'PUT',    true, 30),
    (org_id, 'contacts',       'DELETE', true, 10),
    (org_id, 'contacts-search','POST',   true, 30),
    (org_id, 'contacts-bulk',  'POST',   true, 10),
    (org_id, 'conversations',  'GET',    true, 60),
    (org_id, 'conversations',  'PUT',    true, 30),
    (org_id, 'messages',       'GET',    true, 60),
    (org_id, 'send-message',   'POST',   true, 30),
    (org_id, 'templates',      'GET',    true, 60)
  ON CONFLICT (organization_id, endpoint_name, method) DO NOTHING;
END;
$$;
