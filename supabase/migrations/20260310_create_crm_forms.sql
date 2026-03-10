-- ============================================================
-- Migration: CRM Forms
-- Description: Embeddable HTML forms that create CRM contacts
--   without exposing any API secret. Each form has a public
--   form_id used in the generated HTML snippet; all auth and
--   organization resolution happens server-side.
-- ============================================================

-- 1. Table: crm_forms
CREATE TABLE IF NOT EXISTS public.crm_forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT '',
    fields jsonb NOT NULL DEFAULT '[]'::jsonb,          -- Array of CRMFormField objects
    style jsonb NOT NULL DEFAULT '{}'::jsonb,            -- FormStyle object
    allowed_origins text[] DEFAULT ARRAY[]::text[],     -- Empty = allow all origins; otherwise whitelist
    is_active boolean DEFAULT true NOT NULL,
    submission_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_forms_pkey PRIMARY KEY (id),
    CONSTRAINT crm_forms_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

ALTER TABLE public.crm_forms OWNER TO postgres;

COMMENT ON TABLE public.crm_forms IS 'Embeddable HTML forms that capture leads into the CRM. The form id is public; no secret token is embedded.';
COMMENT ON COLUMN public.crm_forms.allowed_origins IS 'Allowed Origin domains for CORS and validation. Empty = all origins allowed. Example: {"https://mysite.com","https://landing.mysite.com"}';
COMMENT ON COLUMN public.crm_forms.submission_count IS 'Running total of successful submissions for analytics.';

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_crm_forms_organization_id ON public.crm_forms USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_forms_active ON public.crm_forms USING btree (id, is_active) WHERE is_active = true;

-- 3. Updated_at trigger (uses existing update_updated_at_column function)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'set_crm_forms_updated_at'
          AND tgrelid = 'public.crm_forms'::regclass
    ) THEN
        CREATE TRIGGER set_crm_forms_updated_at
            BEFORE UPDATE ON public.crm_forms
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END;
$$;

-- 4. RLS
ALTER TABLE public.crm_forms ENABLE ROW LEVEL SECURITY;

-- Admins and managers can fully manage their org's forms
DROP POLICY IF EXISTS "admin_manager_all_crm_forms" ON public.crm_forms;
CREATE POLICY "admin_manager_all_crm_forms" ON public.crm_forms
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'manager')
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'manager')
        )
    );

-- Community members can only read forms in their org
DROP POLICY IF EXISTS "community_read_crm_forms" ON public.crm_forms;
CREATE POLICY "community_read_crm_forms" ON public.crm_forms
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

-- Service role bypass (used by form-submit Edge Function to look up forms)
-- The service role bypasses RLS by default in Supabase.

-- 5. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_forms TO authenticated;
GRANT ALL ON public.crm_forms TO service_role;
