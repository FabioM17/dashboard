import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: gmail-send
 * 
 * Sends emails via Gmail API using stored OAuth tokens.
 * Uses Google's REST API directly (no external dependency needed).
 * 
 * Supports token refresh via Google's OAuth2 token endpoint.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { organization_id, to, subject, body, is_html } = await req.json();

    if (!organization_id || !to || !subject || !body) {
      return jsonResponse({ error: 'Campos requeridos: organization_id, to, subject, body' }, 400);
    }

    console.log(`[gmail-send] Sending email to ${to}, subject: "${subject}", org: ${organization_id}`);

    // 1. Get Gmail credentials
    const { data: settings, error: settingsError } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organization_id)
      .eq('service_name', 'gmail')
      .single();

    if (settingsError || !settings?.credentials) {
      console.error('[gmail-send] No Gmail config found:', settingsError);
      return jsonResponse({ error: 'Gmail no está configurado. Conecta tu cuenta de Google en Configuración.' }, 400);
    }

    let { access_token, refresh_token, gmail_address } = settings.credentials;

    if (!access_token) {
      return jsonResponse({ error: 'No hay token de acceso de Gmail' }, 400);
    }

    // 2. Try sending with current access_token
    let result = await sendGmailMessage(access_token, gmail_address, to, subject, body, is_html);

    // 3. If 401, try refreshing the token
    if (result.status === 401 && refresh_token) {
      console.log('[gmail-send] Token expired, refreshing...');
      
      const newToken = await refreshAccessToken(refresh_token);
      
      if (newToken) {
        // Save the new token
        await supabase
          .from('integration_settings')
          .update({
            credentials: {
              ...settings.credentials,
              access_token: newToken,
            },
            updated_at: new Date().toISOString()
          })
          .eq('organization_id', organization_id)
          .eq('service_name', 'gmail');

        console.log('[gmail-send] Token refreshed successfully');
        
        // Retry sending
        result = await sendGmailMessage(newToken, gmail_address, to, subject, body, is_html);
      } else {
        return jsonResponse({ 
          error: 'Token de Gmail expirado y no se pudo renovar. Reconecta tu cuenta de Google en Configuración.' 
        }, 401);
      }
    }

    if (result.success) {
      console.log(`[gmail-send] ✅ Email sent! messageId: ${result.messageId}`);
      return jsonResponse({ message_id: result.messageId, from: gmail_address });
    } else {
      console.error(`[gmail-send] ❌ Failed:`, result.error);
      return jsonResponse({ error: result.error }, result.status || 500);
    }

  } catch (err: any) {
    console.error('[gmail-send] Unhandled error:', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});

/**
 * Send an email via Gmail REST API (no googleapis library needed)
 */
async function sendGmailMessage(
  accessToken: string,
  from: string,
  to: string,
  subject: string,
  body: string,
  isHtml: boolean = false
): Promise<{ success: boolean; messageId?: string; error?: string; status?: number }> {
  try {
    // Build RFC 2822 email message
    const contentType = isHtml ? 'text/html' : 'text/plain';
    const rawMessage = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: ${contentType}; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      '',
      btoa(unescape(encodeURIComponent(body)))
    ].join('\r\n');

    // Base64url encode the entire message
    const encodedMessage = btoa(rawMessage)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[gmail-send] Gmail API error ${response.status}:`, errorBody);
      return { success: false, error: `Gmail API: ${response.status} - ${errorBody}`, status: response.status };
    }

    const data = await response.json();
    return { success: true, messageId: data.id };

  } catch (err: any) {
    return { success: false, error: String(err), status: 500 };
  }
}

/**
 * Refresh the Google access token using the refresh_token
 */
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('[gmail-send] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set');
      return null;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[gmail-send] Token refresh failed:', errorBody);
      return null;
    }

    const data = await response.json();
    return data.access_token || null;

  } catch (err: any) {
    console.error('[gmail-send] refreshAccessToken error:', err);
    return null;
  }
}

function jsonResponse(data: any, status = 200) {
  return new Response(
    JSON.stringify({ success: status >= 200 && status < 300, ...data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status }
  );
}
