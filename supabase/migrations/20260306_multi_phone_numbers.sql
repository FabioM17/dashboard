-- Migration: Support multiple WhatsApp phone numbers per organization
-- Date: 2026-03-06

-- 1. Create whatsapp_phone_numbers table
-- Each phone number stores its own WABA ID and access token.
-- Numbers under the SAME WABA share the same token; numbers under DIFFERENT WABAs have different tokens.
CREATE TABLE IF NOT EXISTS "public"."whatsapp_phone_numbers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "phone_number_id" "text" NOT NULL, -- Meta's Phone Number ID
    "display_phone_number" "text" NOT NULL, -- E.164 format like +1234567890
    "verified_name" "text", -- WhatsApp verified business name
    "label" "text" DEFAULT ''::"text", -- User-friendly label like "Ventas", "Soporte"
    "is_default" boolean DEFAULT false NOT NULL,
    "quality_rating" "text" DEFAULT 'UNKNOWN'::"text",
    "messaging_limit_tier" "text" DEFAULT 'TIER_UNKNOWN'::"text",
    "waba_id" "text", -- WhatsApp Business Account ID this phone belongs to
    "access_token" "text", -- System User Token for the WABA that owns this phone number
    "business_id" "text", -- Meta Business ID (optional, for reference)
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_phone_numbers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whatsapp_phone_numbers_org_phone_unique" UNIQUE ("organization_id", "phone_number_id"),
    CONSTRAINT "whatsapp_phone_numbers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE
);

COMMENT ON TABLE "public"."whatsapp_phone_numbers" IS 'Números de teléfono WhatsApp Business asociados a cada organización. Una org puede tener múltiples números.';
COMMENT ON COLUMN "public"."whatsapp_phone_numbers"."phone_number_id" IS 'ID del número de teléfono en Meta (Phone Number ID)';
COMMENT ON COLUMN "public"."whatsapp_phone_numbers"."display_phone_number" IS 'Número de teléfono visible en formato E.164';
COMMENT ON COLUMN "public"."whatsapp_phone_numbers"."label" IS 'Etiqueta amigable para identificar el número (ej: Ventas, Soporte)';
COMMENT ON COLUMN "public"."whatsapp_phone_numbers"."is_default" IS 'Si es el número por defecto de la organización';
COMMENT ON COLUMN "public"."whatsapp_phone_numbers"."waba_id" IS 'ID del WhatsApp Business Account al que pertenece este número';
COMMENT ON COLUMN "public"."whatsapp_phone_numbers"."access_token" IS 'Token de acceso del System User para el WABA de este número. Distintos WABAs requieren distintos tokens';
COMMENT ON COLUMN "public"."whatsapp_phone_numbers"."business_id" IS 'ID del Meta Business que posee el WABA (referencia)';

CREATE INDEX "idx_whatsapp_phone_numbers_org" ON "public"."whatsapp_phone_numbers" USING "btree" ("organization_id");
CREATE INDEX "idx_whatsapp_phone_numbers_default" ON "public"."whatsapp_phone_numbers" USING "btree" ("organization_id", "is_default") WHERE ("is_default" = true);

-- 2. Add whatsapp_phone_number_id to conversations
ALTER TABLE "public"."conversations" ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id" "uuid";
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_whatsapp_phone_number_id_fkey" 
    FOREIGN KEY ("whatsapp_phone_number_id") REFERENCES "public"."whatsapp_phone_numbers"("id") ON DELETE SET NULL;
CREATE INDEX "idx_conversations_whatsapp_phone" ON "public"."conversations" USING "btree" ("whatsapp_phone_number_id") WHERE ("whatsapp_phone_number_id" IS NOT NULL);
COMMENT ON COLUMN "public"."conversations"."whatsapp_phone_number_id" IS 'Número de WhatsApp de la organización usado en esta conversación';

-- 3. Add whatsapp_phone_number_id to campaigns
ALTER TABLE "public"."campaigns" ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id" "uuid";
ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_whatsapp_phone_number_id_fkey" 
    FOREIGN KEY ("whatsapp_phone_number_id") REFERENCES "public"."whatsapp_phone_numbers"("id") ON DELETE SET NULL;
COMMENT ON COLUMN "public"."campaigns"."whatsapp_phone_number_id" IS 'Número de WhatsApp desde el que se envía la campaña';

-- 4. Add whatsapp_phone_number_id to workflows
ALTER TABLE "public"."workflows" ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id" "uuid";
ALTER TABLE "public"."workflows" ADD CONSTRAINT "workflows_whatsapp_phone_number_id_fkey" 
    FOREIGN KEY ("whatsapp_phone_number_id") REFERENCES "public"."whatsapp_phone_numbers"("id") ON DELETE SET NULL;
COMMENT ON COLUMN "public"."workflows"."whatsapp_phone_number_id" IS 'Número de WhatsApp desde el que se envían los mensajes del flujo';

-- 5. Add whatsapp_phone_number_id to messages (tracking which number sent)
ALTER TABLE "public"."messages" ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id" "uuid";
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_whatsapp_phone_number_id_fkey" 
    FOREIGN KEY ("whatsapp_phone_number_id") REFERENCES "public"."whatsapp_phone_numbers"("id") ON DELETE SET NULL;
CREATE INDEX "idx_messages_whatsapp_phone" ON "public"."messages" USING "btree" ("whatsapp_phone_number_id") WHERE ("whatsapp_phone_number_id" IS NOT NULL);

-- 5b. Add whatsapp_phone_number_id to tasks (context for which number the task relates to)
ALTER TABLE "public"."tasks" ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id" "uuid";
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_whatsapp_phone_number_id_fkey" 
    FOREIGN KEY ("whatsapp_phone_number_id") REFERENCES "public"."whatsapp_phone_numbers"("id") ON DELETE SET NULL;
COMMENT ON COLUMN "public"."tasks"."whatsapp_phone_number_id" IS 'Número de WhatsApp asociado a esta tarea';

-- 6. Trigger to update updated_at on whatsapp_phone_numbers
CREATE OR REPLACE TRIGGER "update_whatsapp_phone_numbers_updated_at" 
    BEFORE UPDATE ON "public"."whatsapp_phone_numbers" 
    FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- 7. Function to ensure only one default per org
CREATE OR REPLACE FUNCTION "public"."ensure_single_default_phone"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE whatsapp_phone_numbers 
    SET is_default = false 
    WHERE organization_id = NEW.organization_id 
      AND id != NEW.id 
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER "trigger_ensure_single_default_phone"
    BEFORE INSERT OR UPDATE OF "is_default" ON "public"."whatsapp_phone_numbers"
    FOR EACH ROW EXECUTE FUNCTION "public"."ensure_single_default_phone"();

-- 8. RLS Policies for whatsapp_phone_numbers
ALTER TABLE "public"."whatsapp_phone_numbers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org phone numbers" ON "public"."whatsapp_phone_numbers"
    FOR SELECT USING (organization_id = "public"."get_my_org_id"());

CREATE POLICY "Admins can manage phone numbers" ON "public"."whatsapp_phone_numbers"
    FOR ALL USING (
        organization_id = "public"."get_my_org_id"() 
        AND "public"."get_current_user_role"() = 'admin'
    );

-- 9. Update preview_organization_deletion to include whatsapp_phone_numbers count
-- This ensures the data deletion preview shows the new table
CREATE OR REPLACE FUNCTION public.preview_organization_deletion(
  requesting_user_id UUID,
  target_org_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  creator_id UUID;
  result JSON;
BEGIN
  SELECT public.get_org_creator_id(target_org_id) INTO creator_id;

  IF requesting_user_id != creator_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'FORBIDDEN',
      'message', 'Solo el administrador creador puede ver esta información'
    );
  END IF;

  SELECT json_build_object(
    'success', true,
    'organization', (SELECT json_build_object('id', id, 'name', name) FROM organizations WHERE id = target_org_id),
    'counts', json_build_object(
      'profiles', (SELECT COUNT(*) FROM profiles WHERE organization_id = target_org_id),
      'conversations', (SELECT COUNT(*) FROM conversations WHERE organization_id = target_org_id),
      'messages', (SELECT COUNT(*) FROM messages WHERE organization_id = target_org_id),
      'crm_contacts', (SELECT COUNT(*) FROM crm_contacts WHERE organization_id = target_org_id),
      'tasks', (SELECT COUNT(*) FROM tasks WHERE organization_id = target_org_id),
      'campaigns', (SELECT COUNT(*) FROM campaigns WHERE organization_id = target_org_id),
      'workflows', (SELECT COUNT(*) FROM workflows WHERE organization_id = target_org_id),
      'templates', (SELECT COUNT(*) FROM meta_templates WHERE organization_id = target_org_id),
      'snippets', (SELECT COUNT(*) FROM snippets WHERE organization_id = target_org_id),
      'api_keys', (SELECT COUNT(*) FROM api_keys WHERE organization_id = target_org_id),
      'lists', (SELECT COUNT(*) FROM lists WHERE organization_id = target_org_id),
      'integration_settings', (SELECT COUNT(*) FROM integration_settings WHERE organization_id = target_org_id),
      'whatsapp_phone_numbers', (SELECT COUNT(*) FROM whatsapp_phone_numbers WHERE organization_id = target_org_id),
      'notes', (SELECT COUNT(*) FROM notes WHERE conversation_id IN (SELECT id FROM conversations WHERE organization_id = target_org_id)),
      'scheduled_notifications', (SELECT COUNT(*) FROM scheduled_notifications WHERE organization_id = target_org_id),
      'workflow_enrollments', (SELECT COUNT(*) FROM workflow_enrollments WHERE organization_id = target_org_id),
      'message_statuses', (SELECT COUNT(*) FROM message_statuses WHERE organization_id = target_org_id),
      'team_hierarchy', (SELECT COUNT(*) FROM team_members_hierarchy WHERE organization_id = target_org_id),
      'lead_assignments', (SELECT COUNT(*) FROM user_assigned_leads WHERE organization_id = target_org_id)
    ),
    'members', (
      SELECT json_agg(json_build_object(
        'id', p.id,
        'name', p.full_name,
        'email', p.email,
        'role', p.role,
        'is_creator', p.id = creator_id
      ))
      FROM profiles p
      WHERE p.organization_id = target_org_id
    ),
    'phone_numbers', (
      SELECT json_agg(json_build_object(
        'id', w.id,
        'display_phone_number', w.display_phone_number,
        'label', w.label,
        'is_default', w.is_default,
        'waba_id', w.waba_id
      ))
      FROM whatsapp_phone_numbers w
      WHERE w.organization_id = target_org_id
    )
  ) INTO result;

  RETURN result;
END;
$$;
