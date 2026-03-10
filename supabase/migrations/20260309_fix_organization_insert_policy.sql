-- Fix and improve RLS policy for creating organizations.
-- Goal:
-- 1) Only "creator admins" can create additional organizations.
-- 2) Invited admins cannot create organizations.
-- 3) Add configurable per-user quota for creator admins.

-- Add created_by field to track organization creators.
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON public.organizations(created_by);

-- Backfill existing data with a best-effort creator assignment.
UPDATE public.organizations o
SET created_by = (
  SELECT om.user_id
  FROM public.organization_members om
  WHERE om.organization_id = o.id
    AND om.role = 'admin'
    AND om.is_default = true
  LIMIT 1
)
WHERE o.created_by IS NULL;

-- Quota table: one row per creator admin.
-- max_organizations is designed to be controlled later by package/subscription logic.
CREATE TABLE IF NOT EXISTS public.creator_org_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  max_organizations integer NOT NULL DEFAULT 1 CHECK (max_organizations > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_org_limits ENABLE ROW LEVEL SECURITY;

-- Users can read only their own quota row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'creator_org_limits'
      AND policyname = 'Users can view own creator quota'
  ) THEN
    CREATE POLICY "Users can view own creator quota"
      ON public.creator_org_limits
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Keep updated_at fresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_creator_org_limits_updated_at'
      AND tgrelid = 'public.creator_org_limits'::regclass
  ) THEN
    CREATE TRIGGER set_creator_org_limits_updated_at
      BEFORE UPDATE ON public.creator_org_limits
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Returns current creator quota status for a user.
CREATE OR REPLACE FUNCTION public.get_creator_org_limit_status(p_user_id uuid)
RETURNS TABLE (
  created_count integer,
  max_organizations integer,
  remaining_slots integer,
  can_create boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
    SELECT COALESCE((
      SELECT col.max_organizations
      FROM public.creator_org_limits col
      WHERE col.user_id = p_user_id
    ), 1) AS max_allowed
  )
  SELECT
    co.count_created AS created_count,
    lr.max_allowed AS max_organizations,
    GREATEST(lr.max_allowed - co.count_created, 0) AS remaining_slots,
    (
      -- First org allowed only for users with no memberships.
      (co.count_created = 0 AND um.has_membership = false)
      OR
      -- Additional orgs allowed only for creator admins under limit.
      (co.count_created > 0 AND co.count_created < lr.max_allowed)
    ) AS can_create
  FROM created_orgs co
  CROSS JOIN limit_row lr
  CROSS JOIN user_membership um;
$$;

GRANT EXECUTE ON FUNCTION public.get_creator_org_limit_status(uuid) TO authenticated;

-- Convenience wrapper for RLS checks on current user.
CREATE OR REPLACE FUNCTION public.can_current_user_create_organization()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT s.can_create
    FROM public.get_creator_org_limit_status(auth.uid()) s
  ), false);
$$;

GRANT EXECUTE ON FUNCTION public.can_current_user_create_organization() TO authenticated;

-- Replace old policies.
DROP POLICY IF EXISTS "Only admins can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Only creator admins can create organizations" ON public.organizations;

-- New policy:
-- 1) created_by must be the current user.
-- 2) User must satisfy creator + quota rules.
CREATE POLICY "Only creator admins can create organizations"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.can_current_user_create_organization()
);
