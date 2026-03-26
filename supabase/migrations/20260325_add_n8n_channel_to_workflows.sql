-- Migration: Add n8n webhook channel support to workflow_steps
-- Date: 2026-03-25

-- 1. Add new columns for n8n webhook configuration
ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS n8n_webhook_url text,
  ADD COLUMN IF NOT EXISTS n8n_auth_header text,
  ADD COLUMN IF NOT EXISTS n8n_custom_body text,
  ADD COLUMN IF NOT EXISTS n8n_contact_fields jsonb DEFAULT NULL;

-- 2. Drop the old channel constraint that only allowed whatsapp and email
ALTER TABLE public.workflow_steps
  DROP CONSTRAINT IF EXISTS workflow_steps_channel_check;

-- 3. Recreate the constraint including 'n8n' as a valid channel
--    n8n steps require only n8n_webhook_url
ALTER TABLE public.workflow_steps
  ADD CONSTRAINT workflow_steps_channel_check CHECK (
    (("channel" = 'whatsapp') AND ("template_id" IS NOT NULL))
    OR (("channel" = 'email') AND ("email_subject" IS NOT NULL) AND ("email_body" IS NOT NULL))
    OR (("channel" = 'n8n') AND ("n8n_webhook_url" IS NOT NULL))
  );

-- 4. Comments
COMMENT ON COLUMN public.workflow_steps.n8n_webhook_url IS 'Webhook URL to call when this n8n step executes';
COMMENT ON COLUMN public.workflow_steps.n8n_auth_header IS 'Optional auth header in format "HeaderName: value" (e.g. "Authorization: Bearer TOKEN")';
COMMENT ON COLUMN public.workflow_steps.n8n_custom_body IS 'Optional custom JSON body to send instead of the default contact/workflow payload';
COMMENT ON COLUMN public.workflow_steps.n8n_contact_fields IS 'JSON array of contact field names to include in payload. NULL or empty = send all fields.';
