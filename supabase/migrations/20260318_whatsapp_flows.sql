-- Migration: 20260318_whatsapp_flows.sql
-- Creates tables for managing WhatsApp Flows (Meta interactive form feature)
-- Enables Chatfuel-style flow management: create flow → configure field mappings → send → receive → auto-save to CRM

-- ============================================================
-- TABLE: whatsapp_flows
-- Stores Meta Flow definitions registered by each organization.
-- Admins enter the Meta Flow ID from Meta Business Manager,
-- then configure which flow fields map to which CRM properties.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_flows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    meta_flow_id TEXT NOT NULL,                    -- Meta's assigned flow ID (from Business Manager)
    name TEXT NOT NULL,                             -- Human-readable name shown in the app
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',          -- active / inactive / deprecated
    flow_type TEXT NOT NULL DEFAULT 'static',       -- static (no server calls) / dynamic (server endpoint called per screen)
    -- Message text when the flow is sent to a contact
    body_text TEXT NOT NULL DEFAULT 'Por favor, completa el formulario.',
    -- CTA button text shown on the message
    cta_text TEXT NOT NULL DEFAULT 'Abrir formulario',
    -- The first screen of the flow to navigate to (leave empty for default)
    first_screen TEXT,
    -- JSON: { "field_key": { "label": "Field Label", "crm_property_id": "uuid | null" } }
    -- Maps flow field keys to CRM custom property IDs for auto-population
    field_mappings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, meta_flow_id)
);

ALTER TABLE public.whatsapp_flows OWNER TO postgres;

COMMENT ON TABLE public.whatsapp_flows IS 'WhatsApp Flow definitions. Each row represents a Meta Flow registered by an organization, with field → CRM property mappings.';
COMMENT ON COLUMN public.whatsapp_flows.meta_flow_id IS 'The Flow ID assigned by Meta (found in Meta Business Manager > WhatsApp Manager > Flows).';
COMMENT ON COLUMN public.whatsapp_flows.field_mappings IS 'JSON mapping of flow field keys to CRM custom property IDs. Example: {"name": {"label": "Full Name", "crm_property_id": "uuid"}, "email": {"label": "Email", "crm_property_id": null}}.';
COMMENT ON COLUMN public.whatsapp_flows.flow_type IS '"static" = all content pre-defined, no server calls during execution. "dynamic" = server endpoint called per screen for loading data or validation.';

-- Index for lookups by org
CREATE INDEX IF NOT EXISTS whatsapp_flows_org_id_idx ON public.whatsapp_flows(organization_id);
CREATE INDEX IF NOT EXISTS whatsapp_flows_meta_flow_id_idx ON public.whatsapp_flows(meta_flow_id);

-- Enable RLS
ALTER TABLE public.whatsapp_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_flows_select" ON public.whatsapp_flows
    FOR SELECT USING (organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY "whatsapp_flows_insert" ON public.whatsapp_flows
    FOR INSERT WITH CHECK (organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY "whatsapp_flows_update" ON public.whatsapp_flows
    FOR UPDATE USING (organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY "whatsapp_flows_delete" ON public.whatsapp_flows
    FOR DELETE USING (organization_id IN (SELECT get_my_org_ids()));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_whatsapp_flows_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER whatsapp_flows_updated_at
    BEFORE UPDATE ON public.whatsapp_flows
    FOR EACH ROW EXECUTE FUNCTION public.update_whatsapp_flows_updated_at();


-- ============================================================
-- TABLE: whatsapp_flow_sends
-- Tracks every time a flow is sent to a contact.
-- The flow_token generated here is included in the outbound
-- interactive message. When Meta returns the nfm_reply,
-- we use the flow_token to look up this record and identify
-- exactly which contact + flow + field mappings apply.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_flow_sends (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    flow_id UUID REFERENCES public.whatsapp_flows(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    -- Unique token generated per-send. Included in the interactive message.
    -- Received back in nfm_reply to identify the send.
    flow_token TEXT UNIQUE NOT NULL,
    -- Message ID returned by Meta when the flow was sent
    wamid TEXT,
    status TEXT NOT NULL DEFAULT 'sent',   -- sent / opened / completed / expired
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,              -- Set when nfm_reply arrives
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_flow_sends OWNER TO postgres;

COMMENT ON TABLE public.whatsapp_flow_sends IS 'Audit trail of every WhatsApp Flow interactive message sent. The flow_token column links outbound sends to inbound nfm_reply responses.';
COMMENT ON COLUMN public.whatsapp_flow_sends.flow_token IS 'Unique token generated at send time. Included in the WhatsApp interactive message. Returned verbatim in the nfm_reply, enabling precise contact+campaign matching.';

CREATE INDEX IF NOT EXISTS whatsapp_flow_sends_org_id_idx ON public.whatsapp_flow_sends(organization_id);
CREATE INDEX IF NOT EXISTS whatsapp_flow_sends_flow_token_idx ON public.whatsapp_flow_sends(flow_token);
CREATE INDEX IF NOT EXISTS whatsapp_flow_sends_contact_id_idx ON public.whatsapp_flow_sends(contact_id);
CREATE INDEX IF NOT EXISTS whatsapp_flow_sends_conversation_id_idx ON public.whatsapp_flow_sends(conversation_id);
CREATE INDEX IF NOT EXISTS whatsapp_flow_sends_sent_at_idx ON public.whatsapp_flow_sends(sent_at DESC);

ALTER TABLE public.whatsapp_flow_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_flow_sends_select" ON public.whatsapp_flow_sends
    FOR SELECT USING (organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY "whatsapp_flow_sends_insert" ON public.whatsapp_flow_sends
    FOR INSERT WITH CHECK (organization_id IN (SELECT get_my_org_ids()));

CREATE POLICY "whatsapp_flow_sends_update" ON public.whatsapp_flow_sends
    FOR UPDATE USING (organization_id IN (SELECT get_my_org_ids()));


-- ============================================================
-- ADD flow_send_id TO crm_flow_responses
-- Links each received response back to the send record.
-- ============================================================
ALTER TABLE public.crm_flow_responses
    ADD COLUMN IF NOT EXISTS flow_send_id UUID REFERENCES public.whatsapp_flow_sends(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES public.whatsapp_flows(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.crm_flow_responses.flow_send_id IS 'Links back to the whatsapp_flow_sends record for this response (matched via flow_token).';
COMMENT ON COLUMN public.crm_flow_responses.flow_id IS 'The whatsapp_flows.id that was sent (for easy joins to flow definition and field mappings).';

CREATE INDEX IF NOT EXISTS crm_flow_responses_flow_send_id_idx ON public.crm_flow_responses(flow_send_id);
CREATE INDEX IF NOT EXISTS crm_flow_responses_flow_id_idx ON public.crm_flow_responses(flow_id);
