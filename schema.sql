


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."calculate_avg_response_time"("org_id" "uuid", "days_back" integer DEFAULT 7) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  avg_time NUMERIC;
BEGIN
  -- Calculate average time between incoming message and first outgoing response
  -- within the same conversation
  WITH incoming_messages AS (
    SELECT 
      m.conversation_id,
      m.created_at as incoming_time,
      ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) as rn
    FROM messages m
    WHERE m.organization_id = org_id
      AND m.is_incoming = true
      AND m.created_at >= NOW() - INTERVAL '1 day' * days_back
  ),
  outgoing_responses AS (
    SELECT 
      m.conversation_id,
      m.created_at as outgoing_time,
      ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) as rn
    FROM messages m
    WHERE m.organization_id = org_id
      AND m.is_incoming = false
      AND m.created_at >= NOW() - INTERVAL '1 day' * days_back
  ),
  response_times AS (
    SELECT 
      EXTRACT(EPOCH FROM (o.outgoing_time - i.incoming_time)) as seconds
    FROM incoming_messages i
    INNER JOIN outgoing_responses o 
      ON i.conversation_id = o.conversation_id 
      AND o.outgoing_time > i.incoming_time
    WHERE o.rn = 1 -- First outgoing response after incoming
      AND i.rn = 1 -- First incoming message
      AND EXTRACT(EPOCH FROM (o.outgoing_time - i.incoming_time)) < 86400 -- Less than 24 hours
  )
  SELECT AVG(seconds) INTO avg_time FROM response_times;
  
  RETURN COALESCE(avg_time, 0);
END;
$$;


ALTER FUNCTION "public"."calculate_avg_response_time"("org_id" "uuid", "days_back" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_avg_response_time"("org_id" "uuid", "days_back" integer) IS 'Calculates average response time in seconds for an organization. Returns 0 if no data available.';



CREATE OR REPLACE FUNCTION "public"."enroll_active_workflow_contacts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  contact_record RECORD;
  first_step_delay INT;
BEGIN
  -- Solo ejecutar si el workflow cambió a is_active = true
  IF NEW.is_active = true AND (OLD.is_active = false OR OLD.is_active IS NULL) THEN
    
    -- Obtener el delay del primer paso
    SELECT delay_days INTO first_step_delay
    FROM workflow_steps
    WHERE workflow_id = NEW.id AND step_order = 1
    LIMIT 1;
    
    IF first_step_delay IS NULL THEN
      RAISE WARNING 'Workflow % no tiene pasos definidos', NEW.id;
      RETURN NEW;
    END IF;
    
    -- Enrolar todos los contactos actuales de la lista (aplicando filtros y manual_contact_ids)
    FOR contact_record IN (
      -- Esta query replica la lógica de resolución de listas dinámicas
      SELECT DISTINCT c.id, c.organization_id
      FROM crm_contacts c
      INNER JOIN lists l ON l.id = NEW.list_id
      WHERE c.organization_id = NEW.organization_id
        AND l.organization_id = NEW.organization_id
        -- Incluir contactos que cumplan filtros O estén en manual_contact_ids
        AND (
          -- Lógica de filtros (simplificada, se puede extender)
          (l.filters IS NULL OR jsonb_array_length(l.filters::jsonb) = 0)
          OR c.id::TEXT = ANY(l.manual_contact_ids)
        )
        -- Excluir contactos en inactive_contact_ids
        AND NOT (c.id::TEXT = ANY(l.inactive_contact_ids))
        -- No enrolar si ya está enrolado
        AND NOT EXISTS (
          SELECT 1 FROM workflow_enrollments e
          WHERE e.workflow_id = NEW.id AND e.contact_id = c.id
        )
    )
    LOOP
      INSERT INTO workflow_enrollments (
        workflow_id,
        contact_id,
        organization_id,
        current_step,
        status,
        enrolled_at,
        next_send_at
      ) VALUES (
        NEW.id,
        contact_record.id,
        contact_record.organization_id,
        1,
        'active',
        NOW(),
        NOW() + (first_step_delay || ' days')::INTERVAL
      );
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enroll_active_workflow_contacts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_auth_user_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_auth_user_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_conversation_counts_by_status"("org_id" "uuid") RETURNS TABLE("status" "text", "conversation_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.status,
    COUNT(c.id)::BIGINT as conversation_count
  FROM conversations c
  WHERE c.organization_id = org_id
  GROUP BY c.status;
END;
$$;


ALTER FUNCTION "public"."get_conversation_counts_by_status"("org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_conversation_counts_by_status"("org_id" "uuid") IS 'Returns conversation counts grouped by status (open, closed, snoozed) for a given organization';



CREATE OR REPLACE FUNCTION "public"."get_current_user_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select organization_id from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."get_current_user_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select role from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."get_current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_message_volume"("org_id" "uuid", "days_back" integer DEFAULT 30) RETURNS TABLE("message_date" "date", "message_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(m.created_at) as message_date,
    COUNT(m.id)::BIGINT as message_count
  FROM messages m
  WHERE m.organization_id = org_id
    AND m.created_at >= NOW() - INTERVAL '1 day' * days_back
  GROUP BY DATE(m.created_at)
  ORDER BY message_date ASC;
END;
$$;


ALTER FUNCTION "public"."get_daily_message_volume"("org_id" "uuid", "days_back" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_daily_message_volume"("org_id" "uuid", "days_back" integer) IS 'Returns daily message counts for the specified number of days back';



CREATE OR REPLACE FUNCTION "public"."get_list_contacts"("list_uuid" "uuid") RETURNS TABLE("contact_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  list_record RECORD;
  filter_record RECORD;
  where_clause TEXT := '';
BEGIN
  -- Obtener la lista
  SELECT * INTO list_record
  FROM lists
  WHERE id = list_uuid;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista no encontrada: %', list_uuid;
  END IF;
  
  -- Retornar contactos que cumplan filtros O estén en manual_contact_ids
  -- Excluyendo los que están en inactive_contact_ids
  RETURN QUERY
  SELECT DISTINCT c.id
  FROM crm_contacts c
  WHERE c.organization_id = list_record.organization_id
    -- Incluir contactos manuales
    AND (
      c.id::TEXT = ANY(list_record.manual_contact_ids)
      -- O los que cumplan filtros (si no hay filtros, incluir todos menos excluidos)
      OR (
        (list_record.filters IS NULL OR jsonb_array_length(list_record.filters::jsonb) = 0)
      )
      -- TODO: Aquí se puede extender con evaluación dinámica de filtros complejos
    )
    -- Excluir contactos desactivados
    AND NOT (c.id::TEXT = ANY(list_record.inactive_contact_ids));
END;
$$;


ALTER FUNCTION "public"."get_list_contacts"("list_uuid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_list_contacts"("list_uuid" "uuid") IS 'Resuelve los contactos de una lista dinámica aplicando filtros y manual_contact_ids';



CREATE OR REPLACE FUNCTION "public"."get_message_counts_by_platform"("org_id" "uuid") RETURNS TABLE("platform" "text", "message_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.platform,
    COUNT(m.id)::BIGINT as message_count
  FROM conversations c
  LEFT JOIN messages m ON m.conversation_id = c.id
  WHERE c.organization_id = org_id
    AND c.platform IS NOT NULL
  GROUP BY c.platform;
END;
$$;


ALTER FUNCTION "public"."get_message_counts_by_platform"("org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_message_counts_by_platform"("org_id" "uuid") IS 'Returns message counts grouped by platform (whatsapp, instagram, messenger, web) for a given organization';



CREATE OR REPLACE FUNCTION "public"."get_my_org_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  RETURN (SELECT organization_id FROM public.profiles WHERE id = auth.uid());
END;
$$;


ALTER FUNCTION "public"."get_my_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_agents_by_messages"("org_id" "uuid", "limit_count" integer DEFAULT 5) RETURNS TABLE("agent_id" "uuid", "agent_name" "text", "messages_handled" bigint, "conversations_assigned" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as agent_id,
    COALESCE(p.full_name, p.email, 'Unknown') as agent_name,
    COUNT(DISTINCT m.id)::BIGINT as messages_handled,
    COUNT(DISTINCT c.id)::BIGINT as conversations_assigned
  FROM profiles p
  INNER JOIN conversations c ON c.assigned_to = p.id
  LEFT JOIN messages m ON m.conversation_id = c.id
  WHERE c.organization_id = org_id
    AND c.assigned_to IS NOT NULL
  GROUP BY p.id, p.full_name, p.email
  ORDER BY messages_handled DESC
  LIMIT limit_count;
END;
$$;


ALTER FUNCTION "public"."get_top_agents_by_messages"("org_id" "uuid", "limit_count" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_top_agents_by_messages"("org_id" "uuid", "limit_count" integer) IS 'Returns top agents ranked by number of messages handled';



CREATE OR REPLACE FUNCTION "public"."update_message_statuses_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_message_statuses_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "recipient_count" integer DEFAULT 0,
    "recipient_ids" "text"[] DEFAULT '{}'::"text"[],
    "stats" "jsonb" DEFAULT '{"read": 0, "sent": 0, "failed": 0, "delivered": 0}'::"jsonb",
    "template_id" "text",
    "template_name" "text",
    "email_subject" "text",
    "email_body" "text",
    "organization_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sent_at" timestamp with time zone,
    "scheduled_at" timestamp with time zone,
    "template_language" "text",
    "created_by" "uuid",
    "user_timezone" "text" DEFAULT 'UTC'::"text"
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


COMMENT ON TABLE "public"."campaigns" IS 'Campañas masivas de email y WhatsApp';



COMMENT ON COLUMN "public"."campaigns"."recipient_ids" IS 'Array de IDs de contactos destinatarios';



COMMENT ON COLUMN "public"."campaigns"."stats" IS 'Estadísticas de la campaña: {sent, delivered, read, failed}';



CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contact_name" "text" NOT NULL,
    "contact_phone" "text",
    "contact_avatar" "text",
    "platform" "text",
    "last_message" "text",
    "last_message_time" timestamp with time zone DEFAULT "now"(),
    "unread_count" integer DEFAULT 0,
    "tags" "text"[],
    "status" "text" DEFAULT 'open'::"text",
    "assigned_to" "uuid",
    "organization_id" "uuid",
    "team_lead_id" "uuid",
    "lead_id" "uuid",
    CONSTRAINT "conversations_platform_check" CHECK (("platform" = ANY (ARRAY['whatsapp'::"text", 'instagram'::"text", 'messenger'::"text", 'web'::"text"]))),
    CONSTRAINT "conversations_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text", 'snoozed'::"text"])))
);

ALTER TABLE ONLY "public"."conversations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."conversations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."conversations"."team_lead_id" IS 'Manager responsable de esta conversación.';



COMMENT ON COLUMN "public"."conversations"."lead_id" IS 'Referencia al contacto/lead de esta conversación.';



CREATE TABLE IF NOT EXISTS "public"."crm_contacts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "company" "text",
    "pipeline_stage" "text" DEFAULT 'lead'::"text",
    "avatar_url" "text",
    "custom_properties" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    "team_lead_id" "uuid",
    "assigned_to_user_id" "uuid"
);


ALTER TABLE "public"."crm_contacts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."crm_contacts"."team_lead_id" IS 'Manager responsable de este contacto.';



COMMENT ON COLUMN "public"."crm_contacts"."assigned_to_user_id" IS 'Community user asignado a este contacto.';



CREATE TABLE IF NOT EXISTS "public"."crm_property_definitions" (
    "id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "options" "text"[],
    CONSTRAINT "crm_property_definitions_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'number'::"text", 'date'::"text", 'select'::"text", 'time'::"text", 'phone'::"text", 'percentage'::"text"])))
);


ALTER TABLE "public"."crm_property_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_settings" (
    "service_name" "text" NOT NULL,
    "credentials" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."integration_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "scopes" "text"[] DEFAULT '{}'::"text"[],
    "is_active" boolean DEFAULT true,
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


COMMENT ON TABLE "public"."api_keys" IS 'API keys for external platform integrations. Keys are stored hashed (SHA-256).';



COMMENT ON COLUMN "public"."api_keys"."key_prefix" IS 'First 8 characters of the key for identification in UI (e.g. dk_live_)';



COMMENT ON COLUMN "public"."api_keys"."key_hash" IS 'SHA-256 hash of the full API key. The plaintext key is only shown once at creation.';



COMMENT ON COLUMN "public"."api_keys"."scopes" IS 'Array of allowed scopes: contacts:read, contacts:write, messages:read, messages:send, conversations:read, conversations:write';



CREATE TABLE IF NOT EXISTS "public"."api_endpoint_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "endpoint_name" "text" NOT NULL,
    "method" "text" NOT NULL DEFAULT 'GET'::"text",
    "is_enabled" boolean DEFAULT true,
    "rate_limit_per_minute" integer DEFAULT 60,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "api_endpoint_configs_unique" UNIQUE ("organization_id", "endpoint_name", "method")
);


ALTER TABLE "public"."api_endpoint_configs" OWNER TO "postgres";


COMMENT ON TABLE "public"."api_endpoint_configs" IS 'Per-organization endpoint configuration. Allows admins to enable/disable individual API endpoints.';



CREATE TABLE IF NOT EXISTS "public"."lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "filters" "jsonb" DEFAULT '[]'::"jsonb",
    "manual_contact_ids" "text"[] DEFAULT '{}'::"text"[],
    "inactive_contact_ids" "text"[] DEFAULT '{}'::"text"[],
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lists" OWNER TO "postgres";


COMMENT ON TABLE "public"."lists" IS 'Listas dinámicas del CRM basadas en filtros y selección manual';



COMMENT ON COLUMN "public"."lists"."filters" IS 'Array JSON de objetos de filtro {field, comparison, value}';



COMMENT ON COLUMN "public"."lists"."manual_contact_ids" IS 'IDs de contactos agregados manualmente a la lista';



COMMENT ON COLUMN "public"."lists"."inactive_contact_ids" IS 'IDs de contactos desactivados en la lista';



CREATE TABLE IF NOT EXISTS "public"."message_statuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "message_id" "uuid",
    "conversation_id" "uuid",
    "whatsapp_message_id" "text" NOT NULL,
    "phone_number_id" "text" NOT NULL,
    "display_phone_number" "text" NOT NULL,
    "recipient_phone" "text" NOT NULL,
    "status" "text" NOT NULL,
    "timestamp_unix" bigint NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    "pricing" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "message_statuses_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "public"."message_statuses" REPLICA IDENTITY FULL;


ALTER TABLE "public"."message_statuses" OWNER TO "postgres";


COMMENT ON TABLE "public"."message_statuses" IS 'Rastreo de estados de mensajes de WhatsApp con información de precios y metadatos';



COMMENT ON COLUMN "public"."message_statuses"."pricing" IS 'Información de facturación de WhatsApp: billable, pricing_model, category, type';



COMMENT ON COLUMN "public"."message_statuses"."metadata" IS 'Metadatos adicionales como messaging_product y otros datos de webhook';



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "text",
    "text" "text",
    "type" "text" DEFAULT 'text'::"text",
    "is_incoming" boolean DEFAULT false,
    "is_ai" boolean DEFAULT false,
    "status" "text" DEFAULT 'sent'::"text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "author_name" "text",
    "media_url" "text",
    "media_path" "text",
    "media_mime_type" "text",
    "media_size" bigint,
    "organization_id" "uuid" NOT NULL
);

ALTER TABLE ONLY "public"."messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meta_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "language" "text" DEFAULT 'en_US'::"text" NOT NULL,
    "body" "text" NOT NULL,
    "status" "text" DEFAULT 'approved'::"text" NOT NULL
);


ALTER TABLE "public"."meta_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid",
    "author_id" "uuid",
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "support_email" "text"
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organizations"."support_email" IS 'Email de soporte para la organización';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "avatar_url" "text",
    "role" "text" DEFAULT 'agent'::"text",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "organization_id" "uuid",
    "phone" "text",
    "team_lead_id" "uuid",
    "assigned_lead_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'community'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."team_lead_id" IS 'Si el usuario es Community, este es su Manager supervisor.';



COMMENT ON COLUMN "public"."profiles"."assigned_lead_ids" IS 'Array de IDs de leads asignados (para Community users).';



CREATE TABLE IF NOT EXISTS "public"."scheduled_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "assignee_id" "uuid",
    "task_id" "uuid",
    "payload" "jsonb" NOT NULL,
    "send_at" timestamp with time zone NOT NULL,
    "sent" boolean DEFAULT false,
    "sent_at" timestamp with time zone,
    "attempts" integer DEFAULT 0,
    "last_error" "text",
    "failed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."scheduled_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."snippets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "shortcut" "text" NOT NULL,
    "content" "text" NOT NULL
);


ALTER TABLE "public"."snippets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'todo'::"text",
    "assignee_id" "uuid",
    "conversation_id" "uuid",
    "due_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "team_lead_id" "uuid",
    "assigned_to_team_lead" "uuid",
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['todo'::"text", 'in_progress'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members_hierarchy" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "manager_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role_in_team" "text" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "team_members_hierarchy_role_in_team_check" CHECK (("role_in_team" = ANY (ARRAY['team_lead'::"text", 'agent'::"text"])))
);


ALTER TABLE "public"."team_members_hierarchy" OWNER TO "postgres";


COMMENT ON TABLE "public"."team_members_hierarchy" IS 'Estructura jerárquica de equipos. Un Manager supervisa múltiples Community users.';



CREATE TABLE IF NOT EXISTS "public"."user_assigned_leads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "assigned_by" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."user_assigned_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_assigned_leads" IS 'Asignaciones de leads a Community users. Controla qué leads puede ver cada Community user.';



CREATE TABLE IF NOT EXISTS "public"."webhook_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "payload" "jsonb",
    "source" "text",
    "processed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."webhook_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "current_step" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "enrolled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_send_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone,
    "last_error" "text",
    "retry_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "workflow_enrollments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'failed'::"text", 'paused'::"text"]))),
    CONSTRAINT "workflow_enrollments_step_positive" CHECK (("current_step" > 0))
);


ALTER TABLE "public"."workflow_enrollments" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_enrollments" IS 'Tracking de contactos enrolados en workflows (estado y progreso)';



COMMENT ON COLUMN "public"."workflow_enrollments"."current_step" IS 'Número del paso actual en ejecución';



COMMENT ON COLUMN "public"."workflow_enrollments"."status" IS 'Estado del enrollment: active (en progreso), completed (finalizado), failed (error), paused (pausado)';



COMMENT ON COLUMN "public"."workflow_enrollments"."next_send_at" IS 'Timestamp preciso del próximo envío programado';



CREATE TABLE IF NOT EXISTS "public"."workflow_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "step_order" integer NOT NULL,
    "template_id" "uuid" NOT NULL,
    "template_name" "text" NOT NULL,
    "delay_days" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workflow_steps_delay_nonnegative" CHECK (("delay_days" >= 0)),
    CONSTRAINT "workflow_steps_order_positive" CHECK (("step_order" > 0))
);


ALTER TABLE "public"."workflow_steps" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_steps" IS 'Pasos secuenciales de cada flujo (template + delay)';



COMMENT ON COLUMN "public"."workflow_steps"."step_order" IS 'Orden de ejecución del paso en el flujo (1-indexed)';



COMMENT ON COLUMN "public"."workflow_steps"."delay_days" IS 'Días de espera desde el inicio del flujo o paso anterior';



CREATE TABLE IF NOT EXISTS "public"."workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "list_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."workflows" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflows" IS 'Workflows automáticos de mensajería. Ejecutados por pg_cron cada minuto.';



COMMENT ON COLUMN "public"."workflows"."list_id" IS 'Lista dinámica cuyos contactos serán enrolados en este flujo';



COMMENT ON COLUMN "public"."workflows"."is_active" IS 'Si está activo, los contactos de la lista serán enrolados automáticamente';



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_endpoint_configs"
    ADD CONSTRAINT "api_endpoint_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_contacts"
    ADD CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_property_definitions"
    ADD CONSTRAINT "crm_property_definitions_pkey" PRIMARY KEY ("organization_id", "id");



ALTER TABLE ONLY "public"."integration_settings"
    ADD CONSTRAINT "integration_settings_pkey" PRIMARY KEY ("organization_id", "service_name");



ALTER TABLE ONLY "public"."lists"
    ADD CONSTRAINT "lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_statuses"
    ADD CONSTRAINT "message_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_templates"
    ADD CONSTRAINT "meta_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_notifications"
    ADD CONSTRAINT "scheduled_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."snippets"
    ADD CONSTRAINT "snippets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members_hierarchy"
    ADD CONSTRAINT "team_members_hierarchy_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members_hierarchy"
    ADD CONSTRAINT "unique_team_hierarchy" UNIQUE ("manager_id", "member_id", "organization_id");



ALTER TABLE ONLY "public"."user_assigned_leads"
    ADD CONSTRAINT "unique_user_lead_assignment" UNIQUE ("user_id", "contact_id", "organization_id");



ALTER TABLE ONLY "public"."message_statuses"
    ADD CONSTRAINT "unique_whatsapp_status" UNIQUE ("whatsapp_message_id", "organization_id");



ALTER TABLE ONLY "public"."user_assigned_leads"
    ADD CONSTRAINT "user_assigned_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_logs"
    ADD CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_enrollments"
    ADD CONSTRAINT "workflow_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_enrollments"
    ADD CONSTRAINT "workflow_enrollments_unique_contact" UNIQUE ("workflow_id", "contact_id");



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_unique_order" UNIQUE ("workflow_id", "step_order");



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_pkey" PRIMARY KEY ("id");



CREATE INDEX "campaigns_created_at_idx" ON "public"."campaigns" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_api_keys_organization_id" ON "public"."api_keys" USING "btree" ("organization_id");



CREATE INDEX "idx_api_keys_key_hash" ON "public"."api_keys" USING "btree" ("key_hash");



CREATE INDEX "idx_api_keys_active" ON "public"."api_keys" USING "btree" ("organization_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_api_endpoint_configs_org" ON "public"."api_endpoint_configs" USING "btree" ("organization_id");



CREATE INDEX "campaigns_organization_id_idx" ON "public"."campaigns" USING "btree" ("organization_id");



CREATE INDEX "campaigns_scheduled_at_status_idx" ON "public"."campaigns" USING "btree" ("scheduled_at", "status") WHERE ("status" = 'scheduled'::"text");



CREATE INDEX "campaigns_status_idx" ON "public"."campaigns" USING "btree" ("status");



CREATE INDEX "idx_conversations_assigned_to" ON "public"."conversations" USING "btree" ("assigned_to");



CREATE INDEX "idx_conversations_contact_phone" ON "public"."conversations" USING "btree" ("contact_phone");



CREATE INDEX "idx_conversations_lead_id" ON "public"."conversations" USING "btree" ("lead_id");



CREATE INDEX "idx_conversations_org" ON "public"."conversations" USING "btree" ("organization_id");



CREATE INDEX "idx_conversations_org_platform" ON "public"."conversations" USING "btree" ("organization_id", "platform") WHERE (("organization_id" IS NOT NULL) AND ("platform" IS NOT NULL));



CREATE INDEX "idx_conversations_org_status" ON "public"."conversations" USING "btree" ("organization_id", "status") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_conversations_organization_id" ON "public"."conversations" USING "btree" ("organization_id");



CREATE INDEX "idx_conversations_team_lead_id" ON "public"."conversations" USING "btree" ("team_lead_id");



CREATE INDEX "idx_crm_contacts_assigned_user" ON "public"."crm_contacts" USING "btree" ("assigned_to_user_id");



CREATE INDEX "idx_crm_contacts_org" ON "public"."crm_contacts" USING "btree" ("organization_id");



CREATE INDEX "idx_crm_contacts_organization_id" ON "public"."crm_contacts" USING "btree" ("organization_id");



CREATE INDEX "idx_crm_contacts_team_lead_id" ON "public"."crm_contacts" USING "btree" ("team_lead_id");



CREATE INDEX "idx_integration_settings_org_service" ON "public"."integration_settings" USING "btree" ("organization_id", "service_name");



CREATE INDEX "idx_message_statuses_conversation_id" ON "public"."message_statuses" USING "btree" ("conversation_id");



CREATE INDEX "idx_message_statuses_message_id" ON "public"."message_statuses" USING "btree" ("message_id");



CREATE INDEX "idx_message_statuses_organization_id" ON "public"."message_statuses" USING "btree" ("organization_id");



CREATE INDEX "idx_message_statuses_phone_number_id" ON "public"."message_statuses" USING "btree" ("phone_number_id");



CREATE INDEX "idx_message_statuses_status" ON "public"."message_statuses" USING "btree" ("status");



CREATE INDEX "idx_message_statuses_timestamp" ON "public"."message_statuses" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_message_statuses_whatsapp_message_id" ON "public"."message_statuses" USING "btree" ("whatsapp_message_id");



CREATE INDEX "idx_messages_conversation" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_conversation_id" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_conversation_media" ON "public"."messages" USING "btree" ("conversation_id", "type") WHERE ("type" = ANY (ARRAY['image'::"text", 'audio'::"text", 'video'::"text", 'document'::"text"]));



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_messages_org_ai" ON "public"."messages" USING "btree" ("organization_id", "is_ai") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_messages_org_conversation" ON "public"."messages" USING "btree" ("organization_id", "conversation_id");



CREATE INDEX "idx_messages_org_incoming_time" ON "public"."messages" USING "btree" ("organization_id", "is_incoming", "created_at" DESC) WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_messages_org_timestamp" ON "public"."messages" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_messages_organization_id" ON "public"."messages" USING "btree" ("organization_id");



CREATE INDEX "idx_meta_templates_org" ON "public"."meta_templates" USING "btree" ("organization_id");



CREATE INDEX "idx_notes_conversation_id" ON "public"."notes" USING "btree" ("conversation_id");



CREATE INDEX "idx_organizations_support_email" ON "public"."organizations" USING "btree" ("support_email");



CREATE INDEX "idx_profiles_id_org" ON "public"."profiles" USING "btree" ("id", "organization_id");



CREATE INDEX "idx_profiles_organization_id" ON "public"."profiles" USING "btree" ("organization_id");



CREATE INDEX "idx_profiles_team_lead_id" ON "public"."profiles" USING "btree" ("team_lead_id");



CREATE INDEX "idx_scheduled_notifications_assignee" ON "public"."scheduled_notifications" USING "btree" ("assignee_id");



CREATE INDEX "idx_scheduled_notifications_organization" ON "public"."scheduled_notifications" USING "btree" ("organization_id");



CREATE INDEX "idx_scheduled_notifications_pending" ON "public"."scheduled_notifications" USING "btree" ("send_at") WHERE (("sent" = false) AND ("failed" = false));



CREATE INDEX "idx_snippets_org" ON "public"."snippets" USING "btree" ("organization_id");



CREATE INDEX "idx_tasks_assigned_to_team" ON "public"."tasks" USING "btree" ("assigned_to_team_lead");



CREATE INDEX "idx_tasks_assignee_id" ON "public"."tasks" USING "btree" ("assignee_id");



CREATE INDEX "idx_tasks_organization_id" ON "public"."tasks" USING "btree" ("organization_id");



CREATE INDEX "idx_tasks_team_lead_id" ON "public"."tasks" USING "btree" ("team_lead_id");



CREATE INDEX "idx_team_hierarchy_manager" ON "public"."team_members_hierarchy" USING "btree" ("manager_id");



CREATE INDEX "idx_team_hierarchy_member" ON "public"."team_members_hierarchy" USING "btree" ("member_id");



CREATE INDEX "idx_team_hierarchy_org" ON "public"."team_members_hierarchy" USING "btree" ("organization_id");



CREATE INDEX "idx_user_assigned_leads_contact_id" ON "public"."user_assigned_leads" USING "btree" ("contact_id");



CREATE INDEX "idx_user_assigned_leads_organization_id" ON "public"."user_assigned_leads" USING "btree" ("organization_id");



CREATE INDEX "idx_user_assigned_leads_user_id" ON "public"."user_assigned_leads" USING "btree" ("user_id");



CREATE INDEX "lists_created_at_idx" ON "public"."lists" USING "btree" ("created_at" DESC);



CREATE INDEX "lists_organization_id_idx" ON "public"."lists" USING "btree" ("organization_id");



CREATE INDEX "workflow_enrollments_contact_id_idx" ON "public"."workflow_enrollments" USING "btree" ("contact_id");



CREATE INDEX "workflow_enrollments_organization_id_idx" ON "public"."workflow_enrollments" USING "btree" ("organization_id");



CREATE INDEX "workflow_enrollments_pending_idx" ON "public"."workflow_enrollments" USING "btree" ("next_send_at", "status") WHERE ("status" = 'active'::"text");



CREATE INDEX "workflow_enrollments_status_idx" ON "public"."workflow_enrollments" USING "btree" ("status");



CREATE INDEX "workflow_enrollments_workflow_id_idx" ON "public"."workflow_enrollments" USING "btree" ("workflow_id");



CREATE INDEX "workflow_steps_order_idx" ON "public"."workflow_steps" USING "btree" ("workflow_id", "step_order");



CREATE INDEX "workflow_steps_workflow_id_idx" ON "public"."workflow_steps" USING "btree" ("workflow_id");



CREATE INDEX "workflows_active_idx" ON "public"."workflows" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "workflows_list_id_idx" ON "public"."workflows" USING "btree" ("list_id");



CREATE INDEX "workflows_organization_id_idx" ON "public"."workflows" USING "btree" ("organization_id");



CREATE OR REPLACE TRIGGER "message_statuses_update_timestamp" BEFORE UPDATE ON "public"."message_statuses" FOR EACH ROW EXECUTE FUNCTION "public"."update_message_statuses_updated_at"();



CREATE OR REPLACE TRIGGER "trig_scheduled_notifications_updated_at" BEFORE UPDATE ON "public"."scheduled_notifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_enroll_workflow_contacts" AFTER INSERT OR UPDATE OF "is_active" ON "public"."workflows" FOR EACH ROW EXECUTE FUNCTION "public"."enroll_active_workflow_contacts"();



CREATE OR REPLACE TRIGGER "update_lists_updated_at" BEFORE UPDATE ON "public"."lists" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_workflows_updated_at" BEFORE UPDATE ON "public"."workflows" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_api_keys_updated_at" BEFORE UPDATE ON "public"."api_keys" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_api_endpoint_configs_updated_at" BEFORE UPDATE ON "public"."api_endpoint_configs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_endpoint_configs"
    ADD CONSTRAINT "api_endpoint_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_team_lead_id_fkey" FOREIGN KEY ("team_lead_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_contacts"
    ADD CONSTRAINT "crm_contacts_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_contacts"
    ADD CONSTRAINT "crm_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."crm_contacts"
    ADD CONSTRAINT "crm_contacts_team_lead_id_fkey" FOREIGN KEY ("team_lead_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_property_definitions"
    ADD CONSTRAINT "crm_property_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."integration_settings"
    ADD CONSTRAINT "integration_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."lists"
    ADD CONSTRAINT "lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_statuses"
    ADD CONSTRAINT "message_statuses_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_statuses"
    ADD CONSTRAINT "message_statuses_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_statuses"
    ADD CONSTRAINT "message_statuses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_templates"
    ADD CONSTRAINT "meta_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_team_lead_id_fkey" FOREIGN KEY ("team_lead_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scheduled_notifications"
    ADD CONSTRAINT "scheduled_notifications_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."scheduled_notifications"
    ADD CONSTRAINT "scheduled_notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_notifications"
    ADD CONSTRAINT "scheduled_notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."snippets"
    ADD CONSTRAINT "snippets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_team_lead_fkey" FOREIGN KEY ("assigned_to_team_lead") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_team_lead_id_fkey" FOREIGN KEY ("team_lead_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_members_hierarchy"
    ADD CONSTRAINT "team_members_hierarchy_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members_hierarchy"
    ADD CONSTRAINT "team_members_hierarchy_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members_hierarchy"
    ADD CONSTRAINT "team_members_hierarchy_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_assigned_leads"
    ADD CONSTRAINT "user_assigned_leads_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_assigned_leads"
    ADD CONSTRAINT "user_assigned_leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_assigned_leads"
    ADD CONSTRAINT "user_assigned_leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_assigned_leads"
    ADD CONSTRAINT "user_assigned_leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_enrollments"
    ADD CONSTRAINT "workflow_enrollments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_enrollments"
    ADD CONSTRAINT "workflow_enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_enrollments"
    ADD CONSTRAINT "workflow_enrollments_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."meta_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



CREATE POLICY "Access org settings" ON "public"."integration_settings" USING (("organization_id" = "public"."get_auth_user_org_id"()));



CREATE POLICY "Block all access for anon" ON "public"."scheduled_notifications" TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Block all access for authenticated users" ON "public"."scheduled_notifications" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Delete org contacts" ON "public"."crm_contacts" FOR DELETE USING (("organization_id" = "public"."get_auth_user_org_id"()));



CREATE POLICY "Delete org property definitions" ON "public"."crm_property_definitions" FOR DELETE USING (("organization_id" = "public"."get_auth_user_org_id"()));



CREATE POLICY "Deny all for anon on crm_contacts" ON "public"."crm_contacts" TO "anon" USING (false);



CREATE POLICY "Deny all for anon on messages" ON "public"."messages" TO "anon" USING (false);



CREATE POLICY "Deny all for anon on meta_templates" ON "public"."meta_templates" TO "anon" USING (false);



CREATE POLICY "Deny all for anon on snippets" ON "public"."snippets" TO "anon" USING (false);



CREATE POLICY "Full access for service_role on scheduled_notifications" ON "public"."scheduled_notifications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Insert org contacts" ON "public"."crm_contacts" FOR INSERT WITH CHECK (("organization_id" = "public"."get_auth_user_org_id"()));



CREATE POLICY "Insert org conversations" ON "public"."conversations" FOR INSERT WITH CHECK (("organization_id" = "public"."get_auth_user_org_id"()));



CREATE POLICY "Insert org notes" ON "public"."notes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "notes"."conversation_id") AND ("c"."organization_id" = "public"."get_auth_user_org_id"())))));



CREATE POLICY "Manage org properties" ON "public"."crm_property_definitions" USING (("organization_id" = "public"."get_auth_user_org_id"()));



CREATE POLICY "Manage org tasks" ON "public"."tasks" USING (("organization_id" = "public"."get_auth_user_org_id"()));



CREATE POLICY "Only admins can create organizations" ON "public"."organizations" FOR INSERT WITH CHECK (("id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Only admins can update organization details" ON "public"."organizations" FOR UPDATE USING (("id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK (("id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Service role can manage message statuses" ON "public"."message_statuses" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage messages" ON "public"."messages" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role has full access to enrollments" ON "public"."workflow_enrollments" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Update org conversations" ON "public"."conversations" FOR UPDATE USING (("organization_id" = "public"."get_auth_user_org_id"()));



CREATE POLICY "Users can create campaigns in their organization" ON "public"."campaigns" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can create crm_contacts in their organization" ON "public"."crm_contacts" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can create lists in their organization" ON "public"."lists" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can create snippets in their organization" ON "public"."snippets" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can create templates in their organization" ON "public"."meta_templates" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can create workflow_steps in their organization" ON "public"."workflow_steps" FOR INSERT WITH CHECK (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."organization_id" IN ( SELECT "profiles"."organization_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can create workflows in their organization" ON "public"."workflows" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can delete campaigns from their organization" ON "public"."campaigns" FOR DELETE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can delete crm_contacts in their organization" ON "public"."crm_contacts" FOR DELETE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can delete lists from their organization" ON "public"."lists" FOR DELETE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can delete snippets in their organization" ON "public"."snippets" FOR DELETE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can delete templates in their organization" ON "public"."meta_templates" FOR DELETE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can delete their own messages or admin can delete any" ON "public"."messages" FOR DELETE USING ((("sender_id" = ("auth"."uid"())::"text") OR ("conversation_id" IN ( SELECT "c"."id"
   FROM "public"."conversations" "c"
  WHERE (("c"."organization_id" IN ( SELECT "profiles"."organization_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))) AND (("c"."assigned_to" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))))))));



CREATE POLICY "Users can delete workflow_steps from their organization" ON "public"."workflow_steps" FOR DELETE USING (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."organization_id" IN ( SELECT "profiles"."organization_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can delete workflows from their organization" ON "public"."workflows" FOR DELETE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can insert message statuses from their organization" ON "public"."message_statuses" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can insert messages in their organization" ON "public"."messages" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can insert messages in their organization's conversations" ON "public"."messages" FOR INSERT WITH CHECK (("conversation_id" IN ( SELECT "c"."id"
   FROM "public"."conversations" "c"
  WHERE ("c"."organization_id" IN ( SELECT "profiles"."organization_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update campaigns from their organization" ON "public"."campaigns" FOR UPDATE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can update crm_contacts in their organization" ON "public"."crm_contacts" FOR UPDATE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can update lists from their organization" ON "public"."lists" FOR UPDATE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can update message statuses from their organization" ON "public"."message_statuses" FOR UPDATE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can update messages in their organization" ON "public"."messages" FOR UPDATE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can update snippets in their organization" ON "public"."snippets" FOR UPDATE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can update templates in their organization" ON "public"."meta_templates" FOR UPDATE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can update workflow_steps in their organization" ON "public"."workflow_steps" FOR UPDATE USING (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."organization_id" IN ( SELECT "profiles"."organization_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can update workflows in their organization" ON "public"."workflows" FOR UPDATE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view campaigns from their organization" ON "public"."campaigns" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view crm_contacts in their organization" ON "public"."crm_contacts" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view enrollments from their organization" ON "public"."workflow_enrollments" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view lists from their organization" ON "public"."lists" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view message statuses from their organization" ON "public"."message_statuses" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view messages from their organization" ON "public"."messages" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view messages from their organization's conversations" ON "public"."messages" FOR SELECT USING (("conversation_id" IN ( SELECT "c"."id"
   FROM "public"."conversations" "c"
  WHERE ("c"."organization_id" IN ( SELECT "profiles"."organization_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view snippets from their organization" ON "public"."snippets" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view templates from their organization" ON "public"."meta_templates" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view their organization details" ON "public"."organizations" FOR SELECT USING (("id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view workflow_steps from their organization" ON "public"."workflow_steps" FOR SELECT USING (("workflow_id" IN ( SELECT "workflows"."id"
   FROM "public"."workflows"
  WHERE ("workflows"."organization_id" IN ( SELECT "profiles"."organization_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view workflows from their organization" ON "public"."workflows" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "View org contacts" ON "public"."crm_contacts" FOR SELECT USING (("organization_id" = "public"."get_auth_user_org_id"()));



CREATE POLICY "View org conversations" ON "public"."conversations" FOR SELECT USING (("organization_id" = "public"."get_auth_user_org_id"()));



CREATE POLICY "View org notes" ON "public"."notes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "notes"."conversation_id") AND ("c"."organization_id" = "public"."get_auth_user_org_id"())))));



CREATE POLICY "admin_update_profiles" ON "public"."profiles" FOR UPDATE USING (((( SELECT "profiles_1"."role"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())) = 'admin'::"text") AND ("organization_id" = ( SELECT "profiles_1"."organization_id"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))));



ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_endpoint_configs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Users can view API keys from their organization" ON "public"."api_keys" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"()))));

CREATE POLICY "Users can create API keys in their organization" ON "public"."api_keys" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"()))));

CREATE POLICY "Users can update API keys in their organization" ON "public"."api_keys" FOR UPDATE USING (("organization_id" IN ( SELECT "profiles"."organization_id" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"()))));

CREATE POLICY "Users can delete API keys from their organization" ON "public"."api_keys" FOR DELETE USING (("organization_id" IN ( SELECT "profiles"."organization_id" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"()))));

CREATE POLICY "Service role can manage API keys" ON "public"."api_keys" USING (("auth"."role"() = 'service_role'::"text"));

CREATE POLICY "Users can view endpoint configs from their organization" ON "public"."api_endpoint_configs" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"()))));

CREATE POLICY "Users can create endpoint configs in their organization" ON "public"."api_endpoint_configs" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"()))));

CREATE POLICY "Users can update endpoint configs in their organization" ON "public"."api_endpoint_configs" FOR UPDATE USING (("organization_id" IN ( SELECT "profiles"."organization_id" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"()))));

CREATE POLICY "Users can delete endpoint configs from their organization" ON "public"."api_endpoint_configs" FOR DELETE USING (("organization_id" IN ( SELECT "profiles"."organization_id" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"()))));

CREATE POLICY "Service role can manage endpoint configs" ON "public"."api_endpoint_configs" USING (("auth"."role"() = 'service_role'::"text"));


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_select_admin" ON "public"."conversations" FOR SELECT USING ((("public"."get_current_user_role"() = 'admin'::"text") AND ("organization_id" = "public"."get_current_user_org_id"())));



CREATE POLICY "conversations_select_community" ON "public"."conversations" FOR SELECT USING ((("public"."get_current_user_role"() = 'community'::"text") AND ("lead_id" IN ( SELECT "user_assigned_leads"."contact_id"
   FROM "public"."user_assigned_leads"
  WHERE ("user_assigned_leads"."user_id" = "auth"."uid"())))));



CREATE POLICY "conversations_select_manager" ON "public"."conversations" FOR SELECT USING ((("public"."get_current_user_role"() = 'manager'::"text") AND ("team_lead_id" = "auth"."uid"())));



ALTER TABLE "public"."crm_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crm_contacts_select_admin" ON "public"."crm_contacts" FOR SELECT USING ((("public"."get_current_user_role"() = 'admin'::"text") AND ("organization_id" = "public"."get_current_user_org_id"())));



CREATE POLICY "crm_contacts_select_community" ON "public"."crm_contacts" FOR SELECT USING ((("public"."get_current_user_role"() = 'community'::"text") AND ("id" IN ( SELECT "user_assigned_leads"."contact_id"
   FROM "public"."user_assigned_leads"
  WHERE ("user_assigned_leads"."user_id" = "auth"."uid"())))));



CREATE POLICY "crm_contacts_select_manager" ON "public"."crm_contacts" FOR SELECT USING ((("public"."get_current_user_role"() = 'manager'::"text") AND ("team_lead_id" = "auth"."uid"())));



ALTER TABLE "public"."crm_property_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."integration_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_statuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meta_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_admin_org" ON "public"."profiles" FOR SELECT USING ((("public"."get_current_user_role"() = 'admin'::"text") AND ("organization_id" = "public"."get_current_user_org_id"())));



CREATE POLICY "profiles_select_manager_team" ON "public"."profiles" FOR SELECT USING ((("public"."get_current_user_role"() = 'manager'::"text") AND ("team_lead_id" = "auth"."uid"())));



CREATE POLICY "profiles_select_self" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."scheduled_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."snippets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members_hierarchy" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_assigned_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflows" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_statuses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

















































































































































































GRANT ALL ON FUNCTION "public"."calculate_avg_response_time"("org_id" "uuid", "days_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_avg_response_time"("org_id" "uuid", "days_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_avg_response_time"("org_id" "uuid", "days_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."enroll_active_workflow_contacts"() TO "anon";
GRANT ALL ON FUNCTION "public"."enroll_active_workflow_contacts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enroll_active_workflow_contacts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_auth_user_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_auth_user_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_auth_user_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_conversation_counts_by_status"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_conversation_counts_by_status"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_conversation_counts_by_status"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_daily_message_volume"("org_id" "uuid", "days_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_message_volume"("org_id" "uuid", "days_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_message_volume"("org_id" "uuid", "days_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_list_contacts"("list_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_list_contacts"("list_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_list_contacts"("list_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_message_counts_by_platform"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_message_counts_by_platform"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_message_counts_by_platform"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_agents_by_messages"("org_id" "uuid", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_agents_by_messages"("org_id" "uuid", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_agents_by_messages"("org_id" "uuid", "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_message_statuses_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_message_statuses_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_message_statuses_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."api_endpoint_configs" TO "anon";
GRANT ALL ON TABLE "public"."api_endpoint_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."api_endpoint_configs" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."crm_contacts" TO "anon";
GRANT ALL ON TABLE "public"."crm_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."crm_property_definitions" TO "anon";
GRANT ALL ON TABLE "public"."crm_property_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_property_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."integration_settings" TO "anon";
GRANT ALL ON TABLE "public"."integration_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_settings" TO "service_role";



GRANT ALL ON TABLE "public"."lists" TO "anon";
GRANT ALL ON TABLE "public"."lists" TO "authenticated";
GRANT ALL ON TABLE "public"."lists" TO "service_role";



GRANT ALL ON TABLE "public"."message_statuses" TO "anon";
GRANT ALL ON TABLE "public"."message_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."message_statuses" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."meta_templates" TO "anon";
GRANT ALL ON TABLE "public"."meta_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."meta_templates" TO "service_role";



GRANT ALL ON TABLE "public"."notes" TO "anon";
GRANT ALL ON TABLE "public"."notes" TO "authenticated";
GRANT ALL ON TABLE "public"."notes" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_notifications" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."snippets" TO "anon";
GRANT ALL ON TABLE "public"."snippets" TO "authenticated";
GRANT ALL ON TABLE "public"."snippets" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."team_members_hierarchy" TO "anon";
GRANT ALL ON TABLE "public"."team_members_hierarchy" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members_hierarchy" TO "service_role";



GRANT ALL ON TABLE "public"."user_assigned_leads" TO "anon";
GRANT ALL ON TABLE "public"."user_assigned_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."user_assigned_leads" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_logs" TO "anon";
GRANT ALL ON TABLE "public"."webhook_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_logs" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."workflow_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_steps" TO "anon";
GRANT ALL ON TABLE "public"."workflow_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_steps" TO "service_role";



GRANT ALL ON TABLE "public"."workflows" TO "anon";
GRANT ALL ON TABLE "public"."workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."workflows" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































