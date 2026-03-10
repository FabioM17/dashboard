-- Two functions to support adding existing users to an organization:
-- 1. search_users_by_email: finds users by partial email match (excluding current org members)
-- 2. add_existing_member_to_org: adds an already-registered user as a member with a given role

-- Search users by email (partial match), excluding users already in the given org.
-- Returns public profile info only — no sensitive data.
CREATE OR REPLACE FUNCTION "public"."search_users_by_email"(
  "p_email_query" text,
  "p_organization_id" uuid
)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  avatar_url text
)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins of the org can search
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_members.user_id = auth.uid()
      AND organization_members.organization_id = p_organization_id
      AND organization_members.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only organization admins can search users';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.email,
    p.full_name,
    p.avatar_url
  FROM public.profiles p
  WHERE
    p.email ILIKE '%' || p_email_query || '%'
    AND p.id NOT IN (
      SELECT om.user_id FROM public.organization_members om
      WHERE om.organization_id = p_organization_id
    )
  ORDER BY p.email
  LIMIT 10;
END;
$$;

ALTER FUNCTION "public"."search_users_by_email"("p_email_query" text, "p_organization_id" uuid) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."search_users_by_email"("p_email_query" text, "p_organization_id" uuid) TO "authenticated";

COMMENT ON FUNCTION "public"."search_users_by_email"("p_email_query" text, "p_organization_id" uuid) IS
'Search existing users by partial email, excluding users already in the given org. Admin-only.';


-- Add an already-registered user to an organization with a given role.
CREATE OR REPLACE FUNCTION "public"."add_existing_member_to_org"(
  "p_target_user_id" uuid,
  "p_organization_id" uuid,
  "p_role" text DEFAULT 'community'
)
RETURNS json
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_profile profiles%ROWTYPE;
BEGIN
  -- Only admins of the org can add members
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_members.user_id = auth.uid()
      AND organization_members.organization_id = p_organization_id
      AND organization_members.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only organization admins can add members';
  END IF;

  -- Verify target user exists
  SELECT * INTO v_target_profile FROM public.profiles WHERE id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Check not already a member
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = p_target_user_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this organization';
  END IF;

  -- Validate role
  IF p_role NOT IN ('admin', 'manager', 'community') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  -- Insert membership
  INSERT INTO public.organization_members (user_id, organization_id, role, is_default)
  VALUES (p_target_user_id, p_organization_id, p_role, false);

  RETURN json_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'email', v_target_profile.email,
    'full_name', v_target_profile.full_name
  );
END;
$$;

ALTER FUNCTION "public"."add_existing_member_to_org"("p_target_user_id" uuid, "p_organization_id" uuid, "p_role" text) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."add_existing_member_to_org"("p_target_user_id" uuid, "p_organization_id" uuid, "p_role" text) TO "authenticated";

COMMENT ON FUNCTION "public"."add_existing_member_to_org"("p_target_user_id" uuid, "p_organization_id" uuid, "p_role" text) IS
'Adds an existing registered user to an organization. Admin-only. Does not send any email.';
