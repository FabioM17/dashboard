-- ============================================================
-- Migration: API Keys & Endpoint Configuration
-- Description: Adds tables for external API access management
--   - api_keys: Secret keys per organization for external access
--   - api_endpoint_configs: Per-endpoint enable/disable per org
-- ============================================================

-- 1. Table: api_keys
-- Stores API keys (hashed) per organization with metadata
CREATE TABLE IF NOT EXISTS public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,                              -- Friendly name: "Production Key", "Staging Key"
    key_prefix text NOT NULL,                        -- First 8 chars for identification (e.g., "dk_live_")
    key_hash text NOT NULL,                          -- SHA-256 hash of the full key (never store plaintext)
    scopes text[] DEFAULT '{}'::text[],              -- Allowed scopes: {"contacts:read","contacts:write","messages:read","messages:send","conversations:read","conversations:write"}
    is_active boolean DEFAULT true,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,             -- Optional expiration
    created_by uuid,                                 -- Profile who created the key
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT api_keys_pkey PRIMARY KEY (id)
);

ALTER TABLE public.api_keys OWNER TO postgres;

COMMENT ON TABLE public.api_keys IS 'API keys for external platform integrations. Keys are stored hashed (SHA-256).';
COMMENT ON COLUMN public.api_keys.key_prefix IS 'First 8 characters of the key for identification in UI (e.g. dk_live_)';
COMMENT ON COLUMN public.api_keys.key_hash IS 'SHA-256 hash of the full API key. The plaintext key is only shown once at creation.';
COMMENT ON COLUMN public.api_keys.scopes IS 'Array of allowed scopes: contacts:read, contacts:write, messages:read, messages:send, conversations:read, conversations:write';

-- 2. Table: api_endpoint_configs  
-- Controls which API endpoints are enabled/disabled per organization
CREATE TABLE IF NOT EXISTS public.api_endpoint_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    endpoint_name text NOT NULL,                     -- e.g., "contacts", "messages", "conversations", "send-message"
    method text NOT NULL DEFAULT 'GET',              -- HTTP method: GET, POST, PUT, DELETE, PATCH
    is_enabled boolean DEFAULT true,
    rate_limit_per_minute integer DEFAULT 60,        -- Rate limit per minute per key
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT api_endpoint_configs_pkey PRIMARY KEY (id),
    CONSTRAINT api_endpoint_configs_unique UNIQUE (organization_id, endpoint_name, method)
);

ALTER TABLE public.api_endpoint_configs OWNER TO postgres;

COMMENT ON TABLE public.api_endpoint_configs IS 'Per-organization endpoint configuration. Allows admins to enable/disable individual API endpoints.';
COMMENT ON COLUMN public.api_endpoint_configs.endpoint_name IS 'API endpoint name: contacts, messages, conversations, send-message, templates, contacts-search';
COMMENT ON COLUMN public.api_endpoint_configs.rate_limit_per_minute IS 'Maximum requests per minute for this endpoint per API key';

-- 3. Indexes
CREATE INDEX idx_api_keys_organization_id ON public.api_keys USING btree (organization_id);
CREATE INDEX idx_api_keys_key_hash ON public.api_keys USING btree (key_hash);
CREATE INDEX idx_api_keys_active ON public.api_keys USING btree (organization_id, is_active) WHERE (is_active = true);
CREATE INDEX idx_api_endpoint_configs_org ON public.api_endpoint_configs USING btree (organization_id);

-- 4. Foreign Keys
ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.api_endpoint_configs
    ADD CONSTRAINT api_endpoint_configs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 5. Triggers for updated_at
CREATE OR REPLACE TRIGGER update_api_keys_updated_at
    BEFORE UPDATE ON public.api_keys
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_api_endpoint_configs_updated_at
    BEFORE UPDATE ON public.api_endpoint_configs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Row Level Security
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_endpoint_configs ENABLE ROW LEVEL SECURITY;

-- API Keys: Only users in the same org can manage keys
CREATE POLICY "Users can view API keys from their organization"
    ON public.api_keys FOR SELECT
    USING (organization_id IN (
        SELECT profiles.organization_id FROM public.profiles WHERE profiles.id = auth.uid()
    ));

CREATE POLICY "Users can create API keys in their organization"
    ON public.api_keys FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT profiles.organization_id FROM public.profiles WHERE profiles.id = auth.uid()
    ));

CREATE POLICY "Users can update API keys in their organization"
    ON public.api_keys FOR UPDATE
    USING (organization_id IN (
        SELECT profiles.organization_id FROM public.profiles WHERE profiles.id = auth.uid()
    ));

CREATE POLICY "Users can delete API keys from their organization"
    ON public.api_keys FOR DELETE
    USING (organization_id IN (
        SELECT profiles.organization_id FROM public.profiles WHERE profiles.id = auth.uid()
    ));

-- Service role has full access (for edge functions)
CREATE POLICY "Service role can manage API keys"
    ON public.api_keys
    USING (auth.role() = 'service_role'::text);

-- Endpoint configs: Same org-scoped RLS
CREATE POLICY "Users can view endpoint configs from their organization"
    ON public.api_endpoint_configs FOR SELECT
    USING (organization_id IN (
        SELECT profiles.organization_id FROM public.profiles WHERE profiles.id = auth.uid()
    ));

CREATE POLICY "Users can create endpoint configs in their organization"
    ON public.api_endpoint_configs FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT profiles.organization_id FROM public.profiles WHERE profiles.id = auth.uid()
    ));

CREATE POLICY "Users can update endpoint configs in their organization"
    ON public.api_endpoint_configs FOR UPDATE
    USING (organization_id IN (
        SELECT profiles.organization_id FROM public.profiles WHERE profiles.id = auth.uid()
    ));

CREATE POLICY "Users can delete endpoint configs from their organization"
    ON public.api_endpoint_configs FOR DELETE
    USING (organization_id IN (
        SELECT profiles.organization_id FROM public.profiles WHERE profiles.id = auth.uid()
    ));

CREATE POLICY "Service role can manage endpoint configs"
    ON public.api_endpoint_configs
    USING (auth.role() = 'service_role'::text);

-- 7. Grant permissions
GRANT ALL ON TABLE public.api_keys TO anon;
GRANT ALL ON TABLE public.api_keys TO authenticated;
GRANT ALL ON TABLE public.api_keys TO service_role;

GRANT ALL ON TABLE public.api_endpoint_configs TO anon;
GRANT ALL ON TABLE public.api_endpoint_configs TO authenticated;
GRANT ALL ON TABLE public.api_endpoint_configs TO service_role;

-- 8. Seed default endpoint configurations function
-- This function creates default endpoint configs for an organization
CREATE OR REPLACE FUNCTION public.seed_api_endpoint_defaults(org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO api_endpoint_configs (organization_id, endpoint_name, method, is_enabled, rate_limit_per_minute)
    VALUES
        (org_id, 'contacts', 'GET', true, 60),
        (org_id, 'contacts', 'POST', true, 30),
        (org_id, 'contacts', 'PUT', true, 30),
        (org_id, 'contacts', 'DELETE', true, 10),
        (org_id, 'contacts-search', 'POST', true, 30),
        (org_id, 'conversations', 'GET', true, 60),
        (org_id, 'conversations', 'PUT', true, 30),
        (org_id, 'messages', 'GET', true, 60),
        (org_id, 'send-message', 'POST', true, 30),
        (org_id, 'templates', 'GET', true, 60)
    ON CONFLICT (organization_id, endpoint_name, method) DO NOTHING;
END;
$$;

ALTER FUNCTION public.seed_api_endpoint_defaults(uuid) OWNER TO postgres;
GRANT ALL ON FUNCTION public.seed_api_endpoint_defaults(uuid) TO anon;
GRANT ALL ON FUNCTION public.seed_api_endpoint_defaults(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.seed_api_endpoint_defaults(uuid) TO service_role;
