-- =============================================================
-- Migration: Fix community role RLS issues
-- 1. Add missing RLS policies for user_assigned_leads table
--    (causes 403 on INSERT when assigning contacts to community users)
-- 2. Restrict "View org conversations" and "View org contacts"
--    to exclude community users, so they only see their assigned items
-- =============================================================

-- ---------------------------------------------------------------
-- FIX 1: RLS policies for user_assigned_leads
-- The table has RLS enabled but NO policies defined, so all DML
-- from the authenticated client returns 403 Forbidden.
-- ---------------------------------------------------------------

-- SELECT: admins/managers see all assignments in their org;
--         community users can only see their own assignments.
CREATE POLICY "user_assigned_leads_select"
  ON public.user_assigned_leads
  FOR SELECT
  USING (
    organization_id = public.get_current_user_org_id()
    AND (
      public.get_current_user_role() IN ('admin', 'manager')
      OR user_id = auth.uid()
    )
  );

-- INSERT: only admins and managers can assign leads.
CREATE POLICY "user_assigned_leads_insert"
  ON public.user_assigned_leads
  FOR INSERT
  WITH CHECK (
    organization_id = public.get_current_user_org_id()
    AND public.get_current_user_role() IN ('admin', 'manager')
  );

-- DELETE: only admins and managers can remove assignments.
CREATE POLICY "user_assigned_leads_delete"
  ON public.user_assigned_leads
  FOR DELETE
  USING (
    organization_id = public.get_current_user_org_id()
    AND public.get_current_user_role() IN ('admin', 'manager')
  );

-- UPDATE: only admins and managers can update assignments.
CREATE POLICY "user_assigned_leads_update"
  ON public.user_assigned_leads
  FOR UPDATE
  USING (
    organization_id = public.get_current_user_org_id()
    AND public.get_current_user_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    organization_id = public.get_current_user_org_id()
    AND public.get_current_user_role() IN ('admin', 'manager')
  );

-- ---------------------------------------------------------------
-- FIX 2: Restrict broad org-wide SELECT policies to exclude
-- community role users. Community users must go through the
-- role-specific policies that filter by their assigned leads.
--
-- Previously, "View org conversations" and "View org contacts"
-- allowed ANY authenticated user in the org to see ALL records,
-- which bypassed the community-specific restrictions.
-- ---------------------------------------------------------------

-- Conversations: exclude community role from the catch-all policy
DROP POLICY IF EXISTS "View org conversations" ON public.conversations;
CREATE POLICY "View org conversations"
  ON public.conversations
  FOR SELECT
  USING (
    organization_id = public.get_auth_user_org_id()
    AND public.get_current_user_role() != 'community'
  );

-- CRM Contacts: exclude community role from the catch-all policy
DROP POLICY IF EXISTS "View org contacts" ON public.crm_contacts;
CREATE POLICY "View org contacts"
  ON public.crm_contacts
  FOR SELECT
  USING (
    organization_id = public.get_auth_user_org_id()
    AND public.get_current_user_role() != 'community'
  );
