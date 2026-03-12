-- Migration: Create pipeline_stages table
-- Date: 2026-03-12
-- Stores CRM pipeline stage definitions per organization.
-- Each org can fully customize its stages (add, rename, reorder, delete).
-- The stage `id` is a text key that maps directly to crm_contacts.pipeline_stage.

-- 1. Create table
CREATE TABLE IF NOT EXISTS "public"."pipeline_stages" (
    "id"              "text"                         NOT NULL,
    "organization_id" "uuid"                         NOT NULL,
    "name"            "text"                         NOT NULL,
    "color"           "text"  DEFAULT 'bg-slate-500' NOT NULL,
    "position"        integer DEFAULT 0              NOT NULL,
    "created_at"      timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id", "organization_id"),
    CONSTRAINT "pipeline_stages_org_fkey"
        FOREIGN KEY ("organization_id")
        REFERENCES "public"."organizations"("id")
        ON DELETE CASCADE
);

COMMENT ON TABLE "public"."pipeline_stages" IS
    'Custom CRM pipeline stages per organization. id matches crm_contacts.pipeline_stage.';
COMMENT ON COLUMN "public"."pipeline_stages"."id" IS
    'Text key used as crm_contacts.pipeline_stage value (e.g. ''lead'', ''contacted'', ''qualified'', ''closed'').';
COMMENT ON COLUMN "public"."pipeline_stages"."position" IS
    'Display order for columns in the kanban board (ascending).';

-- 2. Index for fast lookups by org
CREATE INDEX IF NOT EXISTS "idx_pipeline_stages_org"
    ON "public"."pipeline_stages" ("organization_id", "position");

-- 3. Seed default stages for every existing organization
INSERT INTO "public"."pipeline_stages" ("id", "organization_id", "name", "color", "position")
SELECT stage.id, org.id, stage.name, stage.color, stage.position
FROM "public"."organizations" org
CROSS JOIN (
    VALUES
        ('lead',      'New Lead',    'bg-blue-500',   0),
        ('contacted', 'Contacted',   'bg-yellow-500', 1),
        ('qualified', 'Qualified',   'bg-purple-500', 2),
        ('closed',    'Closed Won',  'bg-green-500',  3)
) AS stage(id, name, color, position)
ON CONFLICT DO NOTHING;

-- 4. RLS
ALTER TABLE "public"."pipeline_stages" ENABLE ROW LEVEL SECURITY;

-- All members of the org can read stages
CREATE POLICY "Members can view their org pipeline stages"
    ON "public"."pipeline_stages"
    FOR SELECT
    USING (organization_id = "public"."get_my_org_id"());

-- Only admins can manage (insert / update / delete) stages
CREATE POLICY "Admins can manage org pipeline stages"
    ON "public"."pipeline_stages"
    FOR ALL
    USING (
        organization_id = "public"."get_my_org_id"()
        AND EXISTS (
            SELECT 1
            FROM "public"."org_members" om
            WHERE om.organization_id = "public"."get_my_org_id"()
              AND om.user_id = auth.uid()
              AND om.role = 'admin'
        )
    );
