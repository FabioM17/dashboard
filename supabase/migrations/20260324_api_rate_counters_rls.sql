-- Enable RLS on api_rate_counters
-- The table is only accessed by the edge function via service_role key,
-- which bypasses RLS. No explicit policies are needed for anon/authenticated.
ALTER TABLE public.api_rate_counters ENABLE ROW LEVEL SECURITY;
