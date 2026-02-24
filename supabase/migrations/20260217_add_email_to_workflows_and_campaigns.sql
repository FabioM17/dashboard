-- ============================================================
-- Migration: Add email channel support to workflow_steps
-- Date: 2026-02-17
-- ============================================================

-- 1. Add channel column to workflow_steps (whatsapp = default for backward compat)
ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';

-- 2. Add email-specific fields to workflow_steps
ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS email_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_body TEXT;

-- 3. Make template_id nullable (email steps don't use Meta templates)
ALTER TABLE public.workflow_steps
  ALTER COLUMN template_id DROP NOT NULL;

-- 4. Make template_name nullable
ALTER TABLE public.workflow_steps
  ALTER COLUMN template_name DROP NOT NULL;

-- 5. Add constraint: whatsapp steps require template, email steps require subject+body
ALTER TABLE public.workflow_steps
  ADD CONSTRAINT workflow_steps_channel_check CHECK (
    (channel = 'whatsapp' AND template_id IS NOT NULL)
    OR
    (channel = 'email' AND email_subject IS NOT NULL AND email_body IS NOT NULL)
  );

-- 6. Add send_time column if not exists (may have been added before)
ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS send_time TEXT;

-- 7. Add variable_mappings for template/email variable mapping
-- Format: [{"variable": "name", "source": "property"|"manual", "value": "name"|"custom text"}]
ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS variable_mappings JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.workflow_steps.channel IS 'Channel for this step: whatsapp or email';
COMMENT ON COLUMN public.workflow_steps.email_subject IS 'Email subject (supports {{merge_tags}})';
COMMENT ON COLUMN public.workflow_steps.email_body IS 'Email HTML body (supports {{merge_tags}})';
COMMENT ON COLUMN public.workflow_steps.variable_mappings IS 'JSON array mapping template variables to contact properties or manual values';
