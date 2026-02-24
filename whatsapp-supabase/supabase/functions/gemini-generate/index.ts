// supabase/functions/gemini-generate/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Definir CORS headers para que tu web pueda llamar a esta función
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de Preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // 1. Obtener la organización del usuario que llama
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado");

    // Usamos el cliente ADMIN para leer configuraciones sensibles
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar el organization_id del usuario
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();
    
    if (!profile?.organization_id) throw new Error("Usuario sin organización");

    // 2. Leer Configuración de Gemini de la DB
    const { data: config } = await supabaseAdmin
        .from('integration_settings')
        .select('credentials')
        .eq('organization_id', profile.organization_id)
        .eq('service_name', 'gemini')
        .single();

    if (!config?.credentials?.api_key) {
        throw new Error("API Key de Gemini no configurada. Ve a Settings > AI Agent.");
    }

    const { api_key, system_instruction } = config.credentials;
    const { conversation, customer_name } = await req.json();

    // 3. Preparar Prompt
    // Convertimos el historial a un formato simple
    const conversationText = conversation.map((msg: any) => 
        `${msg.role === 'user' ? `Cliente (${customer_name})` : 'Agente'}: ${msg.text}`
    ).join('\n');

    const prompt = `
        Contexto del Agente (System Instruction): ${system_instruction || "Eres un asistente útil y profesional."}
        
        Historial de Conversación:
        ${conversationText}
        
        Instrucción: Genera una respuesta corta, amable y útil para que el agente la envíe al cliente ahora mismo.
        Respuesta sugerida:
    `;

    // 4. Llamar a Google Gemini API (REST)
    // Usamos el modelo gemini-2.5-flash
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${api_key}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        }
    );

    const geminiData = await response.json();

    if (!response.ok) {
        console.error("Gemini API Error:", geminiData);
        throw new Error("Error conectando con Gemini AI");
    }

    const replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar respuesta.";

    return new Response(
        JSON.stringify({ reply: replyText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});