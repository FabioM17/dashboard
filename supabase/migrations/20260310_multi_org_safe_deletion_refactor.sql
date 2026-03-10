-- Multi-org safe deletion refactor
-- Purpose:
-- 1) Deleting an organization must NOT delete auth users.
-- 2) If a user belongs to multiple orgs, remove only membership/data for the target org.
-- 3) Align creator detection with organizations.created_by.

-- Ensure profiles can survive organization deletion by nulling active org reference.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_organization_id_fkey'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_organization_id_fkey;
  END IF;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id)
    ON DELETE SET NULL;
END $$;

-- Helper: creator should come from organizations.created_by (with fallback for legacy rows).
CREATE OR REPLACE FUNCTION public.get_org_creator_id(org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  creator_id uuid;
BEGIN
  SELECT o.created_by INTO creator_id
  FROM public.organizations o
  WHERE o.id = org_id;

  IF creator_id IS NOT NULL THEN
    RETURN creator_id;
  END IF;

  -- Legacy fallback: earliest admin membership in that org.
  SELECT om.user_id INTO creator_id
  FROM public.organization_members om
  WHERE om.organization_id = org_id
    AND om.role = 'admin'
  ORDER BY om.created_at ASC
  LIMIT 1;

  RETURN creator_id;
END;
$$;

COMMENT ON FUNCTION public.get_org_creator_id(uuid) IS
  'Returns creator user ID from organizations.created_by; falls back to earliest admin membership for legacy data.';

-- Level 2 (member delete): multi-org aware.
-- If target has other org memberships, remove only target-org membership and org-scoped assignments.
-- Delete auth account only when target has no memberships left.
CREATE OR REPLACE FUNCTION public.delete_team_member_data(
  requesting_user_id uuid,
  target_user_id uuid,
  target_org_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  creator_id uuid;
  target_exists boolean;
  remaining_memberships int;
  fallback_org uuid;
  fallback_role text;
BEGIN
  SELECT public.get_org_creator_id(target_org_id) INTO creator_id;

  IF requesting_user_id <> creator_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'FORBIDDEN',
      'message', 'Solo el administrador creador de la organizacion puede eliminar miembros'
    );
  END IF;

  IF requesting_user_id = target_user_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'SELF_DELETE',
      'message', 'No puedes eliminar tu propia cuenta con esta funcion.'
    );
  END IF;

  -- Verify target is member of this org.
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = target_user_id
      AND om.organization_id = target_org_id
  ) INTO target_exists;

  IF NOT target_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'NOT_FOUND',
      'message', 'El usuario no pertenece a esta organizacion'
    );
  END IF;

  IF target_user_id = creator_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROTECTED',
      'message', 'No se puede eliminar al administrador creador de la organizacion'
    );
  END IF;

  -- Org-scoped cleanup for target user.
  DELETE FROM scheduled_notifications
  WHERE assignee_id = target_user_id AND organization_id = target_org_id;

  DELETE FROM user_assigned_leads
  WHERE organization_id = target_org_id
    AND (user_id = target_user_id OR assigned_by = target_user_id);

  DELETE FROM team_members_hierarchy
  WHERE organization_id = target_org_id
    AND (manager_id = target_user_id OR member_id = target_user_id);

  UPDATE conversations
  SET assigned_to = NULL
  WHERE assigned_to = target_user_id
    AND organization_id = target_org_id;

  UPDATE tasks
  SET assignee_id = NULL
  WHERE assignee_id = target_user_id
    AND organization_id = target_org_id;

  UPDATE notes
  SET author_id = '00000000-0000-0000-0000-000000000000'
  WHERE author_id = target_user_id
    AND (
      conversation_id IS NULL
      OR conversation_id IN (
        SELECT id FROM conversations WHERE organization_id = target_org_id
      )
    );

  UPDATE messages
  SET sender_id = '00000000-0000-0000-0000-000000000000'
  WHERE sender_id = target_user_id::text
    AND organization_id = target_org_id;

  -- Remove membership in this org only.
  DELETE FROM public.organization_members
  WHERE user_id = target_user_id
    AND organization_id = target_org_id;

  SELECT COUNT(*) INTO remaining_memberships
  FROM public.organization_members om
  WHERE om.user_id = target_user_id;

  IF remaining_memberships > 0 THEN
    SELECT om.organization_id, om.role
    INTO fallback_org, fallback_role
    FROM public.organization_members om
    WHERE om.user_id = target_user_id
    ORDER BY om.is_default DESC, om.created_at ASC
    LIMIT 1;

    UPDATE public.profiles
    SET organization_id = fallback_org,
        role = COALESCE(fallback_role, 'community'),
        team_lead_id = NULL,
        assigned_lead_ids = '{}'::uuid[],
        updated_at = now()
    WHERE id = target_user_id;

    RETURN json_build_object(
      'success', true,
      'level', 'member_delete',
      'message', 'Miembro removido de la organizacion. La cuenta se conserva por pertenecer a otras organizaciones.',
      'delete_auth_user', false,
      'remaining_memberships', remaining_memberships
    );
  END IF;

  -- No memberships left: remove profile and let edge function delete auth user.
  DELETE FROM public.profiles WHERE id = target_user_id;

  RETURN json_build_object(
    'success', true,
    'level', 'member_delete',
    'message', 'Miembro eliminado completamente (sin organizaciones restantes).',
    'delete_auth_user', true,
    'auth_user_id', target_user_id,
    'remaining_memberships', 0
  );
END;
$$;

COMMENT ON FUNCTION public.delete_team_member_data(uuid, uuid, uuid) IS
  'Level 2 multi-org aware deletion. Removes org membership; deletes auth account only if user has no memberships left.';

-- Level 3 (organization delete): delete org data and org record, never delete auth users.
CREATE OR REPLACE FUNCTION public.delete_organization_data(
  requesting_user_id uuid,
  target_org_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  creator_id uuid;
  org_name text;
  counts json;
  msg_count int;
  conv_count int;
  contact_count int;
  member_count int;
BEGIN
  SELECT public.get_org_creator_id(target_org_id) INTO creator_id;

  IF requesting_user_id <> creator_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'FORBIDDEN',
      'message', 'Solo el administrador creador puede eliminar toda la organizacion'
    );
  END IF;

  SELECT name INTO org_name FROM public.organizations WHERE id = target_org_id;

  SELECT COUNT(*) INTO msg_count FROM public.messages WHERE organization_id = target_org_id;
  SELECT COUNT(*) INTO conv_count FROM public.conversations WHERE organization_id = target_org_id;
  SELECT COUNT(*) INTO contact_count FROM public.crm_contacts WHERE organization_id = target_org_id;
  SELECT COUNT(*) INTO member_count FROM public.organization_members WHERE organization_id = target_org_id;

  -- Repoint active profile org for users whose active org is being deleted.
  WITH affected AS (
    SELECT p.id AS user_id
    FROM public.profiles p
    WHERE p.organization_id = target_org_id
  ),
  fallback AS (
    SELECT
      a.user_id,
      (
        SELECT om.organization_id
        FROM public.organization_members om
        WHERE om.user_id = a.user_id
          AND om.organization_id <> target_org_id
        ORDER BY om.is_default DESC, om.created_at ASC
        LIMIT 1
      ) AS fallback_org,
      (
        SELECT om.role
        FROM public.organization_members om
        WHERE om.user_id = a.user_id
          AND om.organization_id <> target_org_id
        ORDER BY om.is_default DESC, om.created_at ASC
        LIMIT 1
      ) AS fallback_role
    FROM affected a
  )
  UPDATE public.profiles p
  SET organization_id = f.fallback_org,
      role = COALESCE(f.fallback_role, 'community'),
      team_lead_id = NULL,
      assigned_lead_ids = '{}'::uuid[],
      updated_at = now()
  FROM fallback f
  WHERE p.id = f.user_id;

  -- Explicit cleanup (order matters with some FK chains)
  DELETE FROM public.workflow_enrollments WHERE organization_id = target_org_id;
  DELETE FROM public.workflow_steps WHERE workflow_id IN (SELECT id FROM public.workflows WHERE organization_id = target_org_id);
  DELETE FROM public.workflows WHERE organization_id = target_org_id;

  DELETE FROM public.campaigns WHERE organization_id = target_org_id;
  DELETE FROM public.lists WHERE organization_id = target_org_id;

  DELETE FROM public.scheduled_notifications WHERE organization_id = target_org_id;

  DELETE FROM public.api_endpoint_configs WHERE organization_id = target_org_id;
  DELETE FROM public.api_keys WHERE organization_id = target_org_id;

  DELETE FROM public.webhook_logs
  WHERE payload::text LIKE '%' || target_org_id::text || '%';

  DELETE FROM public.message_statuses WHERE organization_id = target_org_id;
  DELETE FROM public.notes WHERE conversation_id IN (SELECT id FROM public.conversations WHERE organization_id = target_org_id);
  DELETE FROM public.messages WHERE organization_id = target_org_id;

  DELETE FROM public.conversations WHERE organization_id = target_org_id;

  DELETE FROM public.user_assigned_leads WHERE organization_id = target_org_id;
  DELETE FROM public.crm_contacts WHERE organization_id = target_org_id;
  DELETE FROM public.crm_property_definitions WHERE organization_id = target_org_id;

  DELETE FROM public.team_members_hierarchy WHERE organization_id = target_org_id;
  DELETE FROM public.tasks WHERE organization_id = target_org_id;

  DELETE FROM public.meta_templates WHERE organization_id = target_org_id;
  DELETE FROM public.snippets WHERE organization_id = target_org_id;

  DELETE FROM public.integration_settings WHERE organization_id = target_org_id;
  DELETE FROM public.whatsapp_phone_numbers WHERE organization_id = target_org_id;

  -- Do NOT delete profiles/auth users in level 3.
  -- organization_members rows for this org are removed by FK ON DELETE CASCADE.
  DELETE FROM public.organizations WHERE id = target_org_id;

  counts := json_build_object(
    'messages_deleted', msg_count,
    'conversations_deleted', conv_count,
    'contacts_deleted', contact_count,
    'memberships_deleted', member_count
  );

  RETURN json_build_object(
    'success', true,
    'level', 'organization_delete',
    'organization_name', org_name,
    'organization_id', target_org_id,
    'counts', counts,
    'message', 'La organizacion y sus datos fueron eliminados. Ninguna cuenta de usuario fue eliminada.'
  );
END;
$$;

COMMENT ON FUNCTION public.delete_organization_data(uuid, uuid) IS
  'Level 3 multi-org safe deletion. Deletes organization data and organization only; never deletes auth users.';

-- Update preview to reflect memberships in multi-org mode.
CREATE OR REPLACE FUNCTION public.preview_organization_deletion(
  requesting_user_id UUID,
  target_org_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  creator_id UUID;
  result JSON;
BEGIN
  SELECT public.get_org_creator_id(target_org_id) INTO creator_id;

  IF requesting_user_id != creator_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'FORBIDDEN',
      'message', 'Solo el administrador creador puede ver esta informacion'
    );
  END IF;

  SELECT json_build_object(
    'success', true,
    'organization', (SELECT json_build_object('id', id, 'name', name) FROM public.organizations WHERE id = target_org_id),
    'counts', json_build_object(
      'profiles_with_active_org', (SELECT COUNT(*) FROM public.profiles WHERE organization_id = target_org_id),
      'organization_memberships', (SELECT COUNT(*) FROM public.organization_members WHERE organization_id = target_org_id),
      'conversations', (SELECT COUNT(*) FROM public.conversations WHERE organization_id = target_org_id),
      'messages', (SELECT COUNT(*) FROM public.messages WHERE organization_id = target_org_id),
      'crm_contacts', (SELECT COUNT(*) FROM public.crm_contacts WHERE organization_id = target_org_id),
      'tasks', (SELECT COUNT(*) FROM public.tasks WHERE organization_id = target_org_id),
      'campaigns', (SELECT COUNT(*) FROM public.campaigns WHERE organization_id = target_org_id),
      'workflows', (SELECT COUNT(*) FROM public.workflows WHERE organization_id = target_org_id),
      'templates', (SELECT COUNT(*) FROM public.meta_templates WHERE organization_id = target_org_id),
      'snippets', (SELECT COUNT(*) FROM public.snippets WHERE organization_id = target_org_id),
      'api_keys', (SELECT COUNT(*) FROM public.api_keys WHERE organization_id = target_org_id),
      'lists', (SELECT COUNT(*) FROM public.lists WHERE organization_id = target_org_id),
      'integration_settings', (SELECT COUNT(*) FROM public.integration_settings WHERE organization_id = target_org_id),
      'whatsapp_phone_numbers', (SELECT COUNT(*) FROM public.whatsapp_phone_numbers WHERE organization_id = target_org_id),
      'notes', (SELECT COUNT(*) FROM public.notes WHERE conversation_id IN (SELECT id FROM public.conversations WHERE organization_id = target_org_id)),
      'scheduled_notifications', (SELECT COUNT(*) FROM public.scheduled_notifications WHERE organization_id = target_org_id),
      'workflow_enrollments', (SELECT COUNT(*) FROM public.workflow_enrollments WHERE organization_id = target_org_id),
      'message_statuses', (SELECT COUNT(*) FROM public.message_statuses WHERE organization_id = target_org_id),
      'team_hierarchy', (SELECT COUNT(*) FROM public.team_members_hierarchy WHERE organization_id = target_org_id),
      'lead_assignments', (SELECT COUNT(*) FROM public.user_assigned_leads WHERE organization_id = target_org_id)
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

COMMENT ON FUNCTION public.preview_organization_deletion(UUID, UUID) IS
  'Preview for multi-org safe deletion. Includes memberships and whether members belong to other organizations.';
