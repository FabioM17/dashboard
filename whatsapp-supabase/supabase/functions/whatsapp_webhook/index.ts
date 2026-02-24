// supabase/functions/whatsapp_webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

// ============================================
// STRUCTURED LOGGING HELPER
// ============================================
function log(level: "info" | "warn" | "error", orgId: string | null, event: string, details: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, orgId, event, timestamp: new Date().toISOString(), ...details }));
}

// ============================================
// WEBHOOK LOG HELPER
// ============================================
async function insertWebhookLog(
  supabaseAdmin: any,
  orgId: string | null,
  payload: unknown,
  processed: boolean,
  eventType?: string
) {
  try {
    await supabaseAdmin
      .from("webhook_logs")
      .insert({
        payload: { body: payload, organization_id: orgId, event_type: eventType },
        source: "whatsapp_webhook",
        processed,
      });
  } catch (e) {
    log("error", orgId, "webhook_log_insert_failed", { error: (e as Error).message });
  }
}

// ============================================
// AUTO-UPDATE CREDENTIALS HELPER
// Merges new waba_id / phone_number_id into existing credentials
// without overwriting access_token, verify_token, etc.
// ============================================
async function autoUpdateCredentials(
  supabaseAdmin: any,
  orgId: string,
  currentCredentials: Record<string, unknown>,
  newValues: Record<string, string>
) {
  const merged = { ...currentCredentials, ...newValues, updated_at: new Date().toISOString() };
  const { error } = await supabaseAdmin
    .from("integration_settings")
    .update({ credentials: merged, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("service_name", "whatsapp");

  if (error) {
    log("error", orgId, "auto_update_credentials_failed", { error: error.message });
  } else {
    log("info", orgId, "credentials_auto_updated", { updatedFields: Object.keys(newValues) });
  }
}

// ============================================
// VALIDATE & SYNC META IDS
// Returns null if OK, or a Response if should abort
// ============================================
async function validateMetaIds(
  supabaseAdmin: any,
  orgId: string,
  credentials: Record<string, unknown>,
  payloadWabaId: string | null,
  payloadPhoneNumberId: string | null
): Promise<Response | null> {
  const storedWabaId = (credentials.waba_id as string) || "";
  const storedPhoneNumberId = (credentials.phone_number_id || credentials.phone_id) as string || "";

  // --- AUTO-FILL: credentials are empty but payload has values ---
  const fieldsToUpdate: Record<string, string> = {};

  if (!storedWabaId && payloadWabaId) {
    fieldsToUpdate.waba_id = payloadWabaId;
    log("info", orgId, "waba_id_auto_fill", { payloadWabaId });
  }
  if (!storedPhoneNumberId && payloadPhoneNumberId) {
    fieldsToUpdate.phone_number_id = payloadPhoneNumberId;
    fieldsToUpdate.phone_id = payloadPhoneNumberId; // keep both for compatibility
    log("info", orgId, "phone_number_id_auto_fill", { payloadPhoneNumberId });
  }

  if (Object.keys(fieldsToUpdate).length > 0) {
    await autoUpdateCredentials(supabaseAdmin, orgId, credentials, fieldsToUpdate);
    // After auto-fill, allow the request through
    return null;
  }

  // --- MISMATCH CHECK: both exist, must match ---
  if (storedWabaId && payloadWabaId && storedWabaId !== payloadWabaId) {
    log("error", orgId, "waba_id_mismatch", {
      stored: storedWabaId,
      received: payloadWabaId,
    });
    return new Response(
      JSON.stringify({
        error: "Forbidden: WABA ID mismatch",
        detail: `Expected waba_id=${storedWabaId} but received ${payloadWabaId}`,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (storedPhoneNumberId && payloadPhoneNumberId && storedPhoneNumberId !== payloadPhoneNumberId) {
    log("error", orgId, "phone_number_id_mismatch", {
      stored: storedPhoneNumberId,
      received: payloadPhoneNumberId,
    });
    return new Response(
      JSON.stringify({
        error: "Forbidden: Phone Number ID mismatch",
        detail: `Expected phone_number_id=${storedPhoneNumberId} but received ${payloadPhoneNumberId}`,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return null; // All good
}

// ============================================
// TIPOS PARA ESTADOS DE MENSAJES
// ============================================
interface MessageStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
    type: string;
  };
}

interface StatusValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  statuses: MessageStatus[];
  field: string;
}

// ============================================
// FUNCIÓN PARA MANEJAR ESTADOS
// ============================================
async function handleMessageStatus(
  value: StatusValue,
  orgId: string | null,
  supabaseAdmin: any
) {
  try {
    const organizationId = orgId;
    if (!organizationId) {
      log("error", orgId, "status_missing_org_id", {});
      return;
    }

    const { metadata, statuses } = value;
    const phoneNumberId = metadata.phone_number_id;
    const displayPhoneNumber = metadata.display_phone_number;

    for (const status of statuses) {
      const { id: messageId, status: messageStatus, timestamp, recipient_id, pricing } = status;

      log("info", orgId, "status_received", { messageId, messageStatus, recipient_id });

      // Buscar el mensaje enviado en la base de datos
      const { data: message, error: fetchErr } = await supabaseAdmin
        .from("messages")
        .select("id, conversation_id, metadata")
        .eq("organization_id", organizationId)
        .or(`metadata->>'wamid'.eq.${messageId},metadata->>'whatsapp_id'.eq.${messageId}`)
        .single();

      if (fetchErr || !message) {
        log("warn", orgId, "status_message_not_found", { messageId });
      }

      const conversationId = message?.conversation_id || null;

      // Guardar/Actualizar estado del mensaje
      const statusRecord = {
        organization_id: organizationId,
        message_id: message?.id || null,
        conversation_id: conversationId,
        whatsapp_message_id: messageId,
        phone_number_id: phoneNumberId,
        display_phone_number: displayPhoneNumber,
        recipient_phone: recipient_id,
        status: messageStatus,
        timestamp_unix: parseInt(timestamp),
        timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
        pricing: pricing || null,
        metadata: {
          billable: pricing?.billable || false,
          pricing_model: pricing?.pricing_model || null,
          category: pricing?.category || null,
          type: pricing?.type || null,
          messaging_product: value.messaging_product
        }
      };

      // Insertar o actualizar registro de estado
      const { error: statusErr } = await supabaseAdmin
        .from("message_statuses")
        .upsert(
          {
            ...statusRecord,
            updated_at: new Date().toISOString()
          },
          { onConflict: "whatsapp_message_id,organization_id" }
        );

      if (statusErr) {
        log("error", orgId, "status_save_failed", { messageId, error: statusErr.message });
      } else {
        log("info", orgId, "status_saved", { messageId, messageStatus });
      }

      // Si el mensaje fue encontrado, actualizar su estado en la tabla messages
      if (message?.id) {
        const statusMap: Record<string, string> = {
          sent: "sent",
          delivered: "delivered",
          read: "read",
          failed: "failed"
        };

        const { error: updateErr } = await supabaseAdmin
          .from("messages")
          .update({
            status: statusMap[messageStatus] || messageStatus,
            updated_at: new Date().toISOString()
          })
          .eq("id", message.id);

        if (updateErr) {
          log("error", orgId, "message_status_update_failed", { messageId: message.id, error: updateErr.message });
        }
      }
    }
  } catch (error) {
    log("error", orgId, "handleMessageStatus_exception", { error: (error as Error).message });
  }
}

// ============================================
// HANDLE account_update FIELD
// ============================================
async function handleAccountUpdate(
  entry: any,
  value: any,
  orgId: string,
  credentials: Record<string, unknown>,
  supabaseAdmin: any
) {
  log("info", orgId, "account_update", {
    entryId: entry.id,
    value,
  });

  const fieldsToUpdate: Record<string, string> = {};

  // If account_update includes waba_info with waba_id
  if (value?.waba_info?.waba_id) {
    const incomingWabaId = String(value.waba_info.waba_id);
    if (!credentials.waba_id || credentials.waba_id !== incomingWabaId) {
      fieldsToUpdate.waba_id = incomingWabaId;
    }
  }

  // If account_update includes phone_number
  if (value?.phone_number) {
    const incomingPhone = String(value.phone_number);
    fieldsToUpdate.display_phone_number = incomingPhone;
    log("info", orgId, "account_update_phone", { phone_number: incomingPhone });
  }

  // If account_update includes phone_number_id (some payloads)
  if (value?.phone_number_id) {
    const incomingPhoneId = String(value.phone_number_id);
    if (!credentials.phone_number_id || credentials.phone_number_id !== incomingPhoneId) {
      fieldsToUpdate.phone_number_id = incomingPhoneId;
      fieldsToUpdate.phone_id = incomingPhoneId;
    }
  }

  // business_id from entry or value
  const incomingBusinessId = value?.business_id || entry?.id;
  if (incomingBusinessId && (!credentials.business_id || credentials.business_id !== String(incomingBusinessId))) {
    fieldsToUpdate.business_id = String(incomingBusinessId);
  }

  // quality_rating (e.g. GREEN, YELLOW, RED)
  if (value?.quality_rating) {
    fieldsToUpdate.quality_rating = String(value.quality_rating);
    log("info", orgId, "account_update_quality", { quality_rating: value.quality_rating });
  }

  // verification_status
  if (value?.verification_status) {
    fieldsToUpdate.verification_status = String(value.verification_status);
    log("info", orgId, "account_update_verification", { verification_status: value.verification_status });
  }

  // display_phone_number from metadata (some payloads nest it here)
  if (value?.metadata?.display_phone_number && !fieldsToUpdate.display_phone_number) {
    fieldsToUpdate.display_phone_number = String(value.metadata.display_phone_number);
  }

  // phone_number_id from metadata (some account_update payloads include it here)
  if (value?.metadata?.phone_number_id && !fieldsToUpdate.phone_number_id) {
    const metaPhoneId = String(value.metadata.phone_number_id);
    if (!credentials.phone_number_id || credentials.phone_number_id !== metaPhoneId) {
      fieldsToUpdate.phone_number_id = metaPhoneId;
      fieldsToUpdate.phone_id = metaPhoneId;
      log("info", orgId, "account_update_metadata_phone_number_id", { phone_number_id: metaPhoneId });
    }
  }

  if (Object.keys(fieldsToUpdate).length > 0) {
    await autoUpdateCredentials(supabaseAdmin, orgId, credentials, fieldsToUpdate);
  }
}

// ============================================
// RESOLVE ORGANIZATION BY META IDS
// Searches integration_settings for the org that
// owns the given waba_id and/or phone_number_id.
// Returns { orgId, credentials } or an error Response.
// ============================================
interface ResolveResult {
  orgId: string;
  credentials: Record<string, unknown>;
}

async function resolveOrgByMetaIds(
  supabaseAdmin: any,
  payloadWabaId: string | null,
  payloadPhoneNumberId: string | null
): Promise<ResolveResult | Response> {

  if (!payloadWabaId && !payloadPhoneNumberId) {
    log("error", null, "resolve_org_no_meta_ids", { payloadWabaId, payloadPhoneNumberId });
    return new Response(
      JSON.stringify({ error: "Cannot resolve organization: no waba_id or phone_number_id in payload" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // Fetch ALL whatsapp integration rows (typically few — one per org)
  const { data: allConfigs, error: fetchErr } = await supabaseAdmin
    .from("integration_settings")
    .select("organization_id, credentials")
    .eq("service_name", "whatsapp");

  if (fetchErr) {
    log("error", null, "resolve_org_db_error", { error: fetchErr.message });
    return new Response(
      JSON.stringify({ error: "Database error while resolving organization" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!allConfigs || allConfigs.length === 0) {
    log("error", null, "resolve_org_no_integrations", {});
    return new Response(
      JSON.stringify({ error: "No WhatsApp integrations configured in any organization" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // Score each config: match by waba_id and/or phone_number_id
  const matches: Array<{ orgId: string; credentials: Record<string, unknown>; score: number; matchedFields: string[] }> = [];

  for (const config of allConfigs) {
    const creds = config.credentials || {};
    let score = 0;
    const matchedFields: string[] = [];

    // Match waba_id
    if (payloadWabaId && creds.waba_id && String(creds.waba_id) === payloadWabaId) {
      score += 2; // waba_id is the strongest identifier
      matchedFields.push("waba_id");
    }

    // Match phone_number_id (check both field names for compatibility)
    const storedPhoneId = creds.phone_number_id || creds.phone_id;
    if (payloadPhoneNumberId && storedPhoneId && String(storedPhoneId) === payloadPhoneNumberId) {
      score += 1;
      matchedFields.push("phone_number_id");
    }

    if (score > 0) {
      matches.push({ orgId: config.organization_id, credentials: creds, score, matchedFields });
    }
  }

  if (matches.length === 0) {
    log("error", null, "resolve_org_no_match", { payloadWabaId, payloadPhoneNumberId });
    return new Response(
      JSON.stringify({
        error: "No organization matches the WhatsApp IDs in this webhook",
        detail: { waba_id: payloadWabaId, phone_number_id: payloadPhoneNumberId },
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (matches.length > 1) {
    // Sort by score descending — if top two have the same score, it's ambiguous
    matches.sort((a, b) => b.score - a.score);

    const matchDetails = matches.map((m) => ({
      orgId: m.orgId,
      score: m.score,
      matchedFields: m.matchedFields,
      storedWabaId: m.credentials.waba_id || null,
      storedPhoneNumberId: m.credentials.phone_number_id || m.credentials.phone_id || null,
    }));

    if (matches[0].score === matches[1].score) {
      // Perfect tie — ambiguous, list all tied orgs with detail
      const tiedOrgs = matches.filter((m) => m.score === matches[0].score);
      log("error", null, "resolve_org_ambiguous", {
        payloadWabaId,
        payloadPhoneNumberId,
        tiedCount: tiedOrgs.length,
        tiedOrgs: tiedOrgs.map((m) => ({ orgId: m.orgId, matchedFields: m.matchedFields })),
        allMatchDetails: matchDetails,
      });
      return new Response(
        JSON.stringify({
          error: "Multiple organizations match the WhatsApp IDs - ambiguous",
          detail: {
            waba_id: payloadWabaId,
            phone_number_id: payloadPhoneNumberId,
            ambiguousOrganizations: tiedOrgs.map((m) => ({ orgId: m.orgId, matchedFields: m.matchedFields })),
          },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    // If top match has a strictly higher score, use it (e.g. waba_id+phone_id vs only phone_id)
    log("warn", matches[0].orgId, "resolve_org_multiple_matches_best_picked", {
      payloadWabaId,
      payloadPhoneNumberId,
      bestScore: matches[0].score,
      bestMatchedFields: matches[0].matchedFields,
      allMatchDetails: matchDetails,
    });
  }

  const best = matches[0];
  log("info", best.orgId, "resolve_org_success", {
    payloadWabaId,
    payloadPhoneNumberId,
    score: best.score,
  });

  return { orgId: best.orgId, credentials: best.credentials };
}

serve(async (req) => {
  const { method } = req;
  const url = new URL(req.url);

  // Optional orgId from URL — used ONLY as override for testing / backwards compatibility
  const urlOrgId = url.searchParams.get("orgId");

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ================================================
  // 1. VERIFICACIÓN DE META (GET) — GLOBAL WEBHOOK
  // ================================================
  if (method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    log("info", urlOrgId, "webhook_verification_attempt", { mode, hasUrlOrgId: !!urlOrgId });

    let expectedToken: string | null = null;

    if (urlOrgId) {
      // Override mode: use per-org verify_token (for testing or specific org verification)
      const { data: config } = await supabaseAdmin
        .from("integration_settings")
        .select("credentials")
        .eq("organization_id", urlOrgId)
        .eq("service_name", "whatsapp")
        .single();

      expectedToken = config?.credentials?.verify_token || null;
      log("info", urlOrgId, "webhook_verify_using_org_token", { hasToken: !!expectedToken });
    }

    if (!expectedToken) {
      // Global mode: use GLOBAL_VERIFY_TOKEN env var
      expectedToken = Deno.env.get("GLOBAL_VERIFY_TOKEN") || null;
      log("info", urlOrgId, "webhook_verify_using_global_token", { hasToken: !!expectedToken });
    }

    if (!expectedToken) {
      log("error", urlOrgId, "webhook_verify_no_token_available", {});
      return new Response(
        JSON.stringify({ error: "No verify token configured (neither per-org nor GLOBAL_VERIFY_TOKEN)" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (mode === "subscribe" && token === expectedToken) {
      log("info", urlOrgId, "webhook_verification_success", {});
      return new Response(challenge, { status: 200 });
    }

    log("error", urlOrgId, "webhook_verification_failed", { mode, tokenMatch: token === expectedToken });
    return new Response("Forbidden: Invalid Token", { status: 403 });
  }

  // ================================================
  // 2. RECEPCIÓN DE MENSAJES Y ESTADOS (POST) — GLOBAL
  // ================================================
  if (method === "POST") {
    let body: any;
    let resolvedOrgId: string | null = null;

    try {
      body = await req.json();

      // ---- EARLY CHECK: Only process whatsapp_business_account objects ----
      if (body.object !== "whatsapp_business_account") {
        log("info", null, "ignored_non_whatsapp_object", { object: body.object });
        await insertWebhookLog(supabaseAdmin, null, body, false, body.object);
        return new Response("OK", { status: 200 });
      }

      // ---- EXTRACT Meta IDs from payload (BEFORE resolving org) ----
      const firstEntry = (body.entry || [])[0];
      const payloadWabaId: string | null = firstEntry?.id ? String(firstEntry.id) : null;

      let payloadPhoneNumberId: string | null = null;
      if (firstEntry?.changes?.[0]?.value?.metadata?.phone_number_id) {
        payloadPhoneNumberId = String(firstEntry.changes[0].value.metadata.phone_number_id);
      }

      log("info", null, "webhook_post_received", {
        object: body.object,
        payloadWabaId,
        payloadPhoneNumberId,
        hasUrlOrgId: !!urlOrgId,
      });

      // ---- WEBHOOK LOG: Always log incoming whatsapp payload (before org resolution) ----
      await insertWebhookLog(supabaseAdmin, null, body, true, body.object);

      // ---- RESOLVE ORGANIZATION from Meta IDs ----
      let credentials: Record<string, unknown>;

      if (urlOrgId) {
        // URL override: use the provided orgId (backwards compatibility / testing)
        log("info", urlOrgId, "using_url_orgid_override", {});

        // Verify org exists
        const { data: orgExists, error: orgExistsErr } = await supabaseAdmin
          .from("organizations")
          .select("id")
          .eq("id", urlOrgId)
          .single();

        if (orgExistsErr || !orgExists) {
          log("error", urlOrgId, "organization_not_found", { error: orgExistsErr?.message });
          return new Response(
            JSON.stringify({ error: "Organization not found", orgId: urlOrgId }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }

        // Load credentials
        const { data: orgConfig, error: orgConfigErr } = await supabaseAdmin
          .from("integration_settings")
          .select("credentials")
          .eq("organization_id", urlOrgId)
          .eq("service_name", "whatsapp")
          .single();

        if (orgConfigErr || !orgConfig) {
          log("error", urlOrgId, "credentials_not_found", { error: orgConfigErr?.message });
          return new Response(
            JSON.stringify({ error: "WhatsApp integration not configured for this organization" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }

        resolvedOrgId = urlOrgId;
        credentials = orgConfig.credentials || {};
      } else {
        // ✅ GLOBAL MODE: resolve org by waba_id / phone_number_id
        const resolveResult = await resolveOrgByMetaIds(supabaseAdmin, payloadWabaId, payloadPhoneNumberId);

        if (resolveResult instanceof Response) {
          // Resolution failed — log and return the error response
          await insertWebhookLog(supabaseAdmin, null, body, false, "org_resolution_failed");
          return resolveResult;
        }

        resolvedOrgId = resolveResult.orgId;
        credentials = resolveResult.credentials;

        // Verify the resolved org still exists in organizations table
        const { data: orgExists, error: orgExistsErr } = await supabaseAdmin
          .from("organizations")
          .select("id")
          .eq("id", resolvedOrgId)
          .single();

        if (orgExistsErr || !orgExists) {
          log("error", resolvedOrgId, "resolved_organization_not_found", { error: orgExistsErr?.message });
          return new Response(
            JSON.stringify({ error: "Resolved organization not found in database", orgId: resolvedOrgId }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      // From here on, resolvedOrgId is guaranteed to be a valid string
      const orgId = resolvedOrgId!;

      // Update webhook_log with the resolved org
      await insertWebhookLog(supabaseAdmin, orgId, body, true, "resolved");

      log("info", orgId, "payload_meta_ids", {
        payloadWabaId,
        payloadPhoneNumberId,
        storedWabaId: credentials.waba_id || null,
        storedPhoneNumberId: credentials.phone_number_id || credentials.phone_id || null,
      });

      // ---- VALIDATE / AUTO-SYNC Meta IDs ----
      const validationResponse = await validateMetaIds(
        supabaseAdmin, orgId, credentials, payloadWabaId, payloadPhoneNumberId
      );
      if (validationResponse) {
        await insertWebhookLog(supabaseAdmin, orgId, body, false, "meta_id_mismatch");
        return validationResponse;
      }

      // ---- PROCESS ENTRIES ----
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;
          const field = change.field;

          // ======================================
          // HANDLE account_update FIELD
          // ======================================
          if (field === "account_update") {
            await handleAccountUpdate(entry, value, orgId, credentials, supabaseAdmin);
            continue;
          }

          // Procesar ESTADOS DE MENSAJES
          if (field === "messages" && value.statuses?.[0]) {
            await handleMessageStatus(value, orgId, supabaseAdmin);
            continue;
          }

          // Procesar MENSAJES ENTRANTES
          if (!value.messages?.[0]) continue;

          const message = value.messages[0];
          const contact = value.contacts?.[0];
          const senderPhone = message.from;
          const senderName = contact?.profile?.name || senderPhone;
          const textBody = message.text?.body || "[Multimedia]";

          log("info", orgId, "message_received", {
            from: senderPhone,
            type: message.type,
            wamid: message.id,
          });

          // A. GESTIONAR CONVERSACIÓN
          const organizationId = orgId;

          // Buscar conversación existente FILTRADA POR ORGANIZACIÓN
          const { data: conv } = await supabaseAdmin
            .from("conversations")
            .select("id, unread_count, organization_id")
            .eq("contact_phone", senderPhone)
            .eq("organization_id", organizationId)
            .single();

          let conversationId = conv?.id;

          if (!conversationId) {
            // Crear nueva conversación
            const { data: newConv, error } = await supabaseAdmin
              .from("conversations")
              .insert({
                contact_name: senderName,
                contact_phone: senderPhone,
                platform: "whatsapp",
                unread_count: 1,
                last_message: textBody,
                status: "open",
                organization_id: organizationId,
              })
              .select("id")
              .single();

            if (error) {
              log("error", orgId, "conversation_create_failed", { error: error.message });
              continue;
            }
            conversationId = newConv.id;
            log("info", orgId, "conversation_created", { conversationId, senderPhone });
          } else {
            // Actualizar existente
            await supabaseAdmin
              .from("conversations")
              .update({
                last_message: textBody,
                last_message_time: new Date().toISOString(),
                unread_count: (conv?.unread_count || 0) + 1,
              })
              .eq("id", conversationId);
          }

          // B. Manejo de media: descargar y guardar en Storage por organización
          let savedMediaPath: string | null = null;
          let savedMimeType: string | null = null;
          let savedSize: number | null = null;
          let savedType: string = message.type === "text" ? "text" : "media";
          let mediaSkippedMeta: Record<string, unknown> | null = null;

          if (message.type !== "text") {
            const accessToken = credentials.access_token as string;

            if (!accessToken) {
              log("error", orgId, "media_missing_access_token", { messageType: message.type });
            } else {
              let mediaId: string | undefined;
              let filename: string | undefined;

              if (message.type === "image") {
                mediaId = message.image?.id;
                savedType = "image";
              } else if (message.type === "audio") {
                mediaId = message.audio?.id;
                savedType = "audio";
              } else if (message.type === "document") {
                mediaId = message.document?.id;
                filename = message.document?.filename;
                savedType = "document";
              }

              if (mediaId) {
                try {
                  // 1) Obtener metadata del media
                  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                  });
                  const metaJson = await metaRes.json();
                  const mediaUrl: string | undefined = metaJson?.url;
                  const mimeTypeMeta: string | undefined = metaJson?.mime_type;

                  if (mediaUrl) {
                    // 2) Descargar binario con timeout de 15s
                    const abortController = new AbortController();
                    const downloadTimeout = setTimeout(() => abortController.abort(), 15_000);
                    let binRes: Response;
                    try {
                      binRes = await fetch(mediaUrl, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                        signal: abortController.signal,
                      });
                    } catch (fetchErr) {
                      clearTimeout(downloadTimeout);
                      const isTimeout = (fetchErr as Error).name === "AbortError";
                      log("error", orgId, "media_download_failed", {
                        mediaId,
                        reason: isTimeout ? "timeout_15s" : (fetchErr as Error).message,
                      });
                      throw fetchErr;
                    }
                    clearTimeout(downloadTimeout);

                    const arrayBuffer = await binRes.arrayBuffer();
                    const contentType = binRes.headers.get("content-type") || mimeTypeMeta || "application/octet-stream";
                    const contentLength = Number(binRes.headers.get("content-length") || arrayBuffer.byteLength);

                    // 2b) Protección: no subir archivos > 20MB
                    const MAX_MEDIA_SIZE = 20 * 1024 * 1024; // 20MB
                    if (arrayBuffer.byteLength > MAX_MEDIA_SIZE) {
                      log("error", orgId, "media_too_large", {
                        mediaId,
                        sizeBytes: arrayBuffer.byteLength,
                        maxBytes: MAX_MEDIA_SIZE,
                      });
                      // Record skip reason — will be merged into message metadata
                      mediaSkippedMeta = {
                        media_skipped: true,
                        reason: "too_large",
                        size_bytes: arrayBuffer.byteLength,
                      };
                      // Skip upload only — message will still be saved below without media
                    } else {
                      // 3) Determinar nombre, extensión y carpeta por tipo
                      const extFromType = contentType.split("/").pop() || "bin";
                      const baseName = filename ? filename.replace(/[^a-zA-Z0-9._-]/g, "_") : `${mediaId}.${extFromType}`;
                      const mediaFolder = savedType === "image" ? "image" : savedType === "audio" ? "audio" : "document";
                      const objectPath = `${organizationId}/${mediaFolder}/${conversationId}/${Date.now()}_${baseName}`;

                      // 4) Subir a Storage (whatsapp-media)
                      const { error: upErr } = await supabaseAdmin.storage
                        .from("whatsapp-media")
                        .upload(objectPath, new Uint8Array(arrayBuffer), { contentType });

                      if (upErr) {
                        log("error", orgId, "media_upload_failed", { mediaId, error: upErr.message });
                      } else {
                        savedMediaPath = objectPath;
                        savedMimeType = contentType;
                        savedSize = contentLength || arrayBuffer.byteLength;
                        log("info", orgId, "media_uploaded", { mediaId, objectPath, savedType });
                      }
                    }
                  }
                } catch (e) {
                  log("error", orgId, "media_handling_exception", { mediaId, error: (e as Error).message });
                }
              }
            }
          }

          // C. GUARDAR MENSAJE EN DB con metadatos de media
          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            organization_id: organizationId,
            sender_id: senderPhone,
            text: textBody,
            is_incoming: true,
            type: savedType,
            status: "delivered",
            author_name: senderName,
            media_path: savedMediaPath,
            media_mime_type: savedMimeType,
            media_size: savedSize,
            metadata: { wamid: message.id, ...(mediaSkippedMeta || {}) },
          });

          log("info", orgId, "message_saved", { conversationId, wamid: message.id, type: savedType });

          // D. ENVIAR A N8N (AUTOMATIZACIÓN)
          const { data: n8nConfig } = await supabaseAdmin
            .from("integration_settings")
            .select("credentials")
            .eq("organization_id", organizationId)
            .eq("service_name", "n8n")
            .single();

          if (n8nConfig?.credentials?.is_active && n8nConfig?.credentials?.webhook_url) {
            fetch(n8nConfig.credentials.webhook_url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: textBody,
                sender_phone: senderPhone,
                sender_name: senderName,
                conversation_id: conversationId,
                timestamp: new Date().toISOString(),
              }),
            }).catch((e) => log("error", orgId, "n8n_call_failed", { error: (e as Error).message }));
          }
        }
      }

      return new Response("EVENT_RECEIVED", { status: 200 });
    } catch (error) {
      log("error", resolvedOrgId, "post_handler_exception", { error: (error as Error).message, stack: (error as Error).stack });
      if (body) {
        await insertWebhookLog(supabaseAdmin, resolvedOrgId, body, false, "processing_error");
      }
      return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});