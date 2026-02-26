-- ============================================================================
-- DATA DELETION FUNCTIONS
-- Provides multiple deletion levels for GDPR/Meta/Google compliance
-- Only the organization creator (first admin) can perform full org deletion
-- ============================================================================

-- Helper: Get the creator (first admin) of an organization
-- The creator is the admin whose profile was created first in the organization
CREATE OR REPLACE FUNCTION public.get_org_creator_id(org_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  creator_id UUID;
BEGIN
  SELECT id INTO creator_id
  FROM profiles
  WHERE organization_id = org_id
    AND role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1;

  RETURN creator_id;
END;
$$;

COMMENT ON FUNCTION public.get_org_creator_id(UUID) IS 
  'Returns the user ID of the organization creator (earliest admin profile).';

-- ============================================================================
-- LEVEL 1: Delete personal data only (anonymize profile)
-- Any user can request this for their own account
-- Keeps organizational data intact but removes PII
-- ============================================================================
CREATE OR REPLACE FUNCTION public.anonymize_user_data(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  affected_rows INT := 0;
  result JSON;
BEGIN
  -- Anonymize profile
  UPDATE profiles
  SET 
    full_name = 'Usuario Eliminado',
    email = 'deleted_' || target_user_id || '@removed.local',
    avatar_url = NULL,
    phone = NULL,
    updated_at = NOW()
  WHERE id = target_user_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  -- Remove from team hierarchy
  DELETE FROM team_members_hierarchy WHERE manager_id = target_user_id OR member_id = target_user_id;

  -- Remove lead assignments
  DELETE FROM user_assigned_leads WHERE user_id = target_user_id OR assigned_by = target_user_id;

  -- Unassign conversations
  UPDATE conversations SET assigned_to = NULL WHERE assigned_to = target_user_id;

  -- Unassign tasks
  UPDATE tasks SET assignee_id = NULL WHERE assignee_id = target_user_id;

  -- Anonymize authored notes
  UPDATE notes SET author_id = '00000000-0000-0000-0000-000000000000' WHERE author_id = target_user_id;

  -- Anonymize sent messages (keep content for conversation history)
  UPDATE messages SET sender_id = '00000000-0000-0000-0000-000000000000' WHERE sender_id = target_user_id;

  result := json_build_object(
    'success', true,
    'level', 'anonymize',
    'user_id', target_user_id,
    'message', 'Datos personales anonimizados exitosamente'
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.anonymize_user_data(UUID) IS 
  'Level 1: Anonymizes user personal data while keeping organizational data intact.';

-- ============================================================================
-- LEVEL 2: Delete a specific team member and all their data
-- Only the org creator admin can do this
-- Cannot delete the creator admin themselves via this function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_team_member_data(
  requesting_user_id UUID,
  target_user_id UUID,
  target_org_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  creator_id UUID;
  requesting_role TEXT;
  target_role TEXT;
  target_org UUID;
  result JSON;
BEGIN
  -- Get the org creator
  SELECT public.get_org_creator_id(target_org_id) INTO creator_id;

  -- Verify the requesting user is the org creator
  IF requesting_user_id != creator_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'FORBIDDEN',
      'message', 'Solo el administrador creador de la organización puede eliminar miembros'
    );
  END IF;

  -- Cannot delete yourself via this function
  IF requesting_user_id = target_user_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'SELF_DELETE',
      'message', 'No puedes eliminar tu propia cuenta con esta función. Usa la eliminación completa de organización.'
    );
  END IF;

  -- Verify target belongs to the same org
  SELECT organization_id, role INTO target_org, target_role
  FROM profiles
  WHERE id = target_user_id;

  IF target_org IS NULL OR target_org != target_org_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'NOT_FOUND',
      'message', 'El usuario no fue encontrado en esta organización'
    );
  END IF;

  -- Protect the org creator from being deleted by invited admins
  IF target_user_id = creator_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROTECTED',
      'message', 'No se puede eliminar al administrador creador de la organización'
    );
  END IF;

  -- Delete all data related to this team member:

  -- 1. Remove scheduled notifications
  DELETE FROM scheduled_notifications WHERE assignee_id = target_user_id;

  -- 2. Remove workflow enrollments created/assigned to user
  -- (enrollments are per-contact, not per-user, so we skip)

  -- 3. Remove lead assignments
  DELETE FROM user_assigned_leads WHERE user_id = target_user_id OR assigned_by = target_user_id;

  -- 4. Remove team hierarchy
  DELETE FROM team_members_hierarchy WHERE manager_id = target_user_id OR member_id = target_user_id;

  -- 5. Unassign conversations
  UPDATE conversations SET assigned_to = NULL WHERE assigned_to = target_user_id AND organization_id = target_org_id;

  -- 6. Remove tasks assigned to user
  DELETE FROM tasks WHERE assignee_id = target_user_id AND organization_id = target_org_id;

  -- 7. Remove notes authored by user
  DELETE FROM notes WHERE author_id = target_user_id;

  -- 8. Anonymize messages sent by user (keep conversation thread intact)
  UPDATE messages 
  SET sender_id = '00000000-0000-0000-0000-000000000000' 
  WHERE sender_id = target_user_id AND organization_id = target_org_id;

  -- 9. Delete profile (this is the main record)
  DELETE FROM profiles WHERE id = target_user_id;

  -- NOTE: The actual auth.users deletion must be done via Edge Function with service_role_key

  result := json_build_object(
    'success', true,
    'level', 'member_delete',
    'user_id', target_user_id,
    'message', 'Datos del miembro eliminados exitosamente. La cuenta de autenticación será eliminada por el servidor.'
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.delete_team_member_data(UUID, UUID, UUID) IS 
  'Level 2: Deletes all data for a specific team member. Only callable by org creator.';

-- ============================================================================
-- LEVEL 3: Delete ALL organization data (nuclear option)
-- Only the org creator can do this
-- Deletes everything: all members, all conversations, all CRM, all settings
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_organization_data(
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
  member_ids UUID[];
  org_name TEXT;
  counts JSON;
  msg_count INT;
  conv_count INT;
  contact_count INT;
  member_count INT;
BEGIN
  -- Get the org creator
  SELECT public.get_org_creator_id(target_org_id) INTO creator_id;

  -- Verify the requesting user is the org creator
  IF requesting_user_id != creator_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'FORBIDDEN',
      'message', 'Solo el administrador creador puede eliminar toda la organización'
    );
  END IF;

  -- Get org name for the response
  SELECT name INTO org_name FROM organizations WHERE id = target_org_id;

  -- Collect all member IDs for auth deletion later
  SELECT ARRAY_AGG(id) INTO member_ids FROM profiles WHERE organization_id = target_org_id;

  -- Count records for audit trail
  SELECT COUNT(*) INTO msg_count FROM messages WHERE organization_id = target_org_id;
  SELECT COUNT(*) INTO conv_count FROM conversations WHERE organization_id = target_org_id;
  SELECT COUNT(*) INTO contact_count FROM crm_contacts WHERE organization_id = target_org_id;
  SELECT COUNT(*) INTO member_count FROM profiles WHERE organization_id = target_org_id;

  -- ===== BEGIN CASCADING DELETION (order matters for FK constraints) =====

  -- 1. Workflow system
  DELETE FROM workflow_enrollments WHERE organization_id = target_org_id;
  DELETE FROM workflow_steps WHERE workflow_id IN (SELECT id FROM workflows WHERE organization_id = target_org_id);
  DELETE FROM workflows WHERE organization_id = target_org_id;

  -- 2. Campaigns & lists
  DELETE FROM campaigns WHERE organization_id = target_org_id;
  DELETE FROM lists WHERE organization_id = target_org_id;

  -- 3. Scheduled notifications
  DELETE FROM scheduled_notifications WHERE organization_id = target_org_id;

  -- 4. API & webhooks
  DELETE FROM api_endpoint_configs WHERE organization_id = target_org_id;
  DELETE FROM api_keys WHERE organization_id = target_org_id;
  DELETE FROM webhook_logs WHERE id IN (
    SELECT wl.id FROM webhook_logs wl 
    WHERE wl.payload::text LIKE '%' || target_org_id::text || '%'
  );

  -- 5. Messages & message statuses
  DELETE FROM message_statuses WHERE organization_id = target_org_id;
  DELETE FROM notes WHERE conversation_id IN (SELECT id FROM conversations WHERE organization_id = target_org_id);
  DELETE FROM messages WHERE organization_id = target_org_id;

  -- 6. Conversations
  DELETE FROM conversations WHERE organization_id = target_org_id;

  -- 7. CRM data
  DELETE FROM user_assigned_leads WHERE organization_id = target_org_id;
  DELETE FROM crm_contacts WHERE organization_id = target_org_id;
  DELETE FROM crm_property_definitions WHERE organization_id = target_org_id;

  -- 8. Team data
  DELETE FROM team_members_hierarchy WHERE organization_id = target_org_id;
  DELETE FROM tasks WHERE organization_id = target_org_id;

  -- 9. Templates & snippets
  DELETE FROM meta_templates WHERE organization_id = target_org_id;
  DELETE FROM snippets WHERE organization_id = target_org_id;

  -- 10. Integration settings
  DELETE FROM integration_settings WHERE organization_id = target_org_id;

  -- 11. All member profiles
  DELETE FROM profiles WHERE organization_id = target_org_id;

  -- 12. The organization itself
  DELETE FROM organizations WHERE id = target_org_id;

  -- Build result with audit counts
  counts := json_build_object(
    'messages_deleted', msg_count,
    'conversations_deleted', conv_count,
    'contacts_deleted', contact_count,
    'members_deleted', member_count
  );

  RETURN json_build_object(
    'success', true,
    'level', 'organization_delete',
    'organization_name', org_name,
    'organization_id', target_org_id,
    'member_ids', member_ids,
    'counts', counts,
    'message', 'Todos los datos de la organización han sido eliminados. Las cuentas de autenticación serán eliminadas por el servidor.'
  );
END;
$$;

COMMENT ON FUNCTION public.delete_organization_data(UUID, UUID) IS 
  'Level 3: Deletes ALL organization data including all members. Only callable by org creator. Returns member_ids for auth cleanup.';

-- ============================================================================
-- LEVEL 4: Get deletion preview (dry run)
-- Shows what would be deleted without actually deleting
-- ============================================================================
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
  -- Get the org creator
  SELECT public.get_org_creator_id(target_org_id) INTO creator_id;

  -- Verify the requesting user is the org creator
  IF requesting_user_id != creator_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'FORBIDDEN',
      'message', 'Solo el administrador creador puede ver esta información'
    );
  END IF;

  SELECT json_build_object(
    'success', true,
    'organization', (SELECT json_build_object('id', id, 'name', name) FROM organizations WHERE id = target_org_id),
    'counts', json_build_object(
      'profiles', (SELECT COUNT(*) FROM profiles WHERE organization_id = target_org_id),
      'conversations', (SELECT COUNT(*) FROM conversations WHERE organization_id = target_org_id),
      'messages', (SELECT COUNT(*) FROM messages WHERE organization_id = target_org_id),
      'crm_contacts', (SELECT COUNT(*) FROM crm_contacts WHERE organization_id = target_org_id),
      'tasks', (SELECT COUNT(*) FROM tasks WHERE organization_id = target_org_id),
      'campaigns', (SELECT COUNT(*) FROM campaigns WHERE organization_id = target_org_id),
      'workflows', (SELECT COUNT(*) FROM workflows WHERE organization_id = target_org_id),
      'templates', (SELECT COUNT(*) FROM meta_templates WHERE organization_id = target_org_id),
      'snippets', (SELECT COUNT(*) FROM snippets WHERE organization_id = target_org_id),
      'api_keys', (SELECT COUNT(*) FROM api_keys WHERE organization_id = target_org_id),
      'lists', (SELECT COUNT(*) FROM lists WHERE organization_id = target_org_id),
      'integration_settings', (SELECT COUNT(*) FROM integration_settings WHERE organization_id = target_org_id),
      'notes', (SELECT COUNT(*) FROM notes WHERE conversation_id IN (SELECT id FROM conversations WHERE organization_id = target_org_id)),
      'scheduled_notifications', (SELECT COUNT(*) FROM scheduled_notifications WHERE organization_id = target_org_id),
      'workflow_enrollments', (SELECT COUNT(*) FROM workflow_enrollments WHERE organization_id = target_org_id),
      'message_statuses', (SELECT COUNT(*) FROM message_statuses WHERE organization_id = target_org_id),
      'team_hierarchy', (SELECT COUNT(*) FROM team_members_hierarchy WHERE organization_id = target_org_id),
      'lead_assignments', (SELECT COUNT(*) FROM user_assigned_leads WHERE organization_id = target_org_id)
    ),
    'members', (
      SELECT json_agg(json_build_object(
        'id', p.id,
        'name', p.full_name,
        'email', p.email,
        'role', p.role,
        'is_creator', p.id = creator_id
      ))
      FROM profiles p
      WHERE p.organization_id = target_org_id
    )
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.preview_organization_deletion(UUID, UUID) IS 
  'Preview what would be deleted if the organization is fully removed. Dry-run only.';
