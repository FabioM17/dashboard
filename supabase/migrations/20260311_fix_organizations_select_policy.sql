-- Fix: The SELECT policy on organizations only allowed viewing the active org
-- (profiles.organization_id), so when a user had multiple orgs and switched to one,
-- the others appeared as "Sin nombre" because the embedded join couldn't read their names.
-- Solution: allow viewing ALL orgs where the user has a membership.

DROP POLICY IF EXISTS "Users can view their organization details" ON "public"."organizations";

CREATE POLICY "Users can view their organization details"
ON "public"."organizations"
FOR SELECT
USING (
  "id" IN (SELECT public.get_my_org_ids())
);
