import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendGmailEmail, replaceMergeTags } from "../_shared/emailMessaging.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Obtener campañas programadas que deben enviarse (scheduled_at <= NOW y status = 'scheduled')
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(10);

    if (campaignsError) throw campaignsError;
    if (!campaigns?.length) {
      return successResponse(0, 0, 0);
    }

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const campaign of campaigns) {
      try {
        // Cambiar estado a 'sending'
        await supabase
          .from('campaigns')
          .update({ status: 'sending' })
          .eq('id', campaign.id);

        // Obtener contactos
        const recipientIds = campaign.recipient_ids || [];
        if (recipientIds.length === 0) {
          throw new Error('No recipients found for campaign');
        }

        const { data: contacts, error: contactsError } = await supabase
          .from('crm_contacts')
          .select('id, name, email, phone, custom_properties')
          .in('id', recipientIds)
          .eq('organization_id', campaign.organization_id);

        if (contactsError) throw contactsError;

        // Enviar a cada contacto según el tipo de campaña
        let sentCount = 0;
        let failCount = 0;

        for (const contact of contacts || []) {
          try {
            if (campaign.type === 'whatsapp') {
              // Enviar directamente a Meta sin pasar por whatsapp-send (evita problema de auth)
              const success = await sendWhatsAppDirect(supabase, campaign, contact);
              if (success) {
                sentCount++;
              } else {
                failCount++;
              }
            } else if (campaign.type === 'email') {
              // Enviar email real via Gmail API
              if (!contact.email) {
                console.warn(`Contact ${contact.id} has no email, skipping`);
                failCount++;
                continue;
              }
              const subject = replaceMergeTags(campaign.email_subject || '', contact);
              const body = replaceMergeTags(campaign.email_body || '', contact);
              const emailResult = await sendGmailEmail(supabase, {
                orgId: campaign.organization_id,
                to: contact.email,
                subject,
                body,
              });
              if (emailResult.success) {
                sentCount++;
              } else {
                console.error(`Email failed for ${contact.email}:`, emailResult.error);
                failCount++;
              }
            }
          } catch (err) {
            console.error(`Exception sending to ${contact.phone || contact.email}:`, err);
            failCount++;
          }
        }

        // Actualizar campaña con resultado
        const finalStatus = failCount === 0 ? 'sent' : failCount > sentCount ? 'partial_failed' : 'sent';
        const { error: updateError } = await supabase
          .from('campaigns')
          .update({
            status: finalStatus,
            sent_at: new Date().toISOString(),
            stats: {
              sent: sentCount,
              delivered: sentCount,
              read: 0,
              failed: failCount
            }
          })
          .eq('id', campaign.id);

        if (updateError) throw updateError;

        successCount += sentCount;
        failedCount += failCount;
        processedCount++;

      } catch (err: any) {
        console.error(`Error processing campaign ${campaign.id}:`, err);

        // Marcar campaña como fallida
        await supabase
          .from('campaigns')
          .update({
            status: 'failed',
            stats: {
              sent: 0,
              delivered: 0,
              read: 0,
              failed: campaign.recipient_count || 0
            }
          })
          .eq('id', campaign.id);

        failedCount += campaign.recipient_count || 0;
      }
    }

    return successResponse(processedCount, successCount, failedCount);

  } catch (err: any) {
    console.error('Error crítico en procesador de campañas:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function sendWhatsAppDirect(supabase: any, campaign: any, contact: any): Promise<boolean> {
  try {
    // Obtener credenciales de WhatsApp (EXACTO como whatsapp-send)
    const { data: config, error: configError } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', campaign.organization_id)
      .eq('service_name', 'whatsapp')
      .single();

    if (configError || !config?.credentials) {
      console.error('[process-campaigns] WhatsApp config not found:', configError);
      return false;
    }

    // Validar que credentials sea un objeto válido
    const credentials = config.credentials;
    if (typeof credentials !== 'object' || credentials === null) {
      console.error('[process-campaigns] Invalid credentials format:', typeof credentials);
      return false;
    }

    // Extraer valores y limpiar espacios (puede venir con espacios de JSONB)
    const phone_id = String(credentials.phone_id || credentials.phone_number_id || '').trim();
    const access_token = String(credentials.access_token || '').trim();

    if (!phone_id || !access_token) {
      console.error('[process-campaigns] Missing WhatsApp credentials', {
        phone_id: !!phone_id,
        access_token: !!access_token,
        credentialsKeys: Object.keys(credentials)
      });
      return false;
    }

    console.log(`[process-campaigns] Sending template to ${contact.phone}`);

    // Obtener template para extraer variables
    let templateBody = campaign.email_body || '';
    if (campaign.template_id) {
      const { data: templateData, error: templateError } = await supabase
        .from('meta_templates')
        .select('body')
        .eq('id', campaign.template_id)
        .single();

      if (!templateError && templateData?.body) {
        templateBody = templateData.body;
      }
    }

    // Preparar variables del template (personalización con datos del contacto)
    const templateVars: string[] = [];
    
    // Buscar variables tipo {{name}}, {{email}}, {{phone}}, etc. en el body
    if (templateBody) {
      const varMatches = templateBody.match(/\{\{(\w+)\}\}/g) || [];
      for (const match of varMatches) {
        const varName = match.replace(/[\{\}]/g, '');
        let value = '';
        
        if (varName === 'name') value = contact.name || '';
        else if (varName === 'email') value = contact.email || '';
        else if (varName === 'phone') value = contact.phone || '';
        else if (varName === 'company') value = contact.company || '';
        else if (contact.properties?.[varName]) value = String(contact.properties[varName]) || '';
        
        templateVars.push(value);
      }
    }

    console.log(`[process-campaigns] Template vars extracted: ${templateVars.length}`);

    // Guardar el texto personalizado del template (para mostrar en la plataforma)
    let personalizedText = templateBody;
    if (templateVars.length > 0) {
      // Reemplazar variables en el body con valores reales
      personalizedText = templateBody;
      const varMatches = templateBody.match(/\{\{(\w+)\}\}/g) || [];
      varMatches.forEach((match, index) => {
        if (index < templateVars.length) {
          personalizedText = personalizedText.replace(match, templateVars[index]);
        }
      });
    }

    console.log(`[process-campaigns] Personalized text:`, personalizedText);

    // Construir payload para Meta - EXACTO como whatsapp-send
    const metaBody: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: contact.phone,
      type: "template",
      template: {
        name: campaign.template_name,
        language: {
          code: campaign.template_language || "en_US"
        },
        components: []
      }
    };

    // Agregar componentes con parámetros al template
    if (templateVars.length > 0) {
      const params = templateVars.map(v => ({ type: 'text', text: v }));
      (metaBody.template as any).components.push({ type: 'body', parameters: params });
    }

    console.log(`[process-campaigns] Payload:`, JSON.stringify(metaBody));

    // Enviar a Meta - EXACTO COMO whatsapp-send (v21.0)
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phone_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${access_token}`
        },
        body: JSON.stringify(metaBody)
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`[process-campaigns] Error sending to ${contact.phone}:`, responseData);
      return false;
    }

    // Validar que Meta devolvió un ID de mensaje (como whatsapp-send)
    const metaMessageId = responseData.messages?.[0]?.id;
    if (!metaMessageId) {
      console.error('[process-campaigns] Meta API no devolvió ID de mensaje:', responseData);
      return false;
    }

    console.log(`[process-campaigns] Successfully sent to ${contact.phone}, wamid: ${metaMessageId}`);

    // GUARDAR EN BASE DE DATOS - EXACTO COMO whatsapp-send lo hace
    try {
      // Obtener o crear conversación
      let conversationId: string;
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_phone', contact.phone)
        .eq('organization_id', campaign.organization_id)
        .single();

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        const { data: newConv, error: createConvError } = await supabase
          .from('conversations')
          .insert({
            organization_id: campaign.organization_id,
            contact_phone: contact.phone,
            contact_name: contact.name || contact.phone,
            platform: 'whatsapp',
            last_message: personalizedText || campaign.template_name,
            last_message_time: new Date().toISOString(),
            unread_count: 0
          })
          .select()
          .single();

        if (createConvError || !newConv) {
          console.error('[process-campaigns] Error creating conversation:', createConvError);
          return false;
        }
        conversationId = newConv.id;
      }

      // Guardar mensaje en BD - EXACTO como whatsapp-send
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          organization_id: campaign.organization_id,
          sender_id: campaign.created_by,
          text: personalizedText || campaign.template_name,
          is_incoming: false,
          status: 'sent',
          author_name: 'Campaign System',
          type: 'template',
          metadata: {
            wamid: metaMessageId,
            template_name: campaign.template_name,
            template_language: campaign.template_language || 'en_US',
            campaign_id: campaign.id,
            template_variables: templateVars,
            template_body: templateBody
          }
        });

      if (msgError) {
        console.error('[process-campaigns] Error saving message to DB:', msgError);
        // No retornar false aquí - el mensaje se envió exitosamente a Meta aunque falle el guardado en BD
      }

      // Actualizar última mensaje en conversación
      await supabase
        .from('conversations')
        .update({
          last_message: personalizedText || `Template: ${campaign.template_name}`,
          last_message_time: new Date().toISOString()
        })
        .eq('id', conversationId);

      return true;

    } catch (dbError: any) {
      console.error('[process-campaigns] Exception saving to DB:', dbError);
      // No fallar si la BD falla - el mensaje se envió a Meta correctamente
      return true;
    }

  } catch (err: any) {
    console.error(`[process-campaigns] Exception in sendWhatsAppDirect:`, err);
    return false;
  }
}

function successResponse(processed: number, success: number, failed: number) {
  return new Response(
    JSON.stringify({
      success: true,
      processed,
      sent: success,
      failed,
      timestamp: new Date().toISOString()
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
