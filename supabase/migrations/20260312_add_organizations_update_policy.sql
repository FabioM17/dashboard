-- Fix: No UPDATE policy existed on the organizations table.
-- Without this, any PATCH to organizations is silently blocked by RLS,
-- returning 204 with 0 rows affected (no error thrown by PostgREST).
-- This migration adds an UPDATE policy that allows org admins to edit their org.

DROP POLICY IF EXISTS "Only admins can update organization details" ON public.organizations;
DROP POLICY IF EXISTS "Org admins can update organization details" ON public.organizations;

CREATE POLICY "Org admins can update organization details"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.role = 'admin'
  )
);
