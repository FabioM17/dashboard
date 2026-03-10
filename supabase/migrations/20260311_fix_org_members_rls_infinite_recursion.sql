-- Fix infinite recursion in "Users can view org co-members" RLS policy
-- The policy queries organization_members inside a policy on organization_members → infinite recursion
-- Fix: use a SECURITY DEFINER function that bypasses RLS to get the user's org IDs

-- Step 1: Create a helper function that returns org IDs for current user (bypasses RLS)
CREATE OR REPLACE FUNCTION "public"."get_my_org_ids"()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = auth.uid();
$$;

ALTER FUNCTION "public"."get_my_org_ids"() OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_org_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_my_org_ids"() TO "anon";

-- Step 2: Drop the recursive policy and recreate it using the function
DROP POLICY IF EXISTS "Users can view org co-members" ON "public"."organization_members";

CREATE POLICY "Users can view org co-members"
ON "public"."organization_members"
FOR SELECT
USING (
  organization_id IN (SELECT public.get_my_org_ids())
);
