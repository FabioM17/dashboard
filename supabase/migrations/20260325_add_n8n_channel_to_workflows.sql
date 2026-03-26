-- Migration: Add HTTP webhook channel support to workflow_steps
-- Date: 2026-03-25 (updated 2026-03-26: renamed n8n_* columns to webhook_*)

-- 1. Rename existing n8n_* columns if they exist, otherwise add webhook_* columns fresh
DO $$
BEGIN
  -- webhook_url
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_steps' AND column_name = 'n8n_webhook_url') THEN
    ALTER TABLE public.workflow_steps RENAME COLUMN n8n_webhook_url TO webhook_url;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_steps' AND column_name = 'webhook_url') THEN
    ALTER TABLE public.workflow_steps ADD COLUMN webhook_url text;
  END IF;

  -- webhook_auth_header
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_steps' AND column_name = 'n8n_auth_header') THEN
    ALTER TABLE public.workflow_steps RENAME COLUMN n8n_auth_header TO webhook_auth_header;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_steps' AND column_name = 'webhook_auth_header') THEN
    ALTER TABLE public.workflow_steps ADD COLUMN webhook_auth_header text;
  END IF;

  -- webhook_custom_body
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_steps' AND column_name = 'n8n_custom_body') THEN
    ALTER TABLE public.workflow_steps RENAME COLUMN n8n_custom_body TO webhook_custom_body;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_steps' AND column_name = 'webhook_custom_body') THEN
    ALTER TABLE public.workflow_steps ADD COLUMN webhook_custom_body text;
  END IF;

  -- webhook_contact_fields
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_steps' AND column_name = 'n8n_contact_fields') THEN
    ALTER TABLE public.workflow_steps RENAME COLUMN n8n_contact_fields TO webhook_contact_fields;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_steps' AND column_name = 'webhook_contact_fields') THEN
    ALTER TABLE public.workflow_steps ADD COLUMN webhook_contact_fields jsonb DEFAULT NULL;
  END IF;
END
$$;

-- 2. Drop old constraint (handles both old 'n8n' and any previous version)
ALTER TABLE public.workflow_steps
  DROP CONSTRAINT IF EXISTS workflow_steps_channel_check;

-- 3. Recreate the constraint including 'webhook' as a valid channel
ALTER TABLE public.workflow_steps
  ADD CONSTRAINT workflow_steps_channel_check CHECK (
    (("channel" = 'whatsapp') AND ("template_id" IS NOT NULL))
    OR (("channel" = 'email') AND ("email_subject" IS NOT NULL) AND ("email_body" IS NOT NULL))
    OR (("channel" = 'webhook') AND ("webhook_url" IS NOT NULL))
  );

-- 4. Update any existing rows that had channel = 'n8n' to 'webhook'
UPDATE public.workflow_steps SET channel = 'webhook' WHERE channel = 'n8n';

-- 5. Comments
COMMENT ON COLUMN public.workflow_steps.webhook_url IS 'URL to POST to when this webhook step executes (compatible with n8n, Make, Zapier, custom APIs, etc.)';
COMMENT ON COLUMN public.workflow_steps.webhook_auth_header IS 'Optional auth header in format "HeaderName: value" (e.g. "Authorization: Bearer TOKEN")';
COMMENT ON COLUMN public.workflow_steps.webhook_custom_body IS 'Optional custom JSON body to send instead of the default contact/workflow payload';
COMMENT ON COLUMN public.workflow_steps.webhook_contact_fields IS 'JSON array of contact field names to include in payload. NULL or empty = send all fields.';
