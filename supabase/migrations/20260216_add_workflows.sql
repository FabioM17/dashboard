-- Migration: Flujos (Workflows) automáticos de WhatsApp
-- Fecha: 2026-02-16
-- Descripción: Tablas y lógica para workflows automáticos basados en Listas Dinámicas y Templates

-- ==========================================
-- TABLA: workflows
-- ==========================================
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  list_id UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.workflows IS 'Definiciones de flujos automáticos de WhatsApp basados en Listas Dinámicas';
COMMENT ON COLUMN public.workflows.list_id IS 'Lista dinámica cuyos contactos serán enrolados en este flujo';
COMMENT ON COLUMN public.workflows.is_active IS 'Si está activo, los contactos de la lista serán enrolados automáticamente';

-- Índices
CREATE INDEX workflows_organization_id_idx ON public.workflows(organization_id);
CREATE INDEX workflows_list_id_idx ON public.workflows(list_id);
CREATE INDEX workflows_active_idx ON public.workflows(is_active) WHERE is_active = true;

-- ==========================================
-- TABLA: workflow_steps
-- ==========================================
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  step_order INT NOT NULL, -- Orden del paso (1, 2, 3...)
  template_id UUID NOT NULL REFERENCES public.meta_templates(id) ON DELETE RESTRICT,
  template_name TEXT NOT NULL, -- Denormalized para referencia rápida
  delay_days INT NOT NULL DEFAULT 0, -- Días de espera antes de enviar este paso (0 = inmediato)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT workflow_steps_order_positive CHECK (step_order > 0),
  CONSTRAINT workflow_steps_delay_nonnegative CHECK (delay_days >= 0),
  CONSTRAINT workflow_steps_unique_order UNIQUE (workflow_id, step_order)
);

COMMENT ON TABLE public.workflow_steps IS 'Pasos secuenciales de cada flujo (template + delay)';
COMMENT ON COLUMN public.workflow_steps.step_order IS 'Orden de ejecución del paso en el flujo (1-indexed)';
COMMENT ON COLUMN public.workflow_steps.delay_days IS 'Días de espera desde el inicio del flujo o paso anterior';

-- Índices
CREATE INDEX workflow_steps_workflow_id_idx ON public.workflow_steps(workflow_id);
CREATE INDEX workflow_steps_order_idx ON public.workflow_steps(workflow_id, step_order);

-- ==========================================
-- TABLA: workflow_enrollments
-- ==========================================
CREATE TABLE IF NOT EXISTS public.workflow_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  current_step INT NOT NULL DEFAULT 1, -- Paso actual en el flujo
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, failed, paused
  
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_send_at TIMESTAMPTZ NOT NULL, -- Próxima fecha/hora de envío programado
  completed_at TIMESTAMPTZ,
  
  last_error TEXT, -- Último error si falla un envío
  retry_count INT NOT NULL DEFAULT 0, -- Número de reintentos
  
  CONSTRAINT workflow_enrollments_status_check CHECK (status IN ('active', 'completed', 'failed', 'paused')),
  CONSTRAINT workflow_enrollments_step_positive CHECK (current_step > 0),
  CONSTRAINT workflow_enrollments_unique_contact UNIQUE (workflow_id, contact_id)
);

COMMENT ON TABLE public.workflow_enrollments IS 'Tracking de contactos enrolados en workflows (estado y progreso)';
COMMENT ON COLUMN public.workflow_enrollments.current_step IS 'Número del paso actual en ejecución';
COMMENT ON COLUMN public.workflow_enrollments.status IS 'Estado del enrollment: active (en progreso), completed (finalizado), failed (error), paused (pausado)';
COMMENT ON COLUMN public.workflow_enrollments.next_send_at IS 'Timestamp preciso del próximo envío programado';

-- Índices
CREATE INDEX workflow_enrollments_workflow_id_idx ON public.workflow_enrollments(workflow_id);
CREATE INDEX workflow_enrollments_contact_id_idx ON public.workflow_enrollments(contact_id);
CREATE INDEX workflow_enrollments_organization_id_idx ON public.workflow_enrollments(organization_id);
CREATE INDEX workflow_enrollments_status_idx ON public.workflow_enrollments(status);
CREATE INDEX workflow_enrollments_pending_idx ON public.workflow_enrollments(next_send_at, status) 
  WHERE status = 'active';

-- ==========================================
-- FUNCIÓN: Auto-enrollment cuando se activa un workflow
-- ==========================================
CREATE OR REPLACE FUNCTION enroll_active_workflow_contacts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Trigger para auto-enrollment al activar workflow
CREATE TRIGGER trigger_enroll_workflow_contacts
AFTER INSERT OR UPDATE OF is_active ON public.workflows
FOR EACH ROW
EXECUTE FUNCTION enroll_active_workflow_contacts();

-- ==========================================
-- FUNCIÓN: Resolver contactos de una lista dinámica
-- ==========================================
-- Esta función resuelve los contactos de una lista usando filtros y manual_contact_ids
-- Puede ser llamada desde el frontend o Edge Functions
CREATE OR REPLACE FUNCTION get_list_contacts(list_uuid UUID)
RETURNS TABLE(contact_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION get_list_contacts IS 'Resuelve los contactos de una lista dinámica aplicando filtros y manual_contact_ids';

-- ==========================================
-- TRIGGER: Update updated_at en workflows
-- ==========================================
CREATE TRIGGER update_workflows_updated_at
BEFORE UPDATE ON public.workflows
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- RLS (Row Level Security)
-- ==========================================
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_enrollments ENABLE ROW LEVEL SECURITY;

-- Policies para workflows
CREATE POLICY "Users can view workflows from their organization"
  ON public.workflows FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can create workflows in their organization"
  ON public.workflows FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update workflows in their organization"
  ON public.workflows FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete workflows from their organization"
  ON public.workflows FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Policies para workflow_steps
CREATE POLICY "Users can view workflow_steps from their organization"
  ON public.workflow_steps FOR SELECT
  USING (workflow_id IN (
    SELECT id FROM workflows WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can create workflow_steps in their organization"
  ON public.workflow_steps FOR INSERT
  WITH CHECK (workflow_id IN (
    SELECT id FROM workflows WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can update workflow_steps in their organization"
  ON public.workflow_steps FOR UPDATE
  USING (workflow_id IN (
    SELECT id FROM workflows WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can delete workflow_steps from their organization"
  ON public.workflow_steps FOR DELETE
  USING (workflow_id IN (
    SELECT id FROM workflows WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  ));

-- Policies para workflow_enrollments
CREATE POLICY "Users can view enrollments from their organization"
  ON public.workflow_enrollments FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Service role has full access to enrollments"
  ON public.workflow_enrollments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ==========================================
-- PG_CRON: Programar ejecución periódica de process-workflows
-- ==========================================
-- Ejecutar cada minuto para procesar workflows pendientes
-- NOTA: Ejecutar esto manualmente en la consola de Supabase SQL Editor:
/*
SELECT cron.schedule(
  'process-workflows-job',
  '* * * * *', -- Cada minuto
  $$
  SELECT net.http_post(
    url := 'YOUR_SUPABASE_PROJECT_URL/functions/v1/process-workflows',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SUPABASE_ANON_KEY'
    ),
    body := jsonb_build_object('scheduled', true)
  ) AS request_id;
  $$
);
*/

-- Para ver jobs activos: SELECT * FROM cron.job;
-- Para eliminar: SELECT cron.unschedule('process-workflows-job');

COMMENT ON TABLE public.workflows IS 'Workflows automáticos de mensajería. Ejecutados por pg_cron cada minuto.';
