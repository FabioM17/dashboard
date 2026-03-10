-- Multi-org hardening migration
-- Purpose:
-- 1) Fix organization_members RLS policies that can become permissive due ambiguous references.
-- 2) Prevent self role-escalation via UPDATE on organization_members.
-- 3) Resolve current role from active membership first (fallback to profiles.role).
-- 4) Enforce one default membership per user.

-- 1) Enforce only one default organization per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_one_default_per_user
  ON public.organization_members (user_id)
  WHERE is_default = true;

-- 2) Recreate membership policies with explicit row references.
DROP POLICY IF EXISTS "Admins can add members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins can update members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins can remove members" ON public.organization_members;

-- Insert: org admins can invite/add members; user can add self membership (needed for org creation flow).
CREATE POLICY "Admins can add members"
  ON public.organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members admin_mem
      WHERE admin_mem.user_id = auth.uid()
        AND admin_mem.organization_id = organization_members.organization_id
        AND admin_mem.role = 'admin'
    )
    OR auth.uid() = organization_members.user_id
  );

-- Update: only org admins can change membership rows.
-- This removes self-update to avoid role/team escalation by non-admin users.
CREATE POLICY "Admins can update members"
  ON public.organization_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members admin_mem
      WHERE admin_mem.user_id = auth.uid()
        AND admin_mem.organization_id = organization_members.organization_id
        AND admin_mem.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members admin_mem
      WHERE admin_mem.user_id = auth.uid()
        AND admin_mem.organization_id = organization_members.organization_id
        AND admin_mem.role = 'admin'
    )
  );

-- Delete: only org admins can remove memberships.
CREATE POLICY "Admins can remove members"
  ON public.organization_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members admin_mem
      WHERE admin_mem.user_id = auth.uid()
        AND admin_mem.organization_id = organization_members.organization_id
        AND admin_mem.role = 'admin'
    )
  );

-- 3) Make active role resolution membership-first.
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT COALESCE(
    (
      SELECT om.role
      FROM public.organization_members om
      JOIN public.profiles p
        ON p.id = auth.uid()
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p.organization_id
      LIMIT 1
    ),
    (
      SELECT p.role
      FROM public.profiles p
      WHERE p.id = auth.uid()
    )
  );
$$;

COMMENT ON FUNCTION public.get_current_user_role() IS
  'Returns active role for auth.uid() from organization_members using profiles.organization_id as active org; falls back to profiles.role for legacy rows.';
