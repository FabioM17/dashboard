-- Fix switch_organization function - remove updates to deleted columns (role, team_lead_id, assigned_lead_ids)
-- These columns are no longer in profiles table; they are now managed exclusively in organization_members

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

  -- Update ONLY organization_id in profiles (role/team_lead_id/assigned_lead_ids now managed in organization_members)
  UPDATE public.profiles
  SET organization_id = target_org_id,
      updated_at = now()
  WHERE id = auth.uid();

  -- Mark this org as default
  UPDATE public.organization_members
  SET is_default = (organization_id = target_org_id)
  WHERE user_id = auth.uid();

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', target_org_id,
    'role', membership.role
  );
END;
$$;

ALTER FUNCTION "public"."switch_organization"("target_org_id" "uuid") OWNER TO "postgres";

-- Add comment explaining the function behavior
COMMENT ON FUNCTION "public"."switch_organization"("target_org_id" "uuid") IS 'Switches user active organization. Updates profiles.organization_id to target org. Role, team_lead_id, and assigned_lead_ids are now exclusively managed in organization_members table.';
