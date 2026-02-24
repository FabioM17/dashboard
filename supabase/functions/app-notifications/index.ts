import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";  // or use esm.sh version if you prefer

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

    // Intentar cargar credenciales SMTP desde integration_settings (preferido)
    let smtpUser: string | undefined;
    let smtpPass: string | undefined;
    let smtpHost = 'smtp.gmail.com';
    let smtpPort = 465;
    let fromEmail: string | undefined;

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

    const { data: cfg } = await supabaseAdmin
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organization_id)
      .eq('service_name', 'email')
      .single();

    if (cfg?.credentials) {
      smtpUser = cfg.credentials.user;
      smtpPass = cfg.credentials.password;
      smtpHost = cfg.credentials.host || smtpHost;
      smtpPort = cfg.credentials.port || smtpPort;
      fromEmail = cfg.credentials.from || smtpUser;
    }

    // Fallback a variables de entorno
    smtpUser = smtpUser || Deno.env.get('EMAIL_SMTP_USER');
    smtpPass = smtpPass || Deno.env.get('EMAIL_SMTP_PASS');
    fromEmail = fromEmail || Deno.env.get('EMAIL_FROM') || smtpUser;

    if (!smtpUser || !smtpPass) {
      throw new Error('SMTP credentials not configured. Provide organization_id with integration_settings or set EMAIL_SMTP_USER and EMAIL_SMTP_PASS env vars.');
    }

    // Configurar Nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,  // true para puerto 465 (SSL), false para 587 (STARTTLS)
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      // Opcional: si tienes problemas con certificados self-signed (solo testing)
      // tls: { rejectUnauthorized: false },
    });

    // Verificar conexión (opcional, pero útil para debug)
    // await transporter.verify();  // descomenta si quieres probar la conexión primero

    // Enviar el email
    const sendResult = await transporter.sendMail({
      from: fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      text: text || undefined,
      html: html || undefined,
    });

    return new Response(
      JSON.stringify({ success: true, messageId: sendResult.messageId, result: sendResult }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

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