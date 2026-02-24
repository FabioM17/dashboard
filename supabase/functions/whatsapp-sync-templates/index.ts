
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { organization_id } = await req.json();

    if (!organization_id) throw new Error("Organization ID required");

    // 1. Obtener Credenciales
    const { data: config, error: configError } = await supabaseAdmin
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organization_id)
      .eq('service_name', 'whatsapp')
      .single();

    if (configError || !config?.credentials?.waba_id || !config?.credentials?.access_token) {
        throw new Error("Missing WhatsApp Configuration (WABA ID or Token) in Settings.");
    }

    const { waba_id, access_token } = config.credentials;

    // 2. Fetch Templates from Meta
    const url = `https://graph.facebook.com/v18.0/${waba_id}/message_templates?limit=100`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${access_token}` }
    });

    const metaData = await response.json();

    if (metaData.error) {
        throw new Error(`Meta API Error: ${metaData.error.message}`);
    }

    const templates = metaData.data || [];

    // 3. Process and Upsert into DB
    let count = 0;
    for (const t of templates) {
        // Simple filtering: We only want templates that have a BODY component
        const bodyComponent = t.components.find((c: any) => c.type === 'BODY');
        if (!bodyComponent) continue;

        const bodyText = bodyComponent.text;
        
        // Map status
        // Meta statuses: APPROVED, REJECTED, PENDING, PAUSED, DISABLED
        const status = t.status.toLowerCase();

        await supabaseAdmin
            .from('meta_templates')
            .upsert({
                organization_id: organization_id,
                name: t.name,
                category: t.category.toLowerCase(),
                language: t.language,
                body: bodyText,
                status: status
            }, { onConflict: 'organization_id, name, language' }); // Assuming composite unique constraint or similar logic
        
        count++;
    }

    return new Response(
      JSON.stringify({ message: "Sync successful", count }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    )
  }
})
