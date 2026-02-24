-- Replace scheduled_at TIMESTAMPTZ with send_time TEXT on workflow_steps
-- send_time stores "HH:MM" in UTC (frontend converts local→UTC before saving)
-- next_send_at on enrollments is computed: enrollment_date + delay_days at send_time
-- This way each contact starts fresh from their enrollment date

-- 1. Drop the scheduled_at column
ALTER TABLE public.workflow_steps
  DROP COLUMN IF EXISTS scheduled_at;

-- 2. Add send_time TEXT column (HH:MM in UTC, NULL = send ASAP)
ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS send_time TEXT DEFAULT NULL;

-- 3. Format constraint
ALTER TABLE public.workflow_steps
  DROP CONSTRAINT IF EXISTS workflow_steps_send_time_format;

ALTER TABLE public.workflow_steps
  ADD CONSTRAINT workflow_steps_send_time_format 
  CHECK (send_time IS NULL OR send_time ~ '^\d{2}:\d{2}$');

COMMENT ON COLUMN public.workflow_steps.send_time 
  IS 'Hora del día para enviar (formato HH:MM en UTC). NULL = enviar lo antes posible tras cumplir delay_days. El frontend convierte hora local a UTC antes de guardar.';
