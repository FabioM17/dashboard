-- Fix: profiles_select_admin_org only allowed reading profiles WHERE profiles.organization_id
-- matches the admin's active org. This broke after multi-org support because a user added from
-- another org still has their original org in profiles.organization_id.
-- Solution: also allow reading profiles of users who share an org membership with the current user.

DROP POLICY IF EXISTS "profiles_select_admin_org" ON "public"."profiles";

-- Admins (and any member) can read profiles of co-members across all shared orgs.
CREATE POLICY "profiles_select_org_members"
ON "public"."profiles"
FOR SELECT
USING (
  "id" IN (
    SELECT om.user_id
    FROM public.organization_members om
    WHERE om.organization_id IN (SELECT public.get_my_org_ids())
  )
);
