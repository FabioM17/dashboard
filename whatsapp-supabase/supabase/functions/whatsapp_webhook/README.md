# WhatsApp Webhook - Multi-Organización

Este webhook ahora soporta **múltiples organizaciones** de forma completamente independiente.

## 🎯 Características

- ✅ **Webhook único por organización**: Cada organización tiene su propio webhook URL con su `orgId`
- ✅ **Verify Token individual**: Cada organización usa su propio `verify_token` almacenado en `integration_settings`
- ✅ **Conversaciones aisladas**: Las conversaciones se filtran y crean con `organization_id`
- ✅ **Sin conflictos**: Dos organizaciones pueden recibir mensajes del mismo número sin mezclarse

## 📋 Configuración por Organización

### 1. Guardar credenciales en la base de datos

Cada organización debe tener sus credenciales en la tabla `integration_settings`:

```sql
INSERT INTO integration_settings (organization_id, service_name, credentials)
VALUES (
  '605a2c1c-4923-471c-ae79-135b4eaf27ff',  -- Tu organization_id
  'whatsapp',
  jsonb_build_object(
    'phone_id', '104523...',
    'waba_id', '100342...',
    'access_token', 'EAA...',
    'verify_token', 'tu-token-unico-aleatorio-123'  -- ⚠️ IMPORTANTE: Debe ser único
  )
);
```

### 2. Configurar webhook en Meta

Cada organización debe configurar en Meta Business Manager:

**Callback URL:**
```
https://tu-proyecto.supabase.co/functions/v1/whatsapp_webhook?orgId=605a2c1c-4923-471c-ae79-135b4eaf27ff
```

**Verify Token:**
```
tu-token-unico-aleatorio-123
```
*(Debe coincidir con el guardado en `integration_settings`)*

**Webhook Fields a suscribir:**
- ✅ `messages` (requerido para chat entrante)
- ✅ `message_template_status_update` (para sincronizar templates)

## 🔄 Flujo de Verificación

1. Meta envía `GET` request con `hub.verify_token` y `?orgId=...`
2. Webhook extrae el `orgId` del query parameter
3. Busca en `integration_settings` el `verify_token` de esa organización
4. Compara el token recibido con el almacenado
5. Si coincide, responde con el `hub.challenge` ✅

## 📨 Flujo de Mensajes Entrantes

1. Meta envía `POST` request con el mensaje y `?orgId=...`
2. Webhook extrae el `orgId`
3. Busca conversación existente filtrando por:
   - `contact_phone` (número del cliente)
   - `organization_id` (para aislar organizaciones)
4. Si no existe, crea nueva conversación **con** `organization_id`
5. Guarda el mensaje asociado a esa conversación

## ✅ Ventajas del Diseño Multi-Org

- **Escalabilidad**: Puedes tener 1000+ organizaciones en el mismo proyecto
- **Seguridad**: Cada org solo ve sus propias conversaciones
- **Simplicidad**: Un solo webhook para todas las organizaciones
- **Mantenimiento**: Actualizaciones se aplican a todas las organizaciones automáticamente

## 🚨 Importante

### ⚠️ Cada organización DEBE tener su propio verify_token

**❌ NO hagas esto:**
```sql
-- MAL: Todas las orgs con el mismo token
verify_token: 'mismo-token-para-todos'
```

**✅ HAZ esto:**
```sql
-- BIEN: Cada org con token único
verify_token: 'org1-a1b2c3d4e5f6'  -- Organización 1
verify_token: 'org2-x9y8z7w6v5u4'  -- Organización 2
```

Puedes generar tokens únicos en JavaScript:
```javascript
const verifyToken = Math.random().toString(36).substring(2, 15) + 
                    Math.random().toString(36).substring(2, 15);
```

## 🔍 Logs y Debug

El webhook ahora incluye logs con el `orgId`:
```
[Org: 605a2c1c-...] Mensaje recibido de John Doe (+1234567890): Hola
```

Esto facilita el debug cuando tienes múltiples organizaciones activas.

## 🧪 Testing

Para probar una organización específica:

```bash
# Verificación (GET)
curl "https://tu-proyecto.supabase.co/functions/v1/whatsapp_webhook?orgId=605a2c1c-4923-471c-ae79-135b4eaf27ff&hub.mode=subscribe&hub.verify_token=tu-token&hub.challenge=test123"

# Debería responder: test123

# Mensaje de prueba (POST)
curl -X POST "https://tu-proyecto.supabase.co/functions/v1/whatsapp_webhook?orgId=605a2c1c-4923-471c-ae79-135b4eaf27ff" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "+1234567890",
            "id": "test123",
            "type": "text",
            "text": { "body": "Test message" }
          }],
          "contacts": [{
            "profile": { "name": "Test User" }
          }]
        }
      }]
    }]
  }'
```

## 📊 Consultas Útiles

### Ver configuraciones de todas las organizaciones
```sql
SELECT 
  organization_id,
  credentials->>'phone_id' as phone_id,
  credentials->>'waba_id' as waba_id,
  updated_at
FROM integration_settings
WHERE service_name = 'whatsapp'
ORDER BY updated_at DESC;
```

### Ver conversaciones por organización
```sql
SELECT 
  o.name as organization_name,
  COUNT(c.id) as total_conversations
FROM conversations c
JOIN organizations o ON c.organization_id = o.id
GROUP BY o.id, o.name
ORDER BY total_conversations DESC;
```
