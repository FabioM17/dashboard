-- Migration: Fix organization_id type in snippets and meta_templates tables
-- Description: Convert organization_id from text to uuid and add foreign key constraints

-- ============================================================================
-- PASO 1: Eliminar las políticas RLS existentes
-- ============================================================================
DROP POLICY IF EXISTS "Org Isolation Templates" ON public.meta_templates;
DROP POLICY IF EXISTS "Org Isolation Snippets" ON public.snippets;

-- ============================================================================
-- PASO 2: Update meta_templates table
-- ============================================================================
ALTER TABLE public.meta_templates
  ALTER COLUMN organization_id SET DATA TYPE uuid USING organization_id::uuid;

-- Add foreign key constraint to organizations table
ALTER TABLE public.meta_templates
  ADD CONSTRAINT meta_templates_organization_id_fkey 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ============================================================================
-- PASO 3: Update snippets table
-- ============================================================================
ALTER TABLE public.snippets
  ALTER COLUMN organization_id SET DATA TYPE uuid USING organization_id::uuid;

-- Add foreign key constraint to organizations table
ALTER TABLE public.snippets
  ADD CONSTRAINT snippets_organization_id_fkey 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ============================================================================
-- PASO 4: Recrear las políticas RLS con el nuevo tipo uuid
-- ============================================================================

-- Habilitar RLS si no está habilitado
ALTER TABLE public.meta_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snippets ENABLE ROW LEVEL SECURITY;

-- Política para meta_templates
CREATE POLICY "Org Isolation Templates"
  ON public.meta_templates
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Política para snippets
CREATE POLICY "Org Isolation Snippets"
  ON public.snippets
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );
