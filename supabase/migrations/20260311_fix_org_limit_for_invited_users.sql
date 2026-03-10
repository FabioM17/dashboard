-- Fix get_creator_org_limit_status so invited users (who already have a membership)
-- can create organizations IF they have an explicit entry in creator_org_limits.
--
-- Old logic: first org only allowed if user has NO memberships at all.
-- New logic: first org allowed if user has NO memberships OR has an explicit limit row.
--
-- This allows admins to "unlock" org creation for invited users by inserting a row
-- in creator_org_limits:
--   INSERT INTO creator_org_limits (user_id, max_organizations)
--   VALUES ('<user_id>', 1)
--   ON CONFLICT (user_id) DO UPDATE SET max_organizations = 1;

CREATE OR REPLACE FUNCTION "public"."get_creator_org_limit_status"("p_user_id" "uuid")
RETURNS TABLE(
  "created_count"     integer,
  "max_organizations" integer,
  "remaining_slots"   integer,
  "can_create"        boolean
)
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  WITH user_membership AS (
    SELECT EXISTS (
      SELECT 1 FROM public.organization_members om WHERE om.user_id = p_user_id
    ) AS has_membership
  ),
  created_orgs AS (
    SELECT COUNT(*)::integer AS count_created
    FROM public.organizations o
    WHERE o.created_by = p_user_id
  ),
  limit_row AS (
    SELECT
      COALESCE((
        SELECT col.max_organizations
        FROM public.creator_org_limits col
        WHERE col.user_id = p_user_id
      ), 1) AS max_allowed,
      EXISTS (
        SELECT 1 FROM public.creator_org_limits col WHERE col.user_id = p_user_id
      ) AS has_explicit_limit
  )
  SELECT
    co.count_created AS created_count,
    lr.max_allowed AS max_organizations,
    GREATEST(lr.max_allowed - co.count_created, 0) AS remaining_slots,
    (
      -- First org: allowed if user has no memberships (new user)
      -- OR if admin explicitly granted them a limit in creator_org_limits.
      (co.count_created = 0 AND (um.has_membership = false OR lr.has_explicit_limit = true))
      OR
      -- Additional orgs: allowed if they've already created at least one and are under limit.
      (co.count_created > 0 AND co.count_created < lr.max_allowed)
    ) AS can_create
  FROM created_orgs co
  CROSS JOIN limit_row lr
  CROSS JOIN user_membership um;
$$;

ALTER FUNCTION "public"."get_creator_org_limit_status"("p_user_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_creator_org_limit_status"("p_user_id" "uuid") IS
'Returns org creation quota for a user.
- New users (no memberships) can always create their first org.
- Invited users (already have memberships) can create orgs ONLY if an admin
  grants them an explicit entry in creator_org_limits.
- To unlock org creation for an invited user, run:
    INSERT INTO creator_org_limits (user_id, max_organizations)
    VALUES (''<user_uuid>'', 1)
    ON CONFLICT (user_id) DO UPDATE SET max_organizations = EXCLUDED.max_organizations;
- Users who already created an org can create more orgs if under their max limit.';
