
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { conversation_id, action, scheduled_time, author_id } = await req.json();

    if (!conversation_id || !action) throw new Error("Missing required fields");

    // 1. Obtener Datos del Contacto
    const { data: conv, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('contact_name, contact_phone, organization_id')
      .eq('id', conversation_id)
      .single();

    if (convError || !conv) throw new Error("Conversation not found");

    // 2. Insertar Log de "Llamada Iniciada" en el chat INMEDIATAMENTE
    // Esto da feedback instantáneo al usuario en la UI
    const { error: msgError } = await supabaseAdmin
        .from('messages')
        .insert({
            conversation_id: conversation_id,
            sender_id: 'system_call_bot',
            text: action === 'schedule' 
                ? `Call scheduled for ${new Date(scheduled_time).toLocaleString()}` 
                : "Initiating voice call...",
            is_incoming: false,
            type: 'call_log', // Nuevo tipo
            status: 'sent',
            author_name: 'Retell AI',
            metadata: {
                call_status: action === 'schedule' ? 'scheduled' : 'ringing',
                scheduled_time: scheduled_time || null,
                initiated_by: author_id
            }
        });

    if (msgError) {
        console.error("Error creating call log:", msgError);
        // No detenemos el proceso, pero logueamos el error
    }

    // 3. Obtener Configuración y Llamar a n8n
    const { data: config } = await supabaseAdmin
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', conv.organization_id)
      .eq('service_name', 'retell')
      .single();

    if (!config?.credentials?.webhook_url) {
        throw new Error("Voice/Retell Webhook not configured in Settings.");
    }

    const n8nUrl = config.credentials.webhook_url;

    const payload = {
        action: action, 
        phone: conv.contact_phone,
        name: conv.contact_name,
        scheduled_time: scheduled_time || null,
        conversation_id: conversation_id,
        timestamp: new Date().toISOString()
    };

    // Fire to n8n
    const response = await fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`N8N Error: ${response.statusText}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Request sent to Voice Bot" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )

  } catch (error) {
    console.error("Trigger Retell Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    )
  }
})
