import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendGmailEmail } from "../_shared/emailMessaging.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { to, subject, text, html, organization_id } = body;

    if (!to || !subject || (!text && !html)) {
      throw new Error('Missing required fields: to, subject and text/html');
    }

    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- AUTH & ORG GUARD ---
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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Validate token and org ownership
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

    if (profile.organization_id !== organization_id) {
      return new Response(JSON.stringify({ error: 'Forbidden: organization mismatch' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verificar que Gmail esté configurado para esta organización
    const { data: gmailCfg, error: gmailError } = await supabaseAdmin
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organization_id)
      .eq('service_name', 'gmail')
      .single();

    if (gmailError || !gmailCfg?.credentials?.access_token) {
      return new Response(
        JSON.stringify({ 
          error: 'Gmail no está configurado. Conecta tu cuenta de Google en Configuración > Channels > Gmail.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enviar con Gmail API via shared helper
    const recipients = Array.isArray(to) ? to : [to];
    const emailBody = html || text;
    const isHtml = !!html;

    // Enviar a cada destinatario
    const results: any[] = [];
    for (const recipient of recipients) {
      const result = await sendGmailEmail(supabaseAdmin, {
        organizationId: organization_id,
        to: recipient,
        subject,
        body: emailBody,
        isHtml,
      });
      results.push({ to: recipient, ...result });
    }

    const allSuccess = results.every(r => r.success);
    const firstMessageId = results.find(r => r.messageId)?.messageId;

    if (allSuccess) {
      return new Response(
        JSON.stringify({ success: true, messageId: firstMessageId, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const errors = results.filter(r => !r.success).map(r => r.error).join('; ');
      return new Response(
        JSON.stringify({ success: false, error: errors, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Email send error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
      }
    );
  }
});