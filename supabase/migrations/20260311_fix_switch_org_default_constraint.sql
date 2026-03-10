-- Fix: switch_organization fails with 23505 duplicate key on idx_org_members_one_default_per_user
-- because the single UPDATE (SET is_default = organization_id = target) processes rows in
-- unspecified order, potentially setting the new true BEFORE clearing the old true.
-- Solution: two-step update - clear all first, then set the target.

CREATE OR REPLACE FUNCTION "public"."switch_organization"("target_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  membership RECORD;
BEGIN
  SELECT * INTO membership
  FROM public.organization_members
  WHERE user_id = auth.uid()
    AND organization_id = target_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User does not have access to this organization';
  END IF;

  -- Update ONLY organization_id in profiles
  UPDATE public.profiles
  SET organization_id = target_org_id,
      updated_at = now()
  WHERE id = auth.uid();

  -- Two-step update to avoid unique constraint violation on idx_org_members_one_default_per_user:
  -- Step 1: clear all defaults for this user
  UPDATE public.organization_members
  SET is_default = false
  WHERE user_id = auth.uid();

  -- Step 2: mark the target org as default
  UPDATE public.organization_members
  SET is_default = true
  WHERE user_id = auth.uid()
    AND organization_id = target_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', target_org_id,
    'role', membership.role
  );
END;
$$;

ALTER FUNCTION "public"."switch_organization"("target_org_id" "uuid") OWNER TO "postgres";
