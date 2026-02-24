-- Migración: Agregar organization_id a tabla messages
-- Descripción: Permite filtrar mensajes por organización en Supabase Realtime
--              y asegurar que cada organización solo ve sus mensajes

BEGIN;

-- 1. Agregar columna organization_id a messages
ALTER TABLE public.messages 
ADD COLUMN organization_id UUID;

-- 2. Crear foreign key a organizations
ALTER TABLE public.messages
ADD CONSTRAINT messages_organization_id_fkey 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 3. Copiar organization_id de la conversación relacionada
UPDATE public.messages m
SET organization_id = c.organization_id
FROM public.conversations c
WHERE m.conversation_id = c.id;

-- 4. Hacer la columna NOT NULL después de poblar datos
ALTER TABLE public.messages 
ALTER COLUMN organization_id SET NOT NULL;

-- 5. Crear índice para mejor performance en queries
CREATE INDEX IF NOT EXISTS idx_messages_organization_id 
ON public.messages(organization_id);

-- 6. Crear índice compuesto para queries comunes
CREATE INDEX IF NOT EXISTS idx_messages_org_conversation
ON public.messages(organization_id, conversation_id);

-- 7. Crear índice para Realtime filters
CREATE INDEX IF NOT EXISTS idx_messages_org_timestamp
ON public.messages(organization_id, created_at DESC);

-- 8. Habilitar RLS en messages (si no está ya habilitado)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 9. Crear políticas RLS para messages
DROP POLICY IF EXISTS "Users can view messages from their organization" ON public.messages;
CREATE POLICY "Users can view messages from their organization"
  ON public.messages
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles 
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert messages in their organization" ON public.messages;
CREATE POLICY "Users can insert messages in their organization"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles 
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update messages in their organization" ON public.messages;
CREATE POLICY "Users can update messages in their organization"
  ON public.messages
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles 
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can manage messages" ON public.messages;
CREATE POLICY "Service role can manage messages"
  ON public.messages
  FOR ALL
  USING (auth.role() = 'service_role');

COMMIT;

-- Verificación post-migración
-- SELECT COUNT(*) FROM public.messages WHERE organization_id IS NULL; -- Debería retornar 0
-- SELECT DISTINCT organization_id FROM public.messages LIMIT 5; -- Ver organizaciones
