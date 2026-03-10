-- Create a SECURITY DEFINER RPC function to create organizations, bypassing RLS.
-- This avoids the fragile RLS policy chain:
--   INSERT RLS → can_current_user_create_organization() → get_creator_org_limit_status()
-- The function performs the permission check itself, then inserts directly.

CREATE OR REPLACE FUNCTION "public"."create_organization_for_user"(
  "p_name" text,
  "p_support_email" text DEFAULT NULL
)
RETURNS json
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_limit_status RECORD;
  v_new_org organizations%ROWTYPE;
BEGIN
  -- Verify authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate name
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Organization name cannot be empty';
  END IF;

  -- Check creator quota
  SELECT * INTO v_limit_status FROM public.get_creator_org_limit_status(v_user_id);
  IF NOT COALESCE(v_limit_status.can_create, false) THEN
    RAISE EXCEPTION 'Límite alcanzado: puedes crear hasta % organizaciones.', COALESCE(v_limit_status.max_organizations, 1);
  END IF;

  -- Insert organization (bypasses RLS since SECURITY DEFINER as postgres)
  INSERT INTO public.organizations (name, created_by, support_email)
  VALUES (trim(p_name), v_user_id, p_support_email)
  RETURNING * INTO v_new_org;

  -- Create admin membership for the creator
  INSERT INTO public.organization_members (user_id, organization_id, role, is_default)
  VALUES (v_user_id, v_new_org.id, 'admin', false)
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  RETURN row_to_json(v_new_org);
END;
$$;

ALTER FUNCTION "public"."create_organization_for_user"("p_name" text, "p_support_email" text) OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_organization_for_user"("p_name" text, "p_support_email" text) TO "authenticated";

COMMENT ON FUNCTION "public"."create_organization_for_user"("p_name" text, "p_support_email" text) IS
'Creates an organization for the current authenticated user. Performs quota check internally via get_creator_org_limit_status. Bypasses RLS as SECURITY DEFINER. Also creates admin membership for the creator.';
