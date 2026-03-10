/**
 * MIGRATION: 20260310_refactor_profiles_cleanup.sql
 * 
 * Refactoriza la tabla profiles eliminando columnas redundantes que ahora están
 * en organization_members:
 * - role (debería venir de organization_members según org activa)
 * - team_lead_id (solo en organization_members)
 * - assigned_lead_ids (solo en organization_members, también en user_assigned_leads)
 * 
 * Actualiza todas las funciones RPC y políticas RLS que dependían de estas columnas.
 */

-- ============================================================================
-- STEP 1: REMOVE RLS POLICIES that depend on profiles.role or profiles.team_lead_id
-- ============================================================================
DROP POLICY IF EXISTS "profiles_select_manager_team" ON "public"."profiles";
DROP POLICY IF EXISTS "Only admins can update organization details" ON "public"."organizations";
DROP POLICY IF EXISTS "Users can delete their own messages or admin can delete any" ON "public"."messages";
DROP POLICY IF EXISTS "admin_update_profiles" ON "public"."profiles";

-- ============================================================================
-- STEP 2: REMOVE FOREIGN KEY CONSTRAINTS referencing profiles.team_lead_id
-- ============================================================================
-- Drop FKs from tables that reference profiles.team_lead_id
ALTER TABLE "public"."profiles" DROP CONSTRAINT IF EXISTS "profiles_team_lead_id_fkey";
ALTER TABLE "public"."conversations" DROP CONSTRAINT IF EXISTS "conversations_team_lead_id_fkey";
ALTER TABLE "public"."crm_contacts" DROP CONSTRAINT IF EXISTS "crm_contacts_team_lead_id_fkey";
ALTER TABLE "public"."tasks" DROP CONSTRAINT IF EXISTS "tasks_team_lead_id_fkey";

-- ============================================================================
-- STEP 3: REMOVE INDEXES on profiles columns that will be deleted
-- ============================================================================
DROP INDEX IF EXISTS "public"."idx_profiles_team_lead_id";

-- ============================================================================
-- STEP 4: REMOVE REDUNDANT COLUMNS from profiles
-- ============================================================================
ALTER TABLE "public"."profiles" DROP COLUMN IF EXISTS "team_lead_id";
ALTER TABLE "public"."profiles" DROP COLUMN IF EXISTS "assigned_lead_ids";
ALTER TABLE "public"."profiles" DROP COLUMN IF EXISTS "role";

-- ============================================================================
-- STEP 5: UPDATE RPC: get_current_user_role()
-- ============================================================================
-- Cambiar para que obtenga el role de organization_members con fallback
-- Usar CREATE OR REPLACE para no romper dependencias de RLS policies
CREATE OR REPLACE FUNCTION "public"."get_current_user_role"() 
RETURNS "text"
LANGUAGE "sql" STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    -- Primero intentar obtener el role del organization_members para la org activa
    (
      SELECT om.role
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = (
          SELECT p.organization_id
          FROM public.profiles p
          WHERE p.id = auth.uid()
        )
      LIMIT 1
    ),
    -- Fallback: 'community' (role column en profiles se eliminó)
    'community'::text
  );
$$;

ALTER FUNCTION "public"."get_current_user_role"() OWNER TO "postgres";

-- ============================================================================
-- STEP 6: UPDATE RPC: preview_organization_deletion()
-- Cambiar para que obtenga role de organization_members en lugar de profiles
-- ============================================================================
DROP FUNCTION IF EXISTS "public"."preview_organization_deletion"("requesting_user_id" "uuid", "target_org_id" "uuid") CASCADE;

CREATE OR REPLACE FUNCTION "public"."preview_organization_deletion"("requesting_user_id" "uuid", "target_org_id" "uuid") 
RETURNS json
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

ALTER FUNCTION "public"."preview_organization_deletion"("requesting_user_id" "uuid", "target_org_id" "uuid") OWNER TO "postgres";

-- ============================================================================
-- STEP 7: UPDATE RPC: delete_organization_data()
-- Cambiar para que use organization_members.role en lugar de profiles.role
-- ============================================================================
DROP FUNCTION IF EXISTS "public"."delete_organization_data"("requesting_user_id" "uuid", "target_org_id" "uuid") CASCADE;

CREATE OR REPLACE FUNCTION "public"."delete_organization_data"("requesting_user_id" "uuid", "target_org_id" "uuid") 
RETURNS json
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  creator_id uuid;
  affected_count int := 0;
  profile_repoint_count int := 0;
  result JSON;
BEGIN
  SELECT public.get_org_creator_id(target_org_id) INTO creator_id;

  IF (requesting_user_id != creator_id) THEN
    RETURN json_build_object('error', 'Only org creator can delete organization', 'success', false);
  END IF;

  -- Identificar usuarios cuyo active org es esta
  WITH affected AS (
    SELECT DISTINCT p.id
    FROM public.profiles p
    WHERE p.organization_id = target_org_id
  ),
  fallback AS (
    SELECT
      a.id,
      (
        SELECT om.organization_id
        FROM public.organization_members om
        WHERE om.user_id = a.id
          AND om.organization_id <> target_org_id
        ORDER BY om.is_default DESC, om.created_at ASC
        LIMIT 1
      ) AS fallback_org
    FROM affected a
  )
  UPDATE public.profiles p
  SET organization_id = f.fallback_org,
      updated_at = now()
  FROM fallback f
  WHERE p.id = f.id;

  GET DIAGNOSTICS profile_repoint_count = ROW_COUNT;

  -- Eliminar organization_members
  DELETE FROM public.organization_members WHERE organization_id = target_org_id;

  -- Cascada: Todas las tablas con FK a organizations irán CASCADE
  DELETE FROM public.conversations WHERE organization_id = target_org_id;
  DELETE FROM public.messages WHERE organization_id = target_org_id;
  DELETE FROM public.message_statuses WHERE organization_id = target_org_id;
  DELETE FROM public.crm_contacts WHERE organization_id = target_org_id;
  DELETE FROM public.campaigns WHERE organization_id = target_org_id;
  DELETE FROM public.workflows WHERE organization_id = target_org_id;
  DELETE FROM public.workflow_enrollments WHERE organization_id = target_org_id;
  DELETE FROM public.workflow_steps WHERE workflow_id NOT IN (SELECT id FROM workflows);
  DELETE FROM public.lists WHERE organization_id = target_org_id;
  DELETE FROM public.snippets WHERE organization_id = target_org_id;
  DELETE FROM public.api_keys WHERE organization_id = target_org_id;
  DELETE FROM public.api_endpoint_configs WHERE organization_id = target_org_id;
  DELETE FROM public.integration_settings WHERE organization_id = target_org_id;
  DELETE FROM public.team_members_hierarchy WHERE organization_id = target_org_id;
  DELETE FROM public.user_assigned_leads WHERE organization_id = target_org_id;
  DELETE FROM public.scheduled_notifications WHERE organization_id = target_org_id;
  DELETE FROM public.crm_property_definitions WHERE organization_id = target_org_id;
  DELETE FROM public.whatsapp_phone_numbers WHERE organization_id = target_org_id;
  DELETE FROM public.meta_templates WHERE organization_id = target_org_id;

  -- NUNCA eliminar auth.users
  DELETE FROM public.organizations WHERE id = target_org_id;

  SELECT json_build_object(
    'success', true,
    'message', 'Organization deleted successfully',
    'profiles_repointed', profile_repoint_count,
    'members_removed', affected_count
  ) INTO result;

  RETURN result;
END;
$$;

ALTER FUNCTION "public"."delete_organization_data"("requesting_user_id" "uuid", "target_org_id" "uuid") OWNER TO "postgres";

-- ============================================================================
-- STEP 8: UPDATE RPC: delete_team_member_data()
-- Cambiar para que obtenga role de organization_members
-- ============================================================================
DROP FUNCTION IF EXISTS "public"."delete_team_member_data"("requesting_user_id" "uuid", "target_user_id" "uuid", "target_org_id" "uuid") CASCADE;

CREATE OR REPLACE FUNCTION "public"."delete_team_member_data"("requesting_user_id" "uuid", "target_user_id" "uuid", "target_org_id" "uuid") 
RETURNS json
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  creator_id uuid;
  member_role text;
  remaining_memberships int;
  should_delete_auth_user boolean := false;
  fallback_membership record;
  result JSON;
BEGIN
  SELECT public.get_org_creator_id(target_org_id) INTO creator_id;

  -- Solo creator puede eliminar miembros
  IF (requesting_user_id != creator_id) THEN
    RETURN json_build_object('error', 'Only org creator can delete members', 'success', false);
  END IF;

  -- Obtener el role del miembro en esta org
  SELECT om.role INTO member_role
  FROM public.organization_members om
  WHERE om.user_id = target_user_id
    AND om.organization_id = target_org_id;

  IF member_role IS NULL THEN
    RETURN json_build_object('error', 'User not found in organization', 'success', false);
  END IF;

  -- Contar membersías restantes
  SELECT COUNT(*) INTO remaining_memberships
  FROM public.organization_members
  WHERE user_id = target_user_id
    AND organization_id <> target_org_id;

  -- Si no hay más membersías, marcar para eliminar auth.users
  should_delete_auth_user := (remaining_memberships = 0);

  -- Eliminar membership
  DELETE FROM public.organization_members
  WHERE user_id = target_user_id
    AND organization_id = target_org_id;

  -- Si es la org activa de profiles, reapuntar
  IF (
    SELECT COUNT(*) FROM public.profiles
    WHERE id = target_user_id AND organization_id = target_org_id
  ) > 0 THEN
    -- Buscar fallback org
    SELECT * INTO fallback_membership
    FROM public.organization_members
    WHERE user_id = target_user_id
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1;

    IF fallback_membership IS NOT NULL THEN
      UPDATE public.profiles
      SET organization_id = fallback_membership.organization_id,
          updated_at = now()
      WHERE id = target_user_id;
    ELSE
      -- Sin fallback: reapuntar a NULL
      UPDATE public.profiles
      SET organization_id = NULL,
          updated_at = now()
      WHERE id = target_user_id;
    END IF;
  END IF;

  -- Limpiar asignaciones de leads específicas de esta org
  DELETE FROM public.user_assigned_leads
  WHERE user_id = target_user_id
    AND organization_id = target_org_id;

  SELECT json_build_object(
    'success', true,
    'message', 'Member deleted from organization',
    'user_id', target_user_id,
    'organization_id', target_org_id,
    'remaining_memberships', remaining_memberships,
    'delete_auth_user', should_delete_auth_user
  ) INTO result;

  RETURN result;
END;
$$;

ALTER FUNCTION "public"."delete_team_member_data"("requesting_user_id" "uuid", "target_user_id" "uuid", "target_org_id" "uuid") OWNER TO "postgres";

-- ============================================================================
-- STEP 9: UPDATE TABLE COMMENTS
-- ============================================================================
COMMENT ON TABLE "public"."profiles" IS 'Global user profile. Role and team data is per-organization in organization_members table.';

COMMENT ON COLUMN "public"."profiles"."organization_id" IS 'Active organization for this user. Role and team context comes from organization_members.';
