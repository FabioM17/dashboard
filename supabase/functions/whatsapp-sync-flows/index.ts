// whatsapp-sync-flows/index.ts
// Fetches all WhatsApp Flows from Meta API and upserts them into whatsapp_flows table.
// Uses the same credential resolution as whatsapp-sync-templates.
//
// Meta API: GET /{waba_id}/flows
// Docs: https://developers.facebook.com/docs/whatsapp/flows/reference/flowsapi
//
// IMPORTANT: Only meta_flow_id, name, and status are synced from Meta.
// body_text, cta_text, and field_mappings are user-configured in the app
// and are NEVER overwritten by this sync.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { organization_id, whatsapp_phone_number_id } = await req.json();

    if (!organization_id) throw new Error("organization_id is required");

    // ── Resolve WABA credentials (same priority order as whatsapp-sync-templates) ──
    let waba_id = "";
    let access_token = "";

    if (whatsapp_phone_number_id) {
      const { data: phoneRecord } = await supabaseAdmin
        .from("whatsapp_phone_numbers")
        .select("waba_id, access_token")
        .eq("id", whatsapp_phone_number_id)
        .eq("organization_id", organization_id)
        .single();

      if (phoneRecord?.waba_id && phoneRecord?.access_token) {
        waba_id = phoneRecord.waba_id;
        access_token = phoneRecord.access_token;
      }
    }

    if (!waba_id || !access_token) {
      const { data: defaultPhone } = await supabaseAdmin
        .from("whatsapp_phone_numbers")
        .select("waba_id, access_token")
        .eq("organization_id", organization_id)
        .eq("is_default", true)
        .limit(1)
        .single();

      if (defaultPhone?.waba_id && defaultPhone?.access_token) {
        waba_id = waba_id || defaultPhone.waba_id;
        access_token = access_token || defaultPhone.access_token;
      }
    }

    if (!waba_id || !access_token) {
      const { data: config, error: configError } = await supabaseAdmin
        .from("integration_settings")
        .select("credentials")
        .eq("organization_id", organization_id)
        .eq("service_name", "whatsapp")
        .single();

      if (configError || !config?.credentials?.waba_id || !config?.credentials?.access_token) {
        throw new Error("Missing WhatsApp configuration (WABA ID or Token). Check Settings.");
      }

      waba_id = waba_id || config.credentials.waba_id;
      access_token = access_token || config.credentials.access_token;
    }

    if (!waba_id || !access_token) {
      throw new Error("Could not resolve WhatsApp credentials.");
    }

    // ── Fetch flows from Meta API ──
    // Returns up to 100 flows ordered by creation date (newest first).
    // Paginate if needed via `data.paging.cursors.after`.
    const fields = "id,name,status,categories,endpoint_uri,preview";
    const url = `https://graph.facebook.com/v18.0/${waba_id}/flows?limit=100&fields=${fields}`;

    const metaRes = await fetch(url, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const metaData = await metaRes.json();

    if (metaData.error) {
      throw new Error(`Meta API Error: ${metaData.error.message}`);
    }

    const flows: any[] = metaData.data || [];

    if (flows.length === 0) {
      return new Response(
        JSON.stringify({ message: "No flows found in this WABA.", count: 0, flows: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ── Upsert into whatsapp_flows ──
    // Rule: only set defaults for new rows — never overwrite user config (body_text, cta_text, field_mappings).
    // We use a manual approach: check existence, insert new rows, update status of existing ones.
    let inserted = 0;
    let updated = 0;

    for (const flow of flows) {
      const metaFlowId: string = String(flow.id);
      const metaStatus: string = (flow.status || "").toLowerCase();  // DRAFT→draft, PUBLISHED→published …
      const flowName: string = flow.name || `Flow ${metaFlowId}`;
      const isEndpointSet: boolean = !!flow.endpoint_uri;

      // Map Meta status to our status enum (active/inactive/deprecated)
      const ourStatus =
        metaStatus === "published" ? "active" :
        metaStatus === "deprecated" || metaStatus === "blocked" ? "deprecated" :
        "inactive"; // draft, throttled, unknown

      // Check if we already have this flow registered
      const { data: existing } = await supabaseAdmin
        .from("whatsapp_flows")
        .select("id, status, name")
        .eq("organization_id", organization_id)
        .eq("meta_flow_id", metaFlowId)
        .single();

      if (existing) {
        // Only update name and status — preserve all user config
        await supabaseAdmin
          .from("whatsapp_flows")
          .update({
            name: existing.name === metaFlowId ? flowName : existing.name, // only update name if it was just the ID
            status: ourStatus,
            flow_type: isEndpointSet ? "dynamic" : "static",
          })
          .eq("id", existing.id);
        updated++;
      } else {
        // New flow: insert with sensible defaults; user can configure the rest later
        await supabaseAdmin
          .from("whatsapp_flows")
          .insert({
            organization_id,
            meta_flow_id: metaFlowId,
            name: flowName,
            status: ourStatus,
            flow_type: isEndpointSet ? "dynamic" : "static",
            body_text: "Por favor, completa el formulario.",
            cta_text: "Abrir formulario",
            field_mappings: {},
          });
        inserted++;
      }
    }

    // Return the synced flows with their DB IDs so the frontend can refresh
    const { data: syncedFlows } = await supabaseAdmin
      .from("whatsapp_flows")
      .select("id, meta_flow_id, name, status, flow_type, body_text, cta_text, first_screen, field_mappings, created_at, updated_at")
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: false });

    return new Response(
      JSON.stringify({
        message: `Sync complete. ${inserted} new, ${updated} updated.`,
        inserted,
        updated,
        total: flows.length,
        flows: syncedFlows ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[whatsapp-sync-flows] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
