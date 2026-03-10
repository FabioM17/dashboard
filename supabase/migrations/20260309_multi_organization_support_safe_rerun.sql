-- Safe re-run SQL for multi-organization support
-- This script is idempotent and can be executed multiple times.

CREATE TABLE IF NOT EXISTS public.organization_members (
    id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role text NOT NULL DEFAULT 'community',
    team_lead_id uuid,
    assigned_lead_ids uuid[] DEFAULT '{}'::uuid[],
    is_default boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_members_user_org_unique'
      AND conrelid = 'public.organization_members'::regclass
  ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_user_org_unique UNIQUE (user_id, organization_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_members_role_check'
      AND conrelid = 'public.organization_members'::regclass
  ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_role_check
      CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'community'::text]));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_members_user_id_fkey'
      AND conrelid = 'public.organization_members'::regclass
  ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_members_organization_id_fkey'
      AND conrelid = 'public.organization_members'::regclass
  ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_organization_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user_org ON public.organization_members(user_id, organization_id);

INSERT INTO public.organization_members (user_id, organization_id, role, team_lead_id, assigned_lead_ids, is_default)
SELECT p.id, p.organization_id, p.role, p.team_lead_id, p.assigned_lead_ids, true
FROM public.profiles p
WHERE p.organization_id IS NOT NULL
ON CONFLICT (user_id, organization_id) DO NOTHING;

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND policyname = 'Users can view own memberships'
  ) THEN
    CREATE POLICY "Users can view own memberships"
      ON public.organization_members
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND policyname = 'Users can view org co-members'
  ) THEN
    CREATE POLICY "Users can view org co-members"
      ON public.organization_members
      FOR SELECT
      USING (
        organization_id IN (
          SELECT om.organization_id
          FROM public.organization_members om
          WHERE om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND policyname = 'Admins can add members'
  ) THEN
    CREATE POLICY "Admins can add members"
      ON public.organization_members
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.user_id = auth.uid()
            AND om.organization_id = organization_id
            AND om.role = 'admin'
        )
        OR auth.uid() = user_id
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND policyname = 'Admins can update members'
  ) THEN
    CREATE POLICY "Admins can update members"
      ON public.organization_members
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.user_id = auth.uid()
            AND om.organization_id = organization_id
            AND om.role = 'admin'
        )
        OR auth.uid() = user_id
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND policyname = 'Admins can remove members'
  ) THEN
    CREATE POLICY "Admins can remove members"
      ON public.organization_members
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.user_id = auth.uid()
            AND om.organization_id = organization_id
            AND om.role = 'admin'
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.switch_organization(target_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  UPDATE public.profiles
  SET organization_id = target_org_id,
      role = membership.role,
      team_lead_id = membership.team_lead_id,
      assigned_lead_ids = membership.assigned_lead_ids,
      updated_at = now()
  WHERE id = auth.uid();

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
