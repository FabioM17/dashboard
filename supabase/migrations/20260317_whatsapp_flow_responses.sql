-- Migration: 20260317_whatsapp_flow_responses.sql
-- Creates crm_flow_responses table for storing WhatsApp Flow form submissions
-- Flow responses are saved when users submit interactive forms sent via WhatsApp template messages

CREATE TABLE IF NOT EXISTS public.crm_flow_responses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    flow_token TEXT,
    template_name TEXT,
    phone_number TEXT NOT NULL,
    response_data JSONB NOT NULL DEFAULT '{}',
    raw_response_json TEXT,
    was_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
    wamid TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crm_flow_responses OWNER TO postgres;

COMMENT ON TABLE public.crm_flow_responses IS 'Stores form submissions received from WhatsApp Flows (interactive template messages). Each row is one user submission, linked to a CRM contact and conversation.';
COMMENT ON COLUMN public.crm_flow_responses.flow_token IS 'The flow_token sent with the original template — identifies which specific send triggered this submission.';
COMMENT ON COLUMN public.crm_flow_responses.response_data IS 'Parsed JSONB of all fields submitted by the user in the Flow.';
COMMENT ON COLUMN public.crm_flow_responses.was_encrypted IS 'TRUE if the response_json arrived encrypted and was decrypted server-side using WHATSAPP_FLOW_PRIVATE_KEY.';

-- Indexes
CREATE INDEX IF NOT EXISTS crm_flow_responses_contact_id_idx ON public.crm_flow_responses(contact_id);
CREATE INDEX IF NOT EXISTS crm_flow_responses_org_id_idx ON public.crm_flow_responses(organization_id);
CREATE INDEX IF NOT EXISTS crm_flow_responses_phone_idx ON public.crm_flow_responses(phone_number);
CREATE INDEX IF NOT EXISTS crm_flow_responses_created_at_idx ON public.crm_flow_responses(created_at DESC);

-- Enable RLS
ALTER TABLE public.crm_flow_responses ENABLE ROW LEVEL SECURITY;

-- RLS: org members can read their own data
CREATE POLICY "flow_responses_select" ON public.crm_flow_responses
    FOR SELECT
    USING (organization_id IN (SELECT get_my_org_ids()));

-- RLS: org members can insert (frontend direct inserts, unusual but covered)
CREATE POLICY "flow_responses_insert" ON public.crm_flow_responses
    FOR INSERT
    WITH CHECK (organization_id IN (SELECT get_my_org_ids()));

-- RLS: org members can update
CREATE POLICY "flow_responses_update" ON public.crm_flow_responses
    FOR UPDATE
    USING (organization_id IN (SELECT get_my_org_ids()));

-- RLS: org members can delete
CREATE POLICY "flow_responses_delete" ON public.crm_flow_responses
    FOR DELETE
    USING (organization_id IN (SELECT get_my_org_ids()));

-- Add crm_flow_responses cleanup to delete_organization_data function
-- (The ON DELETE CASCADE on organization_id handles this automatically,
--  but we also update the preview function and the explicit deletion function
--  to be consistent with the rest of the codebase.)

-- Update preview_organization_deletion to include flow_responses count
CREATE OR REPLACE FUNCTION "public"."preview_organization_deletion"("requesting_user_id" "uuid", "target_org_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  creator_id UUID;
  result JSON;
BEGIN
  SELECT public.get_org_creator_id(target_org_id) INTO creator_id;

  IF (requesting_user_id != creator_id) THEN
    RETURN json_build_object('error', 'Only org creator can delete organization');
  END IF;

  SELECT json_build_object(
    'organization_id', target_org_id,
    'name', (SELECT name FROM organizations WHERE id = target_org_id),
    'created_by', creator_id,
    'requested_by', requesting_user_id,
    'preview_timestamp', now(),
    'items_to_delete', json_build_object(
      'conversations', (SELECT COUNT(*) FROM conversations WHERE organization_id = target_org_id),
      'messages', (SELECT COUNT(*) FROM messages WHERE organization_id = target_org_id),
      'contacts', (SELECT COUNT(*) FROM crm_contacts WHERE organization_id = target_org_id),
      'flow_responses', (SELECT COUNT(*) FROM crm_flow_responses WHERE organization_id = target_org_id),
      'campaigns', (SELECT COUNT(*) FROM campaigns WHERE organization_id = target_org_id),
      'workflows', (SELECT COUNT(*) FROM workflows WHERE organization_id = target_org_id),
      'workflow_enrollments', (SELECT COUNT(*) FROM workflow_enrollments WHERE organization_id = target_org_id),
      'lists', (SELECT COUNT(*) FROM lists WHERE organization_id = target_org_id),
      'snippets', (SELECT COUNT(*) FROM snippets WHERE organization_id = target_org_id),
      'message_statuses', (SELECT COUNT(*) FROM message_statuses WHERE organization_id = target_org_id),
      'team_hierarchy', (SELECT COUNT(*) FROM team_members_hierarchy WHERE organization_id = target_org_id),
      'lead_assignments', (SELECT COUNT(*) FROM user_assigned_leads WHERE organization_id = target_org_id)
    ),
    'members', (
      SELECT json_agg(json_build_object(
        'id', p.id,
        'name', p.full_name,
        'email', p.email,
        'role', om.role,
        'is_creator', p.id = creator_id,
        'has_other_organizations', EXISTS (
          SELECT 1 FROM public.organization_members om2
          WHERE om2.user_id = p.id
            AND om2.organization_id <> target_org_id
        )
      ))
      FROM public.organization_members om
      JOIN public.profiles p ON p.id = om.user_id
      WHERE om.organization_id = target_org_id
    )
  ) INTO result;

  RETURN result;
END;
$$;
