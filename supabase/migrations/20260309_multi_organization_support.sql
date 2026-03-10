-- ============================================================================
-- MULTI-ORGANIZATION SUPPORT
-- Allows a single user account to belong to multiple organizations
-- ============================================================================

-- 1. Create organization_members table
CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role" "text" NOT NULL DEFAULT 'community'::"text",
    "team_lead_id" "uuid",
    "assigned_lead_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_members_user_org_unique" UNIQUE ("user_id", "organization_id"),
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'community'::"text"])))
);

ALTER TABLE "public"."organization_members" OWNER TO "postgres";

COMMENT ON TABLE "public"."organization_members" IS 'Membresías de usuarios en múltiples organizaciones. Cada usuario puede pertenecer a varias organizaciones con roles diferentes.';

-- 2. Add foreign keys
ALTER TABLE "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_organization_members_user_id" ON "public"."organization_members" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_organization_members_organization_id" ON "public"."organization_members" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_organization_members_user_org" ON "public"."organization_members" ("user_id", "organization_id");

-- 4. Populate organization_members from existing profiles data
-- This ensures all current users get a membership record for their current org
INSERT INTO "public"."organization_members" ("user_id", "organization_id", "role", "team_lead_id", "assigned_lead_ids", "is_default")
SELECT 
    p."id" AS "user_id",
    p."organization_id",
    p."role",
    p."team_lead_id",
    p."assigned_lead_ids",
    true AS "is_default"
FROM "public"."profiles" p
WHERE p."organization_id" IS NOT NULL
ON CONFLICT ("user_id", "organization_id") DO NOTHING;

-- 5. RLS Policies for organization_members
ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;

-- Users can see their own memberships
CREATE POLICY "Users can view own memberships"
    ON "public"."organization_members"
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can see other members in their organizations
CREATE POLICY "Users can view org co-members"
    ON "public"."organization_members"
    FOR SELECT
    USING (
        organization_id IN (
            SELECT om.organization_id FROM "public"."organization_members" om WHERE om.user_id = auth.uid()
        )
    );

-- Admins can insert new members to their organizations
CREATE POLICY "Admins can add members"
    ON "public"."organization_members"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."organization_members" om
            WHERE om.user_id = auth.uid()
              AND om.organization_id = organization_id
              AND om.role = 'admin'
        )
        OR auth.uid() = user_id -- Users can add themselves (for creating new orgs)
    );

-- Admins can update members in their organizations
CREATE POLICY "Admins can update members"
    ON "public"."organization_members"
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM "public"."organization_members" om
            WHERE om.user_id = auth.uid()
              AND om.organization_id = organization_id
              AND om.role = 'admin'
        )
        OR auth.uid() = user_id -- Users can update own membership (e.g. is_default)
    );

-- Admins can remove members from their organizations
CREATE POLICY "Admins can remove members"
    ON "public"."organization_members"
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM "public"."organization_members" om
            WHERE om.user_id = auth.uid()
              AND om.organization_id = organization_id
              AND om.role = 'admin'
        )
    );

-- 6. Function to switch active organization
-- Updates profiles.organization_id and profiles.role to match the membership
CREATE OR REPLACE FUNCTION "public"."switch_organization"("target_org_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
    membership RECORD;
    result JSONB;
BEGIN
    -- Verify the user has a membership in the target org
    SELECT * INTO membership
    FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = target_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User does not have access to this organization';
    END IF;

    -- Update profile to reflect active organization
    UPDATE profiles
    SET 
        organization_id = target_org_id,
        role = membership.role,
        team_lead_id = membership.team_lead_id,
        assigned_lead_ids = membership.assigned_lead_ids,
        updated_at = now()
    WHERE id = auth.uid();

    -- Mark this org as default, unmark others
    UPDATE organization_members
    SET is_default = (organization_id = target_org_id)
    WHERE user_id = auth.uid();

    result := jsonb_build_object(
        'success', true,
        'organization_id', target_org_id,
        'role', membership.role
    );

    RETURN result;
END;
$$;
