// supabase/functions/ai-generate/index.ts
// Generic AI provider function supporting: Gemini, OpenAI, Claude, Custom
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
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

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado");

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();
    
    if (!profile?.organization_id) throw new Error("Usuario sin organización");

    const { 
      provider = 'gemini',
      conversation, 
      customer_name, 
      system_instruction,
      isTest = false 
    } = await req.json();

    // Build conversation text
    const conversationText = conversation.map((msg: any) => 
        `${msg.role === 'user' ? `Cliente (${customer_name})` : 'Asistente'}: ${msg.text}`
    ).join('\n');

    const systemInst = system_instruction || "Eres un asistente útil, profesional y amable.";

    const prompt = `
Contexto del Asistente (Instrucciones): ${systemInst}

Historial de Conversación:
${conversationText}

Instrucción: Genera una respuesta corta, clara y útil para que el agente la envíe al cliente ahora mismo.
Respuesta sugerida:`;

    let replyText = "";

    // Route to appropriate provider
    if (provider === 'gemini') {
      replyText = await callGemini(supabaseAdmin, profile.organization_id, prompt, isTest);
    } else if (provider === 'openai') {
      replyText = await callOpenAI(supabaseAdmin, profile.organization_id, prompt, isTest);
    } else if (provider === 'claude') {
      replyText = await callClaude(supabaseAdmin, profile.organization_id, prompt, isTest);
    } else if (provider === 'custom') {
      replyText = await callCustom(supabaseAdmin, profile.organization_id, prompt, isTest);
    } else {
      throw new Error(`Proveedor no soportado: ${provider}`);
    }

    return new Response(
        JSON.stringify({ reply: replyText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("AI Generate Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

// ============ PROVIDER IMPLEMENTATIONS ============

async function callGemini(supabaseAdmin: any, orgId: string, prompt: string, isTest: boolean): Promise<string> {
  const { data: config } = await supabaseAdmin
    .from('integration_settings')
    .select('credentials')
    .eq('organization_id', orgId)
    .eq('service_name', 'ai_provider_gemini')
    .single();

  if (!config?.credentials?.apiKey) {
    throw new Error("API Key de Gemini no configurada. Ve a Settings > AI.");
  }

  const modelId = config.credentials.modelId || 'gemini-2.5-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${config.credentials.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
        }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    console.error("Gemini Error:", data);
    throw new Error(`Gemini API Error: ${data.error?.message || 'Unknown error'}`);
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar respuesta.";
}

async function callOpenAI(supabaseAdmin: any, orgId: string, prompt: string, isTest: boolean): Promise<string> {
  const { data: config } = await supabaseAdmin
    .from('integration_settings')
    .select('credentials')
    .eq('organization_id', orgId)
    .eq('service_name', 'ai_provider_openai')
    .single();

  if (!config?.credentials?.apiKey) {
    throw new Error("API Key de OpenAI no configurada. Ve a Settings > AI.");
  }

  const modelId = config.credentials.modelId || 'gpt-4';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.credentials.apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: config.credentials.systemInstruction || 'Eres un asistente útil.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1024,
      temperature: 0.7,
    })
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("OpenAI Error:", data);
    throw new Error(`OpenAI API Error: ${data.error?.message || 'Unknown error'}`);
  }

  return data.choices?.[0]?.message?.content || "No se pudo generar respuesta.";
}

async function callClaude(supabaseAdmin: any, orgId: string, prompt: string, isTest: boolean): Promise<string> {
  const { data: config } = await supabaseAdmin
    .from('integration_settings')
    .select('credentials')
    .eq('organization_id', orgId)
    .eq('service_name', 'ai_provider_claude')
    .single();

  if (!config?.credentials?.apiKey) {
    throw new Error("API Key de Claude no configurada. Ve a Settings > AI.");
  }

  const modelId = config.credentials.modelId || 'claude-3-opus-20240229';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.credentials.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1024,
      system: config.credentials.systemInstruction || 'Eres un asistente útil.',
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Claude Error:", data);
    throw new Error(`Claude API Error: ${data.error?.message || 'Unknown error'}`);
  }

  return data.content?.[0]?.text || "No se pudo generar respuesta.";
}

async function callCustom(supabaseAdmin: any, orgId: string, prompt: string, isTest: boolean): Promise<string> {
  const { data: config } = await supabaseAdmin
    .from('integration_settings')
    .select('credentials')
    .eq('organization_id', orgId)
    .eq('service_name', 'ai_provider_custom')
    .single();

  if (!config?.credentials?.apiKey || !config?.credentials?.modelId) {
    throw new Error("Configuración incompleta para proveedor custom. Ve a Settings > AI.");
  }

  const response = await fetch(config.credentials.modelId, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.credentials.apiKey}`
    },
    body: JSON.stringify({
      prompt: prompt,
      system_instruction: config.credentials.systemInstruction || 'Eres un asistente útil.',
      max_tokens: 1024,
      temperature: 0.7,
    })
  });

  if (!response.ok) {
    console.error("Custom Provider Error:", response.status);
    throw new Error(`Error conectando con proveedor custom: ${response.status}`);
  }

  const data = await response.json();
  return data.reply || data.response || data.text || "No se pudo generar respuesta.";
}
