// Shared utility for sending emails via Gmail API (reuses gmail-send logic)
// Used by process-workflows and process-scheduled-campaigns

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EmailContact {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  custom_properties?: Record<string, any>;
}

/**
 * Replace {{merge_tags}} in text with contact data.
 * Supports: name, email, phone, company + any key in custom_properties.
 */
export function replaceMergeTags(text: string, contact: EmailContact): string {
  if (!text) return text;
  let result = text;
  const matches = text.match(/\{\{(\w+)\}\}/g) || [];
  for (const match of matches) {
    const key = match.replace(/[\{\}]/g, "");
    let value = "";
    if (key === "name") value = contact.name || "";
    else if (key === "email") value = contact.email || "";
    else if (key === "phone") value = contact.phone || "";
    else if (key === "company") value = contact.company || "";
    else if (contact.custom_properties?.[key]) value = String(contact.custom_properties[key]);
    result = result.replace(match, value);
  }
  return result;
}

/**
 * Send an email using Gmail API.
 * Reads tokens from integration_settings, auto-refreshes if expired.
 */
export async function sendGmailEmail(
  supabase: any,
  params: {
    organizationId: string;
    to: string;
    subject: string;
    body: string;
    isHtml?: boolean;
  }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // 1. Get Gmail credentials
    const { data: settings, error: settingsError } = await supabase
      .from("integration_settings")
      .select("credentials")
      .eq("organization_id", params.organizationId)
      .eq("service_name", "gmail")
      .single();

    if (settingsError || !settings?.credentials) {
      return { success: false, error: "Gmail no configurado para esta organización" };
    }

    let { access_token, refresh_token, gmail_address } = settings.credentials;
    if (!access_token) {
      return { success: false, error: "No hay token de acceso de Gmail" };
    }

    // 2. Try sending
    let result = await _sendGmailMessage(access_token, gmail_address, params.to, params.subject, params.body, params.isHtml ?? true);

    // 3. If 401, refresh
    if (result.status === 401 && refresh_token) {
      const newToken = await _refreshAccessToken(refresh_token);
      if (newToken) {
        await supabase
          .from("integration_settings")
          .update({
            credentials: { ...settings.credentials, access_token: newToken },
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", params.organizationId)
          .eq("service_name", "gmail");

        result = await _sendGmailMessage(newToken, gmail_address, params.to, params.subject, params.body, params.isHtml ?? true);
      } else {
        return { success: false, error: "Token de Gmail expirado y no se pudo renovar" };
      }
    }

    if (result.success) {
      return { success: true, messageId: result.messageId };
    }
    return { success: false, error: result.error };
  } catch (err: any) {
    console.error("[emailMessaging] sendGmailEmail error:", err);
    return { success: false, error: String(err) };
  }
}

// ── Internal helpers ─────────────────────────────────────────────────

async function _sendGmailMessage(
  accessToken: string,
  from: string,
  to: string,
  subject: string,
  body: string,
  isHtml: boolean
): Promise<{ success: boolean; messageId?: string; error?: string; status?: number }> {
  try {
    const contentType = isHtml ? "text/html" : "text/plain";
    const rawMessage = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: ${contentType}; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      "",
      btoa(unescape(encodeURIComponent(body))),
    ].join("\r\n");

    const encodedMessage = btoa(rawMessage)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, error: `Gmail API: ${response.status} - ${errorBody}`, status: response.status };
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  } catch (err: any) {
    return { success: false, error: String(err), status: 500 };
  }
}

async function _refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) return null;

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}
