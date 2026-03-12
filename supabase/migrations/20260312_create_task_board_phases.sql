-- Migration: Create task_board_phases table
-- Date: 2026-03-12
-- Stores kanban phase/column definitions per organization.
-- Each org can fully customize its phases (add, rename, reorder, delete).
-- The phase `id` is a text key that maps directly to tasks.status,
-- preserving backward compatibility ('todo', 'in_progress', 'done').

-- 1. Create table
CREATE TABLE IF NOT EXISTS "public"."task_board_phases" (
    "id"              "text"                      NOT NULL,
    "organization_id" "uuid"                      NOT NULL,
    "label"           "text"                      NOT NULL,
    "color"           "text"  DEFAULT 'bg-slate-500' NOT NULL,
    "position"        integer DEFAULT 0            NOT NULL,
    "created_at"      timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "task_board_phases_pkey" PRIMARY KEY ("id", "organization_id"),
    CONSTRAINT "task_board_phases_org_fkey"
        FOREIGN KEY ("organization_id")
        REFERENCES "public"."organizations"("id")
        ON DELETE CASCADE
);

COMMENT ON TABLE "public"."task_board_phases" IS
    'Custom kanban phases per organization. id matches the text value stored in tasks.status.';
COMMENT ON COLUMN "public"."task_board_phases"."id" IS
    'Text key used as tasks.status value (e.g. ''todo'', ''in_progress'', ''done'', ''custom_xxx'').';
COMMENT ON COLUMN "public"."task_board_phases"."position" IS
    'Display order for columns in the kanban board (ascending).';

-- 2. Index for fast lookups by org
CREATE INDEX IF NOT EXISTS "idx_task_board_phases_org"
    ON "public"."task_board_phases" ("organization_id", "position");

-- 3. Drop the hardcoded CHECK constraint on tasks.status so custom phases work
ALTER TABLE "public"."tasks"
    DROP CONSTRAINT IF EXISTS "tasks_status_check";

-- 4. Seed default phases for every existing organization
INSERT INTO "public"."task_board_phases" ("id", "organization_id", "label", "color", "position")
SELECT phase.id, org.id, phase.label, phase.color, phase.position
FROM "public"."organizations" org
CROSS JOIN (
    VALUES
        ('todo',        'Pendiente',  'bg-slate-500', 0),
        ('in_progress', 'En Proceso', 'bg-blue-500',  1),
        ('done',        'Completado', 'bg-green-500', 2)
) AS phase(id, label, color, position)
ON CONFLICT DO NOTHING;

-- 5. RLS
ALTER TABLE "public"."task_board_phases" ENABLE ROW LEVEL SECURITY;

-- All members of the org can read phases
CREATE POLICY "Members can view their org phases"
    ON "public"."task_board_phases"
    FOR SELECT
    USING (organization_id = "public"."get_my_org_id"());

-- Only admins can manage (insert / update / delete) phases
CREATE POLICY "Admins can manage org phases"
    ON "public"."task_board_phases"
    FOR ALL
    USING (
        organization_id = "public"."get_my_org_id"()
        AND "public"."get_current_user_role"() = 'admin'
    );

-- 6. Grants
GRANT ALL ON TABLE "public"."task_board_phases" TO "anon";
GRANT ALL ON TABLE "public"."task_board_phases" TO "authenticated";
GRANT ALL ON TABLE "public"."task_board_phases" TO "service_role";
