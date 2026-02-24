import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Leer el body con los datos del usuario
    let body = {};
    try {
      const text = await req.text();
      console.log("📨 Raw request body:", text);
      if (text) {
        body = JSON.parse(text);
      }
    } catch (parseError) {
      console.error("❌ Error parsing body:", parseError);
      body = {};
    }
    
    console.log("🔵 [CREATE-ORG-ADMIN] Received request with body:", JSON.stringify(body));

    // Obtener userId y metadata del body
    const userId = body.userId;
    const userEmail = body.email;
    const metadata = body.metadata || {};

    console.log("🔍 Extracted values - userId:", userId, "email:", userEmail);

    if (!userId || !userEmail) {
      console.error("❌ Missing required fields - userId:", userId, "email:", userEmail);
      return new Response(
        JSON.stringify({ 
          error: "userId y email son requeridos",
          received: { userId, userEmail }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    console.log("📦 Processing user:", userEmail, "ID:", userId);
    console.log("📦 Metadata received:", JSON.stringify(metadata));

    // PASO 1: Crear organización
    console.log("📝 Creating organization...");
    const orgName = metadata.organizationName || "Mi Organización";
    
    const { data: orgData, error: orgError } = await adminClient
      .from("organizations")
      .insert({
        name: orgName,
        support_email: userEmail,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (orgError) {
      console.error("❌ Error creating organization:", orgError);
      return new Response(
        JSON.stringify({ 
          error: "Error creando organización",
          details: orgError.message 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    const orgId = orgData.id;
    console.log("✅ Organization created:", orgId);

    // PASO 2: Crear perfil
    console.log("📝 Creating profile...");
    const fullName = metadata.fullName || 
      `${metadata.firstName || ""} ${metadata.lastName || ""}`.trim() || 
      "Usuario";

    const { error: profileError } = await adminClient
      .from("profiles")
      .insert({
        id: userId,
        email: userEmail,
        full_name: fullName,
        organization_id: orgId,
        role: "admin",
        phone: metadata.whatsappNumber || null,
        created_at: new Date().toISOString(),
      });

    if (profileError) {
      console.error("❌ Error creating profile:", profileError);
      return new Response(
        JSON.stringify({ 
          error: "Error creando perfil",
          details: profileError.message 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("✅ Profile created");

    // PASO 3: Guardar metadatos
    console.log("📝 Saving metadata...");
    const { error: settingsError } = await adminClient
      .from("integration_settings")
      .insert({
        organization_id: orgId,
        service_name: "onboarding",
        credentials: {
          firstName: metadata.firstName,
          lastName: metadata.lastName,
          fullName: fullName,
          organizationName: orgName,
          country: metadata.country,
          whatsappNumber: metadata.whatsappNumber,
          companySize: metadata.companySize,
          platformUse: metadata.platformUse,
          industry: metadata.industry,
          botName: metadata.botName,
          email: userEmail,
          userId: userId,
          createdAt: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      });

    if (settingsError) {
      console.error("❌ Error saving metadata:", settingsError);
      return new Response(
        JSON.stringify({ 
          error: "Error guardando metadatos",
          details: settingsError.message 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("✅ Metadata saved");

    // PASO 4: Retornar datos completos
    console.log("✅ [CREATE-ORG-ADMIN] Completed successfully");
    
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userId,
          email: userEmail,
        },
        organization: {
          id: orgId,
          name: orgName,
        },
        profile: {
          fullName: fullName,
          role: "admin",
        },
        message: "✅ Organización, perfil y metadatos creados exitosamente",
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("❌ [CREATE-ORG-ADMIN] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || "Error desconocido"
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
