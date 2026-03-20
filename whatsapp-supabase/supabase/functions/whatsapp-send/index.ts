// whatsapp-send/index.ts - ACTUALIZACIÓN PARA SOPORTAR MEDIA
// Este es el código completo actualizado para manejar imágenes, audio y documentos

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Validation functions
const validateUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone?.replace(/[\s\-\(\)]/g, '') || '');
};

const validateText = (text: string): { valid: boolean; error?: string } => {
  if (!text) return { valid: true }; // Text is optional for media
  if (text.length > 4096) {
    return { valid: false, error: 'Text exceeds 4096 characters' };
  }
  if (/<script|javascript:|on\w+=/i.test(text)) {
    return { valid: false, error: 'Text contains potentially malicious content' };
  }
  return { valid: true };
};

const validateFileName = (fileName: string): { valid: boolean; error?: string } => {
  if (!fileName) return { valid: true };
  if (fileName.length > 255) {
    return { valid: false, error: 'File name too long' };
  }
  if (/\.\.\/|\.\.\\/.test(fileName)) {
    return { valid: false, error: 'Invalid file name (path traversal)' };
  }
  return { valid: true };
};

const sanitizeText = (text: string): string => {
  return text
    ?.replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim() || '';
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== "POST") {
      return new Response("Method not allowed", { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // --- AUTH & ORG GUARD: require valid JWT and enforce org isolation ---
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '')
      : undefined;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing bearer token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = authData.user.id;
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'Unauthorized: user has no organization' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const requesterOrgId = profile.organization_id as string;

    // ACTUALIZADO: Incluir parámetros de media
    const { 
      id, 
      conversation_id, 
      text, 
      sender_id, 
      author_name, 
      type, 
      template_name, 
      template_language, 
      template_variables,
      to, 
      organization_id,
      // NUEVOS CAMPOS PARA MEDIA
      attachmentUrl,
      media_path,
      media_mime_type,
      media_size,
      fileName,
      // MULTI-PHONE: ID del número específico desde whatsapp_phone_numbers
      whatsapp_phone_number_id,
      // WHATSAPP FLOWS: campos para enviar un flow interactivo
      flow_id,           // whatsapp_flows.id (UUID interno de nuestra BD)
      flow_cta,          // Texto del botón CTA (ej: "Abrir formulario")
      flow_body,         // Texto del cuerpo del mensaje
    } = await req.json();

    // VALIDATIONS
    // 1. Validate conversation_id or (to + organization_id)
    if (conversation_id && !validateUUID(conversation_id)) {
      return new Response(JSON.stringify({ error: 'Invalid conversation_id format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (organization_id && !validateUUID(organization_id)) {
      return new Response(JSON.stringify({ error: 'Invalid organization_id format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Validate phone number if provided
    if (to && !validatePhone(to)) {
      return new Response(JSON.stringify({ error: 'Invalid phone number format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Validate text content
    if (text) {
      const textValidation = validateText(text);
      if (!textValidation.valid) {
        return new Response(JSON.stringify({ error: textValidation.error }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 4. Validate file name if provided
    if (fileName) {
      const fileValidation = validateFileName(fileName);
      if (!fileValidation.valid) {
        return new Response(JSON.stringify({ error: fileValidation.error }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 5. Sanitize text
    const sanitizedText = text ? sanitizeText(text) : text;

    let contactPhone = to;
    let orgId = organization_id;
    let finalConversationId = conversation_id;

    // A. Obtener o Asegurar Conversación
    if (conversation_id) {
        const { data: conv, error: convError } = await supabaseAdmin
          .from('conversations')
          .select('contact_phone, organization_id')
          .eq('id', conversation_id)
          .single();

        if (convError || !conv) {
          console.error('[whatsapp-send] Conversation not found:', convError);
          throw new Error("Conversación no encontrada.");
        }

        // Enforce org isolation: requester must belong to the conversation org
        if (conv.organization_id !== requesterOrgId) {
          return new Response(JSON.stringify({ error: 'Forbidden: cross-organization access' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        contactPhone = conv.contact_phone;
        orgId = conv.organization_id;
    } else if (to && organization_id) {
        // Enforce org isolation on campaign-style send
        if (organization_id !== requesterOrgId) {
          return new Response(JSON.stringify({ error: 'Forbidden: organization mismatch' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Validate required fields for campaign mode
        if (!validatePhone(to)) {
          throw new Error("Invalid phone number format for campaign");
        }

        const { data: existingConv } = await supabaseAdmin
            .from('conversations')
            .select('id')
            .eq('contact_phone', to)
            .eq('organization_id', organization_id)
            .single();
        
        if (existingConv) {
            finalConversationId = existingConv.id;
        } else {
            const { data: newConv, error: createError } = await supabaseAdmin
                .from('conversations')
                .insert({
                    organization_id: organization_id,
                    contact_phone: to,
                    contact_name: to,
                    platform: 'whatsapp',
                    last_message: text,
                    last_message_time: new Date().toISOString(),
                    unread_count: 0
                })
                .select()
                .single();
            
            if (createError) throw new Error("Error creando conversación para el contacto.");
            finalConversationId = newConv.id;
        }
    } else {
        throw new Error("Se requiere conversation_id o (to + organization_id).");
    }

    // B. Obtener Credenciales de WhatsApp
    // Priority: 1) whatsapp_phone_number_id → per-phone token
    //           2) conversation.whatsapp_phone_number_id → per-phone token
    //           3) integration_settings → org-level fallback (backward compat)
    let phone_id: string | undefined;
    let access_token: string | undefined;

    // Try to resolve from whatsapp_phone_numbers table first
    const resolvePhoneId = whatsapp_phone_number_id || null;
    let convPhoneNumberId = null;
    if (!resolvePhoneId && finalConversationId) {
      // Check if conversation has an assigned phone number
      const { data: convData } = await supabaseAdmin
        .from('conversations')
        .select('whatsapp_phone_number_id')
        .eq('id', finalConversationId)
        .single();
      convPhoneNumberId = convData?.whatsapp_phone_number_id || null;
    }

    const phoneRecordId = resolvePhoneId || convPhoneNumberId;
    if (phoneRecordId) {
      const { data: phoneRecord } = await supabaseAdmin
        .from('whatsapp_phone_numbers')
        .select('phone_number_id, access_token, waba_id')
        .eq('id', phoneRecordId)
        .eq('organization_id', orgId)
        .single();

      if (phoneRecord) {
        phone_id = phoneRecord.phone_number_id;
        access_token = phoneRecord.access_token;
      }
    }

    // Fallback: if no per-phone token, try org-level default phone, then integration_settings
    if (!phone_id || !access_token) {
      // Try default phone number
      const { data: defaultPhone } = await supabaseAdmin
        .from('whatsapp_phone_numbers')
        .select('phone_number_id, access_token')
        .eq('organization_id', orgId)
        .eq('is_default', true)
        .limit(1)
        .single();

      if (defaultPhone?.phone_number_id && defaultPhone?.access_token) {
        phone_id = phone_id || defaultPhone.phone_number_id;
        access_token = access_token || defaultPhone.access_token;
      }
    }

    if (!phone_id || !access_token) {
      // Final fallback: integration_settings (backward compatibility)
      const { data: config, error: configError } = await supabaseAdmin
        .from('integration_settings')
        .select('credentials')
        .eq('organization_id', orgId)
        .eq('service_name', 'whatsapp')
        .single();

      if (configError || !config?.credentials) {
        throw new Error("No se encontró configuración de WhatsApp para esta organización.");
      }

      phone_id = phone_id || config.credentials.phone_id;
      access_token = access_token || config.credentials.access_token;
    }

    if (!phone_id || !access_token) {
      throw new Error("No se encontraron credenciales válidas de WhatsApp. Verifica la configuración del número.");
    }

    // C. ACTUALIZADO: Construir Payload para Meta según tipo de contenido
    const metaBody: Record<string, unknown> = {
        messaging_product: "whatsapp",
        to: contactPhone
    };

    if (type === 'flow' && flow_id) {
      // ================================================================
      // WHATSAPP FLOWS: Enviar un formulario interactivo de varias pantallas
      // El flow_id es el UUID interno (whatsapp_flows.id).
      // Buscamos el registro del flow para obtener el meta_flow_id, cta, body y first_screen.
      // Generamos un flow_token único para rastrear esta entrega.
      // ================================================================

      // Validate flow_id format
      if (!validateUUID(flow_id)) {
        return new Response(JSON.stringify({ error: 'Invalid flow_id format' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: flowRecord, error: flowErr } = await supabaseAdmin
        .from('whatsapp_flows')
        .select('meta_flow_id, cta_text, body_text, first_screen, field_mappings, status')
        .eq('id', flow_id)
        .eq('organization_id', orgId)
        .single();

      if (flowErr || !flowRecord) {
        return new Response(JSON.stringify({ error: 'Flow no encontrado o no pertenece a esta organización.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (flowRecord.status === 'inactive' || flowRecord.status === 'deprecated') {
        return new Response(JSON.stringify({ error: 'El flow está inactivo o deprecado.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Generate a unique flow_token for this specific delivery
      const flowToken = `ft_${crypto.randomUUID().replace(/-/g, '')}`;

      // Resolve contact_id from conversation if available
      let contactIdForSend: string | null = null;
      if (finalConversationId) {
        const { data: convContact } = await supabaseAdmin
          .from('conversations')
          .select('lead_id')
          .eq('id', finalConversationId)
          .single();
        contactIdForSend = convContact?.lead_id || null;
      }

      // Pre-register the send so we can match on nfm_reply
      const { data: flowSendRecord, error: flowSendErr } = await supabaseAdmin
        .from('whatsapp_flow_sends')
        .insert({
          organization_id: orgId,
          flow_id: flow_id,
          contact_id: contactIdForSend,
          conversation_id: finalConversationId || null,
          phone_number: contactPhone,
          flow_token: flowToken,
          status: 'sent',
        })
        .select('id')
        .single();

      if (flowSendErr) {
        console.error('[whatsapp-send] Failed to save flow_send record:', flowSendErr);
        // Non-fatal — continue sending; we'll lose token matching but still deliver the message
      }

      // Build the interactive flow payload
      const interactiveAction: Record<string, unknown> = {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: flowToken,
          flow_id: flowRecord.meta_flow_id,
          flow_cta: flow_cta || flowRecord.cta_text || 'Abrir formulario',
          flow_action: 'navigate',
        },
      };

      if (flowRecord.first_screen) {
        (interactiveAction.parameters as Record<string, unknown>).flow_action_payload = {
          screen: flowRecord.first_screen,
        };
      }

      metaBody.type = 'interactive';
      metaBody.interactive = {
        type: 'flow',
        body: {
          text: flow_body || flowRecord.body_text || 'Por favor, completa el formulario.',
        },
        action: interactiveAction,
      };

      console.log('[whatsapp-send] Sending flow', {
        meta_flow_id: flowRecord.meta_flow_id,
        flow_token: flowToken,
        flow_send_id: flowSendRecord?.id,
      });

    } else if (type === 'template' && template_name) {
      // TEMPLATES: Las variables son OPCIONALES - depende de la plantilla
      metaBody.type = "template";
      metaBody.template = {
        name: template_name,
        language: {
          code: template_language || "en_US"
        },
        components: []
      };

      // Si el cliente pasó variables, usarlas. Si no, la plantilla puede no tener parámetros
      console.log('[whatsapp-send] received template_variables:', template_variables);
      
      if (template_variables && Array.isArray(template_variables) && template_variables.length > 0) {
        // Agregar parámetros solo si hay variables
        const params = (template_variables as string[]).map(v => ({ type: 'text', text: String(v) }));
        (metaBody.template as any).components.push({ type: 'body', parameters: params });
        console.log('[whatsapp-send] Template variables added:', template_variables.length);
      } else {
        console.log('[whatsapp-send] Template sent without parameters (template may not require any)');
      }
        
    } else if (type === 'image' && (attachmentUrl || media_path)) {
        // IMÁGENES: Nuevo flujo
        metaBody.type = "image";
        
        if (attachmentUrl) {
            // Usar URL pública desde Supabase Storage
            metaBody.image = {
                link: attachmentUrl
            };
        } else if (media_path) {
            // Fallback: Descargar desde Supabase Storage e invocar Media Upload API
            // (implementación más compleja, ver nota abajo)
            metaBody.image = {
                link: `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/whatsapp-media/${encodeURI(media_path)}`
            };
        }
        
    } else if (type === 'audio' && (attachmentUrl || media_path)) {
        // AUDIO: Nuevo flujo
        metaBody.type = "audio";
        
        if (attachmentUrl) {
            metaBody.audio = {
                link: attachmentUrl
            };
        } else if (media_path) {
            metaBody.audio = {
                link: `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/whatsapp-media/${encodeURI(media_path)}`
            };
        }
        
    } else if (type === 'document' && (attachmentUrl || media_path)) {
        // DOCUMENTOS: Nuevo flujo
        metaBody.type = "document";
        
        if (attachmentUrl) {
            metaBody.document = {
                link: attachmentUrl,
                filename: fileName || 'document'
            };
        } else if (media_path) {
            metaBody.document = {
                link: `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/whatsapp-media/${encodeURI(media_path)}`,
                filename: fileName || 'document'
            };
        }
        
    } else if (type === 'file' && (attachmentUrl || media_path)) {
        // ARCHIVOS GENÉRICOS: Mapear a 'document'
        metaBody.type = "document";
        
        if (attachmentUrl) {
            metaBody.document = {
                link: attachmentUrl,
                filename: fileName || 'file'
            };
        } else if (media_path) {
            metaBody.document = {
                link: `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/whatsapp-media/${encodeURI(media_path)}`,
                filename: fileName || 'file'
            };
        }
        
    } else {
        // DEFAULT: Texto (usar texto sanitizado)
        metaBody.type = "text";
        metaBody.text = { body: sanitizedText || text || 'Attachment sent' };
    }

    console.log(`[whatsapp-send] Enviando ${type} a ${contactPhone}`, { 
      type, 
      hasAttachment: !!(attachmentUrl || media_path),
      textLength: text?.length 
    });
    console.log('[whatsapp-send] metaBody before send:', JSON.stringify(metaBody));

    // D. Enviar a Meta con timeout y retry
    let metaResponse;
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout
        
        metaResponse = await fetch(
          `https://graph.facebook.com/v21.0/${phone_id}/messages`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(metaBody),
            signal: controller.signal
          }
        );
        
        clearTimeout(timeoutId);
        break; // Success, exit retry loop
      } catch (fetchError) {
        retryCount++;
        console.error(`[whatsapp-send] Attempt ${retryCount} failed:`, fetchError);
        
        if (retryCount > maxRetries) {
          throw new Error(`Failed to send message after ${maxRetries} retries: ${fetchError}`);
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }

    if (!metaResponse) {
      throw new Error('Failed to get response from Meta API');
    }

    const metaData = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error("[whatsapp-send] Meta API Error:", metaData);
      const metaError = metaData.error || {};
      const errorMessage = metaError.message || 'Unknown Meta API error';
      const errorCode = metaError.code || 'UNKNOWN';
      const errorType = metaError.type || 'UNKNOWN';

      // Responder sin guardar en DB, con status adecuado
      const isExpiredToken = Number(errorCode) === 190 || Number(metaError.error_subcode) === 463;
      const clientMessage = isExpiredToken
        ? 'El token de WhatsApp/Facebook ha expirado. Vuelve a conectar la integración.'
        : `Meta API Error [${errorCode}/${errorType}]: ${errorMessage}`;

      return new Response(JSON.stringify({
        error: clientMessage,
        metaError,
      }), {
        status: isExpiredToken ? 401 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validar que Meta devolvió un ID de mensaje
    const metaMessageId = metaData.messages?.[0]?.id;
    if (!metaMessageId) {
      console.error('[whatsapp-send] Meta API no devolvió ID de mensaje:', metaData);
      return new Response(JSON.stringify({
        error: 'Meta API no devolvió identificador de mensaje. No se almacenó en BD.',
        metaResponse: metaData
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // E. Validar UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const finalId = (id && uuidRegex.test(id)) ? id : undefined;

    // E1. If this was a flow send, update the wamid on the send record
    if (type === 'flow' && metaMessageId) {
      await supabaseAdmin
        .from('whatsapp_flow_sends')
        .update({ wamid: metaMessageId })
        .eq('organization_id', orgId)
        // Find by phone + very recent send (within last 30s) to avoid updating wrong record if token wasn't stored
        .eq('phone_number', contactPhone)
        .is('wamid', null)
        .gte('sent_at', new Date(Date.now() - 30000).toISOString());
    }

    // F. ACTUALIZADO: Guardar en Base de Datos con campos de media
    const { data: msgData, error: insertError } = await supabaseAdmin
      .from('messages')
      .insert({
        ...(finalId ? { id: finalId } : {}),
        conversation_id: finalConversationId,
        organization_id: orgId,
        sender_id: sender_id,
        text: sanitizedText || text || `${type} attachment`,
        is_incoming: false,
        status: 'sent',
        author_name: author_name,
        type: type || 'text',
        // NUEVOS CAMPOS DE ALMACENAMIENTO
        media_path: media_path || null,
        media_mime_type: media_mime_type || null,
        media_size: media_size || null,
        // METADATA
        metadata: { 
          wamid: metaMessageId,
            attachmentUrl: attachmentUrl,
            fileName: fileName,
            template_name: template_name,
            media_mime_type: media_mime_type,
            flow_id: flow_id || null,
        }
      })
      .select()
      .single();

    if (insertError) {
        console.error("DB Insert Error:", insertError);
        throw new Error(`Error guardando mensaje en DB: ${insertError.message}`);
    }

    // G. Actualizar Conversación
    const lastMessagePreview = 
        type === 'image' ? '📷 Image' :
        type === 'audio' ? '🎵 Audio' :
        type === 'document' || type === 'file' ? '📄 Document' :
        sanitizedText || text || 'Attachment';

    await supabaseAdmin
      .from('conversations')
      .update({ 
          last_message: lastMessagePreview,
          last_message_time: new Date().toISOString()
      })
      .eq('id', finalConversationId);

    console.log(`[whatsapp-send] Mensaje guardado: ${msgData.id}`);

    return new Response(JSON.stringify(msgData), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error: unknown) {
    console.error("[whatsapp-send] Function Error:", error);
    
    // Provide detailed error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorDetails = error instanceof Error ? error.toString() : String(error);
    
    if (error instanceof Error && error.stack) {
      console.error("[whatsapp-send] Error stack:", error.stack);
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      details: errorDetails
    }), { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

/*
NOTAS IMPORTANTES:

1. FLUJO RECOMENDADO DE MEDIA:
   - Cliente sube archivo a Supabase Storage via storageService.uploadFile()
   - Cliente obtiene attachmentUrl (URL pública)
   - Cliente envía attachmentUrl en el payload a chatService.sendMessage()
   - Edge Function usa attachmentUrl directamente en metaBody
   - Meta descarga desde esa URL públicamente accesible

2. REQUISITOS PREVIOS:
   - Supabase Storage bucket "whatsapp-media" debe ser PUBLIC
   - Si es privado, necesitarás implementar Media Upload API flow (más complejo)

3. TIPOS SOPORTADOS:
   - 'text': Mensaje de texto
   - 'image': Imagen (PNG, JPG, etc.)
   - 'audio': Audio (MP3, OGG, etc.)
   - 'document' o 'file': PDF, DOCX, etc.
   - 'template': Template de WhatsApp (sin cambios)

4. ALTERNATIVA CON MEDIA UPLOAD API (si bucket no es público):
   - Descargar archivo de Supabase Storage usando admin client
   - POST multipart/form-data a: https://graph.facebook.com/v21.0/{phone_id}/media
   - Obtener media_id
   - Enviar mensaje con media_object_id en lugar de link
   - Más lento pero más seguro para archivos privados

5. ERROR HANDLING:
   - Si Meta API falla, el error se loguea pero el mensaje se guarda como 'sent'
   - Considera implementar retry logic o webhook para confirmar entrega

6. LOGGING:
   - Agregué console.log para debugging
   - Verifica en Supabase Logs → Edge Functions para troubleshooting
*/
