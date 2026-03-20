// whatsapp-flow-endpoint/index.ts
//
// META WHATSAPP FLOW ENDPOINT
// ===========================
// This function is called by Meta DURING flow execution (not after submission).
// Register this URL in Meta Business Manager under:
//   WhatsApp Manager → Flows → Your Flow → Edit → Endpoint URL
//
// Meta sends encrypted POST requests here for each screen interaction:
//   - action: "INIT"          → User opened the flow. Return initial screen data.
//   - action: "data_exchange" → User moved between screens. Return next screen data.
//   - action: "BACK"          → User pressed back. Return previous screen data.
//
// All communication is encrypted using RSA-OAEP (key exchange) + AES-GCM (payload).
// Set the WHATSAPP_FLOW_PRIVATE_KEY env var with your RSA-2048 private key (PEM format).
//
// REQUIRED: This endpoint is only needed for DYNAMIC flows.
// STATIC flows complete entirely on-device; their responses arrive via the nfm_reply webhook.
//
// Meta flow request format (after decryption):
// {
//   "version": "3.0",
//   "action": "INIT" | "data_exchange" | "BACK",
//   "screen": "SCREEN_ID",         // current screen (for data_exchange / BACK)
//   "data": { ... },               // fields submitted on current screen
//   "flow_token": "...",            // unique token generated at send time
// }
//
// Meta flow response format (before encryption):
// {
//   "version": "3.0",
//   "screen": "NEXT_SCREEN_ID" | "SUCCESS",
//   "data": { ... }                // data to pre-fill on next screen
// }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// CRYPTO: RSA-OAEP + AES-GCM (same as webhook decrypt)
// ============================================================

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN.*?-----/, "")
    .replace(/-----END.*?-----/, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Decrypt an incoming encrypted Meta Flow request.
 *  Returns the parsed JSON payload, or null if decryption fails. */
async function decryptFlowRequest(
  encryptedAesKey: string,
  initialVector: string,
  encryptedData: string,
  privateKeyPem: string
): Promise<Record<string, any> | null> {
  try {
    // 1. Import RSA private key
    const rsaKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(privateKeyPem),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );

    // 2. Decrypt AES key with RSA-OAEP
    const decryptedAesKey = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      rsaKey,
      base64ToUint8Array(encryptedAesKey)
    );

    // 3. Import the decrypted AES key
    const aesKey = await crypto.subtle.importKey(
      "raw",
      decryptedAesKey,
      { name: "AES-GCM" },
      false,
      ["decrypt", "encrypt"]
    );

    // 4. Decrypt the payload
    const ivBytes = base64ToUint8Array(initialVector);
    const encryptedBytes = base64ToUint8Array(encryptedData);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      aesKey,
      encryptedBytes
    );

    const jsonText = new TextDecoder().decode(decrypted);
    return { payload: JSON.parse(jsonText), aesKey, iv: ivBytes };
  } catch (e) {
    console.error("[flow-endpoint] decryptFlowRequest failed:", (e as Error).message);
    return null;
  }
}

/** Encrypt a response payload using the same AES key (flipped IV per Meta spec).
 *  Meta expects the response encrypted so only they can read it on-device. */
async function encryptFlowResponse(
  responseData: Record<string, any>,
  aesKey: CryptoKey,
  iv: Uint8Array
): Promise<string> {
  // Meta mandates flipping all IV bytes for the response
  const flippedIv = iv.map((b) => b ^ 0xff);
  const plaintext = new TextEncoder().encode(JSON.stringify(responseData));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: flippedIv },
    aesKey,
    plaintext
  );
  return uint8ArrayToBase64(new Uint8Array(encrypted));
}

// ============================================================
// SCREEN HANDLERS
// Override or extend these functions to customize your flow's
// server-side behavior per screen.
// ============================================================

/** Called when user opens the flow (action: INIT).
 *  Return the data object to pre-fill on the first screen. */
async function handleInit(
  flowToken: string,
  supabase: any
): Promise<Record<string, any>> {
  // Look up the contact associated with this flow send to pre-fill known fields
  const { data: sendRecord } = await supabase
    .from("whatsapp_flow_sends")
    .select("contact_id, flow_id")
    .eq("flow_token", flowToken)
    .single();

  if (!sendRecord?.contact_id) {
    return {}; // No pre-fill data available
  }

  const { data: contact } = await supabase
    .from("crm_contacts")
    .select("name, email, company, phone")
    .eq("id", sendRecord.contact_id)
    .single();

  if (!contact) return {};

  // Return known fields so the flow can pre-populate them
  return {
    pre_fill_name: contact.name || "",
    pre_fill_email: contact.email || "",
    pre_fill_company: contact.company || "",
  };
}

/** Called when the user navigates between screens (action: data_exchange).
 *  `screen` is the current screen ID, `data` contains submitted fields.
 *  Return { screen: "NEXT_SCREEN_ID", data: { ... } } to advance,
 *  or { screen: "SUCCESS", data: {} } to complete the flow. */
function handleDataExchange(
  screen: string,
  data: Record<string, any>,
  flowToken: string
): { screen: string; data: Record<string, any> } {
  // Default: immediately complete after any data exchange.
  // Override this switch for multi-screen flows that need server-side logic.
  switch (screen) {
    // Example: validate email on screen CONTACT_INFO
    // case "CONTACT_INFO": {
    //   if (!data.email?.includes("@")) {
    //     return { screen: "CONTACT_INFO", data: { error_email: "Email inválido" } };
    //   }
    //   return { screen: "CONFIRMATION", data: { ...data } };
    // }
    default:
      return { screen: "SUCCESS", data: {} };
  }
}

// ============================================================
// MAIN HANDLER
// ============================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Meta Health Check: GET request to verify the endpoint is reachable
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "ok", message: "WhatsApp Flow Endpoint is running" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();

    // Meta sends either an encrypted payload or a plain health-check ping
    // Health check: { "version": "3.0", "action": "ping" }
    if (body?.action === "ping") {
      return new Response(
        JSON.stringify({ data: { status: "active" } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Encrypted request ----
    const { encrypted_aes_key, initial_vector, encrypted_flow_data } = body;

    if (!encrypted_aes_key || !initial_vector || !encrypted_flow_data) {
      return new Response(
        JSON.stringify({ error: "Missing encrypted fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const privateKeyPem = Deno.env.get("WHATSAPP_FLOW_PRIVATE_KEY");
    if (!privateKeyPem) {
      console.error("[flow-endpoint] WHATSAPP_FLOW_PRIVATE_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Flow endpoint not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decrypt the request
    const decryptResult = await decryptFlowRequest(
      encrypted_aes_key,
      initial_vector,
      encrypted_flow_data,
      privateKeyPem
    );

    if (!decryptResult) {
      return new Response(
        JSON.stringify({ error: "Failed to decrypt request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { payload, aesKey, iv } = decryptResult as {
      payload: Record<string, any>;
      aesKey: CryptoKey;
      iv: Uint8Array;
    };

    const { action, screen, data = {}, flow_token, version = "3.0" } = payload;

    console.log("[flow-endpoint] action:", action, "screen:", screen, "flow_token:", flow_token);

    // ---- Dispatch per action ----
    let responsePayload: Record<string, any>;

    if (action === "INIT") {
      const initData = await handleInit(flow_token, supabase);
      responsePayload = {
        version,
        data: initData,
      };
    } else if (action === "data_exchange") {
      const { screen: nextScreen, data: nextData } = handleDataExchange(screen, data, flow_token);
      responsePayload = {
        version,
        screen: nextScreen,
        data: nextData,
      };
    } else if (action === "BACK") {
      // BACK is informational — just acknowledge without driving navigation
      responsePayload = { version, data: {} };
    } else {
      console.warn("[flow-endpoint] Unknown action:", action);
      responsePayload = { version, data: {} };
    }

    // Encrypt the response
    const encryptedResponse = await encryptFlowResponse(responsePayload, aesKey, iv);

    return new Response(encryptedResponse, {
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("[flow-endpoint] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
