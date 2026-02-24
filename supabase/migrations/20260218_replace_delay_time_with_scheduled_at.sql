-- Replace delay_time TEXT with scheduled_at TIMESTAMPTZ on workflow_steps
-- This follows the same pattern as campaigns.scheduled_at
-- The frontend sends .toISOString() from a datetime-local input (auto UTC conversion)

-- 1. Drop the old constraint and column
ALTER TABLE public.workflow_steps
  DROP CONSTRAINT IF EXISTS workflow_steps_delay_time_format;

ALTER TABLE public.workflow_steps
  DROP COLUMN IF EXISTS delay_time;

-- 2. Add the new timestamptz column (NULL = send based on delay_days only, ASAP)
ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN public.workflow_steps.scheduled_at 
  IS 'Fecha/hora exacta para enviar este paso. NULL = usar solo delay_days (enviar lo antes posible). El frontend envía en UTC via .toISOString()';

-- 3. Remove timezone column from workflows (not needed with timestamptz)
ALTER TABLE public.workflows
  DROP COLUMN IF EXISTS timezone;
