-- Migración: Agregar tabla message_statuses para rastrear estados de mensajes de WhatsApp
-- Descripción: Almacena información detallada sobre estados de mensajes (sent, delivered, read, failed)
--              con información de precios y metadatos de WhatsApp

CREATE TABLE IF NOT EXISTS message_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  
  -- Identificadores de WhatsApp
  whatsapp_message_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  display_phone_number TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  
  -- Estado y timestamps
  status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  timestamp_unix BIGINT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  
  -- Información de precios de WhatsApp
  pricing JSONB,
  
  -- Metadatos adicionales
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Campos de auditoría
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraints
  CONSTRAINT unique_whatsapp_status UNIQUE (whatsapp_message_id, organization_id)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_message_statuses_organization_id 
  ON message_statuses(organization_id);

CREATE INDEX IF NOT EXISTS idx_message_statuses_message_id 
  ON message_statuses(message_id);

CREATE INDEX IF NOT EXISTS idx_message_statuses_conversation_id 
  ON message_statuses(conversation_id);

CREATE INDEX IF NOT EXISTS idx_message_statuses_whatsapp_message_id 
  ON message_statuses(whatsapp_message_id);

CREATE INDEX IF NOT EXISTS idx_message_statuses_status 
  ON message_statuses(status);

CREATE INDEX IF NOT EXISTS idx_message_statuses_timestamp 
  ON message_statuses(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_message_statuses_phone_number_id 
  ON message_statuses(phone_number_id);

-- RLS (Row Level Security) - Solo ver estados de la propia organización
ALTER TABLE message_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view message statuses from their organization"
  ON message_statuses
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage message statuses"
  ON message_statuses
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can insert message statuses from their organization"
  ON message_statuses
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update message statuses from their organization"
  ON message_statuses
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles 
      WHERE id = auth.uid()
    )
  );

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_message_statuses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS message_statuses_update_timestamp ON message_statuses;
CREATE TRIGGER message_statuses_update_timestamp
  BEFORE UPDATE ON message_statuses
  FOR EACH ROW
  EXECUTE FUNCTION update_message_statuses_updated_at();

-- Comentarios para documentación
COMMENT ON TABLE message_statuses IS 'Rastreo de estados de mensajes de WhatsApp con información de precios y metadatos';
COMMENT ON COLUMN message_statuses.pricing IS 'Información de facturación de WhatsApp: billable, pricing_model, category, type';
COMMENT ON COLUMN message_statuses.metadata IS 'Metadatos adicionales como messaging_product y otros datos de webhook';
