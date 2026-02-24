-- ============================================
-- SQL MIGRATION: Implementación de 3 Roles (Admin, Manager, Community)
-- ============================================

-- 1. ACTUALIZAR CONSTRAINT DE ROLES EN LA TABLA profiles
-- (Reemplazar la existente que solo tiene admin|agent|viewer)

ALTER TABLE "public"."profiles" 
DROP CONSTRAINT "profiles_role_check";

ALTER TABLE "public"."profiles" 
ADD CONSTRAINT "profiles_role_check" 
CHECK (("role" = ANY (ARRAY['admin'::text, 'manager'::text, 'community'::text])));

-- ============================================
-- 2. AGREGAR COLUMNAS NUEVAS A profiles PARA ROLES
-- ============================================

-- Team Lead ID (para Managers y su equipo)
ALTER TABLE "public"."profiles" 
ADD COLUMN IF NOT EXISTS "team_lead_id" uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

-- Assigned Lead IDs (para Community users - array de UUIDs)
ALTER TABLE "public"."profiles" 
ADD COLUMN IF NOT EXISTS "assigned_lead_ids" uuid[] DEFAULT '{}';

-- ============================================
-- 3. AGREGAR COLUMNAS NUEVAS A conversations PARA SOPORTAR ASIGNACIONES
-- ============================================

-- Team Lead assignment (para controlar qué manager supervisa)
ALTER TABLE "public"."conversations" 
ADD COLUMN IF NOT EXISTS "team_lead_id" uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

-- Lead ID para referencia rápida
ALTER TABLE "public"."conversations" 
ADD COLUMN IF NOT EXISTS "lead_id" uuid REFERENCES "public"."crm_contacts"("id") ON DELETE SET NULL;

-- ============================================
-- 4. AGREGAR COLUMNAS A crm_contacts PARA ASIGNACIÓN DE EQUIPO
-- ============================================

-- Team Lead ID (Manager responsable del contacto)
ALTER TABLE "public"."crm_contacts" 
ADD COLUMN IF NOT EXISTS "team_lead_id" uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

-- Asignado a Community user
ALTER TABLE "public"."crm_contacts" 
ADD COLUMN IF NOT EXISTS "assigned_to_user_id" uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

-- ============================================
-- 5. AGREGAR COLUMNAS A tasks PARA CONTROL DE EQUIPO
-- ============================================

ALTER TABLE "public"."tasks" 
ADD COLUMN IF NOT EXISTS "team_lead_id" uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE "public"."tasks" 
ADD COLUMN IF NOT EXISTS "assigned_to_team_lead" uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

-- ============================================
-- 6. CREAR TABLA INTERMEDIA: user_assigned_leads
-- (Para rastrear qué Community users tienen qué leads)
-- ============================================

CREATE TABLE IF NOT EXISTS "public"."user_assigned_leads" (
  "id" uuid DEFAULT "extensions"."uuid_generate_v4"() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "public"."crm_contacts"("id") ON DELETE CASCADE,
  "assigned_at" timestamp with time zone DEFAULT "now"(),
  "assigned_by" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE SET NULL,
  "organization_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "unique_user_lead_assignment" UNIQUE("user_id", "contact_id", "organization_id")
);

ALTER TABLE "public"."user_assigned_leads" OWNER TO "postgres";

CREATE INDEX "idx_user_assigned_leads_user_id" ON "public"."user_assigned_leads" USING "btree" ("user_id");
CREATE INDEX "idx_user_assigned_leads_contact_id" ON "public"."user_assigned_leads" USING "btree" ("contact_id");
CREATE INDEX "idx_user_assigned_leads_organization_id" ON "public"."user_assigned_leads" USING "btree" ("organization_id");

-- ============================================
-- 7. CREAR TABLA: team_members_hierarchy
-- (Para estructura de equipos - Manager -> Community)
-- ============================================

CREATE TABLE IF NOT EXISTS "public"."team_members_hierarchy" (
  "id" uuid DEFAULT "extensions"."uuid_generate_v4"() NOT NULL PRIMARY KEY,
  "manager_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "organization_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "role_in_team" text NOT NULL CHECK ("role_in_team" = ANY(ARRAY['team_lead'::text, 'agent'::text])),
  "added_at" timestamp with time zone DEFAULT "now"(),
  CONSTRAINT "unique_team_hierarchy" UNIQUE("manager_id", "member_id", "organization_id")
);

ALTER TABLE "public"."team_members_hierarchy" OWNER TO "postgres";

CREATE INDEX "idx_team_hierarchy_manager" ON "public"."team_members_hierarchy" USING "btree" ("manager_id");
CREATE INDEX "idx_team_hierarchy_member" ON "public"."team_members_hierarchy" USING "btree" ("member_id");
CREATE INDEX "idx_team_hierarchy_org" ON "public"."team_members_hierarchy" USING "btree" ("organization_id");

-- ============================================
-- 8. CREAR POLÍTICAS RLS (Row Level Security)
-- ============================================

-- Habilitar RLS
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."crm_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_assigned_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."team_members_hierarchy" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 9. POLÍTICAS PARA profiles
-- ============================================

-- Admin: Ver todos los perfiles de su organización
DROP POLICY IF EXISTS "admin_select_profiles" ON "public"."profiles";
CREATE POLICY "admin_select_profiles" ON "public"."profiles"
  FOR SELECT USING (
    auth.jwt() ->> 'org_id' = organization_id::text OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Manager: Ver su propio perfil y su equipo
DROP POLICY IF EXISTS "manager_select_profiles" ON "public"."profiles";
CREATE POLICY "manager_select_profiles" ON "public"."profiles"
  FOR SELECT USING (
    auth.uid() = id OR 
    auth.uid() IN (
      SELECT manager_id FROM team_members_hierarchy 
      WHERE manager_id = auth.uid()
    ) OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Community: Ver su propio perfil
DROP POLICY IF EXISTS "community_select_profiles" ON "public"."profiles";
CREATE POLICY "community_select_profiles" ON "public"."profiles"
  FOR SELECT USING (
    auth.uid() = id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Actualizar rol solo Admin
DROP POLICY IF EXISTS "admin_update_profiles" ON "public"."profiles";
CREATE POLICY "admin_update_profiles" ON "public"."profiles"
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' AND
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- ============================================
-- 10. POLÍTICAS PARA conversations
-- ============================================

-- Admin: Ver todas
DROP POLICY IF EXISTS "admin_select_conversations" ON "public"."conversations";
CREATE POLICY "admin_select_conversations" ON "public"."conversations"
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' AND
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Manager: Ver conversaciones de su equipo
DROP POLICY IF EXISTS "manager_select_conversations" ON "public"."conversations";
CREATE POLICY "manager_select_conversations" ON "public"."conversations"
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager' AND
    team_lead_id = auth.uid()
  );

-- Community: Ver solo sus leads asignados
DROP POLICY IF EXISTS "community_select_conversations" ON "public"."conversations";
CREATE POLICY "community_select_conversations" ON "public"."conversations"
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'community' AND
    lead_id IN (
      SELECT contact_id FROM user_assigned_leads 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 11. POLÍTICAS PARA crm_contacts
-- ============================================

-- Admin: Ver todos
DROP POLICY IF EXISTS "admin_select_crm_contacts" ON "public"."crm_contacts";
CREATE POLICY "admin_select_crm_contacts" ON "public"."crm_contacts"
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' AND
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Manager: Ver contactos de su equipo
DROP POLICY IF EXISTS "manager_select_crm_contacts" ON "public"."crm_contacts";
CREATE POLICY "manager_select_crm_contacts" ON "public"."crm_contacts"
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager' AND
    team_lead_id = auth.uid()
  );

-- Community: Ver solo leads asignados
DROP POLICY IF EXISTS "community_select_crm_contacts" ON "public"."crm_contacts";
CREATE POLICY "community_select_crm_contacts" ON "public"."crm_contacts"
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'community' AND
    id IN (
      SELECT contact_id FROM user_assigned_leads 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 12. CREAR ÍNDICES PARA PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS "idx_profiles_team_lead_id" ON "public"."profiles" USING "btree" ("team_lead_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_team_lead_id" ON "public"."conversations" USING "btree" ("team_lead_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_lead_id" ON "public"."conversations" USING "btree" ("lead_id");
CREATE INDEX IF NOT EXISTS "idx_crm_contacts_team_lead_id" ON "public"."crm_contacts" USING "btree" ("team_lead_id");
CREATE INDEX IF NOT EXISTS "idx_crm_contacts_assigned_user" ON "public"."crm_contacts" USING "btree" ("assigned_to_user_id");
CREATE INDEX IF NOT EXISTS "idx_tasks_team_lead_id" ON "public"."tasks" USING "btree" ("team_lead_id");
CREATE INDEX IF NOT EXISTS "idx_tasks_assigned_to_team" ON "public"."tasks" USING "btree" ("assigned_to_team_lead");

-- ============================================
-- 13. COMENTARIOS DE TABLA PARA DOCUMENTACIÓN
-- ============================================

COMMENT ON TABLE "public"."user_assigned_leads" IS 'Asignaciones de leads a Community users. Controla qué leads puede ver cada Community user.';
COMMENT ON TABLE "public"."team_members_hierarchy" IS 'Estructura jerárquica de equipos. Un Manager supervisa múltiples Community users.';

COMMENT ON COLUMN "public"."profiles"."team_lead_id" IS 'Si el usuario es Community, este es su Manager supervisor.';
COMMENT ON COLUMN "public"."profiles"."assigned_lead_ids" IS 'Array de IDs de leads asignados (para Community users).';

COMMENT ON COLUMN "public"."conversations"."team_lead_id" IS 'Manager responsable de esta conversación.';
COMMENT ON COLUMN "public"."conversations"."lead_id" IS 'Referencia al contacto/lead de esta conversación.';

COMMENT ON COLUMN "public"."crm_contacts"."team_lead_id" IS 'Manager responsable de este contacto.';
COMMENT ON COLUMN "public"."crm_contacts"."assigned_to_user_id" IS 'Community user asignado a este contacto.';

-- ============================================
-- FIN DE MIGRATION
-- ============================================
