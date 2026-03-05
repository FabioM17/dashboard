-- ============================================================================
-- FIX: delete_team_member_data text/uuid mismatch + preserve assignment history
-- Date: 2026-03-01
--
-- Root cause:
--   messages.sender_id is TEXT, but deletion functions compared it with UUID,
--   causing: operator does not exist: text = uuid (code 42883)
--
-- This migration:
--   1) Casts target_user_id to text when matching messages.sender_id
--   2) Preserves operational history on member deletion by:
--      - unassigning tasks instead of deleting them
--      - anonymizing notes instead of deleting them
--      - anonymizing messages instead of deleting them
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
  UPDATE profiles
  SET 
    full_name = 'Usuario Eliminado',
    email = 'deleted_' || target_user_id || '@removed.local',
    avatar_url = NULL,
    phone = NULL,
    updated_at = NOW()
  WHERE id = target_user_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  DELETE FROM team_members_hierarchy WHERE manager_id = target_user_id OR member_id = target_user_id;
  DELETE FROM user_assigned_leads WHERE user_id = target_user_id OR assigned_by = target_user_id;

  UPDATE conversations SET assigned_to = NULL WHERE assigned_to = target_user_id;
  UPDATE tasks SET assignee_id = NULL WHERE assignee_id = target_user_id;

  UPDATE notes SET author_id = '00000000-0000-0000-0000-000000000000' WHERE author_id = target_user_id;

  UPDATE messages
  SET sender_id = '00000000-0000-0000-0000-000000000000'
  WHERE sender_id = target_user_id::text;

  result := json_build_object(
    'success', true,
    'level', 'anonymize',
    'user_id', target_user_id,
    'message', 'Datos personales anonimizados exitosamente'
  );

  RETURN result;
END;
$$;


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
  SELECT public.get_org_creator_id(target_org_id) INTO creator_id;

  IF requesting_user_id != creator_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'FORBIDDEN',
      'message', 'Solo el administrador creador de la organización puede eliminar miembros'
    );
  END IF;

  IF requesting_user_id = target_user_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'SELF_DELETE',
      'message', 'No puedes eliminar tu propia cuenta con esta función. Usa la eliminación completa de organización.'
    );
  END IF;

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

  IF target_user_id = creator_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROTECTED',
      'message', 'No se puede eliminar al administrador creador de la organización'
    );
  END IF;

  DELETE FROM scheduled_notifications WHERE assignee_id = target_user_id;
  DELETE FROM user_assigned_leads WHERE user_id = target_user_id OR assigned_by = target_user_id;
  DELETE FROM team_members_hierarchy WHERE manager_id = target_user_id OR member_id = target_user_id;

  UPDATE conversations
  SET assigned_to = NULL
  WHERE assigned_to = target_user_id AND organization_id = target_org_id;

  UPDATE tasks
  SET assignee_id = NULL
  WHERE assignee_id = target_user_id AND organization_id = target_org_id;

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
  WHERE sender_id = target_user_id::text AND organization_id = target_org_id;

  DELETE FROM profiles WHERE id = target_user_id;

  result := json_build_object(
    'success', true,
    'level', 'member_delete',
    'user_id', target_user_id,
    'message', 'Datos del miembro eliminados exitosamente. La cuenta de autenticación será eliminada por el servidor.'
  );

  RETURN result;
END;
$$;
