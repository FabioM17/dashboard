-- Add delay_time column to workflow_steps
-- Allows specifying the hour of day for sending messages
-- Format: "HH:MM" (24h), NULL means send ASAP (no time constraint)

ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS delay_time TEXT DEFAULT NULL;

COMMENT ON COLUMN public.workflow_steps.delay_time 
  IS 'Hora del día para enviar el mensaje (formato HH:MM 24h). NULL = enviar lo antes posible';

-- Validate format if not null
ALTER TABLE public.workflow_steps
  DROP CONSTRAINT IF EXISTS workflow_steps_delay_time_format;

ALTER TABLE public.workflow_steps
  ADD CONSTRAINT workflow_steps_delay_time_format 
  CHECK (delay_time IS NULL OR delay_time ~ '^\d{2}:\d{2}$');

-- Add timezone column to workflows for correct time conversion
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Tegucigalpa';

COMMENT ON COLUMN public.workflows.timezone 
  IS 'Timezone IANA del workflow para calcular correctamente las horas de envío';
