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

    const body = await req.json();
    const {
      action = 'generate',
      provider = 'gemini',
      conversation,
      customer_name,
      system_instruction,
      task_type = 'chat_reply',  // 'chat_reply' | 'crm_insight' | 'bulk_analysis' | 'test'
      isTest = false,
      apiKeyPreview,
    } = body;

    // ── LIST MODELS ──────────────────────────────────────────────────────────
    if (action === 'list_models') {
      let apiKey = apiKeyPreview;
      if (!apiKey) {
        const { data: cfg } = await supabaseAdmin
          .from('integration_settings')
          .select('credentials')
          .eq('organization_id', profile.organization_id)
          .eq('service_name', `ai_provider_${provider}`)
          .single();
        apiKey = cfg?.credentials?.apiKey;
      }
      if (!apiKey) {
        return new Response(JSON.stringify({ models: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      let models: string[] = [];
      if (provider === 'gemini') models = await listGeminiModels(apiKey);
      else if (provider === 'openai') models = await listOpenAIModels(apiKey);
      else if (provider === 'claude') models = await listClaudeModels(apiKey);
      return new Response(JSON.stringify({ models }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── GENERATE ─────────────────────────────────────────────────────────────

    // Build conversation text from message array
    const conversationText = (conversation || []).map((msg: any) =>
        `${msg.role === 'user' ? `Cliente (${customer_name || 'Cliente'})` : 'Asistente'}: ${msg.text}`
    ).join('\n');

    // Input length guard — prevents abuse and prompt injection via oversized payloads
    if (conversationText.length > 50000) {
      return new Response(JSON.stringify({ error: 'Input too large. Maximum 50,000 characters.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Rate limiting: max 60 AI calls per organization per minute ────────────
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCalls } = await supabaseAdmin
      .from('ai_usage_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .gte('created_at', oneMinuteAgo);

    if ((recentCalls ?? 0) >= 60) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment before retrying.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Build prompt based on task type ──────────────────────────────────────
    const systemInst = system_instruction || "Eres un asistente útil, profesional y amable.";

    // For chat_reply: append the short-response instruction.
    // For crm_insight / bulk_analysis / test: pass content clean — the system prompt drives the output.
    const userContent = task_type === 'chat_reply'
      ? `Historial de Conversación:\n${conversationText}\n\nInstrucción: Genera una respuesta corta, clara y útil para que el agente la envíe al cliente ahora mismo.\nRespuesta sugerida:`
      : conversationText;

    let replyText = "";

    // Route to appropriate provider
    if (provider === 'gemini') {
      replyText = await callGemini(supabaseAdmin, profile.organization_id, systemInst, userContent, isTest);
    } else if (provider === 'openai') {
      replyText = await callOpenAI(supabaseAdmin, profile.organization_id, systemInst, userContent, isTest);
    } else if (provider === 'claude') {
      replyText = await callClaude(supabaseAdmin, profile.organization_id, systemInst, userContent, isTest);
    } else if (provider === 'custom') {
      replyText = await callCustom(supabaseAdmin, profile.organization_id, systemInst, userContent, isTest);
    } else {
      throw new Error(`Proveedor no soportado: ${provider}`);
    }

    // ── Log usage (non-blocking — fire and forget) ────────────────────────────
    supabaseAdmin.from('ai_usage_log').insert({
      organization_id: profile.organization_id,
      user_id: user.id,
      provider,
      task_type,
    }).then(() => {/* ignore */}).catch(() => {/* ignore */});

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

async function callGemini(supabaseAdmin: any, orgId: string, systemInstruction: string, userContent: string, isTest: boolean): Promise<string> {
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
  // Gemini: prepend system instruction to the single text prompt
  const fullPrompt = `${systemInstruction}\n\n${userContent}`;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${config.credentials.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: 2048,
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

async function callOpenAI(supabaseAdmin: any, orgId: string, systemInstruction: string, userContent: string, isTest: boolean): Promise<string> {
  const { data: config } = await supabaseAdmin
    .from('integration_settings')
    .select('credentials')
    .eq('organization_id', orgId)
    .eq('service_name', 'ai_provider_openai')
    .single();

  if (!config?.credentials?.apiKey) {
    throw new Error("API Key de OpenAI no configurada. Ve a Settings > AI.");
  }

  const modelId = config.credentials.modelId || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.credentials.apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userContent }
      ],
      max_tokens: 2048,
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

async function callClaude(supabaseAdmin: any, orgId: string, systemInstruction: string, userContent: string, isTest: boolean): Promise<string> {
  const { data: config } = await supabaseAdmin
    .from('integration_settings')
    .select('credentials')
    .eq('organization_id', orgId)
    .eq('service_name', 'ai_provider_claude')
    .single();

  if (!config?.credentials?.apiKey) {
    throw new Error("API Key de Claude no configurada. Ve a Settings > AI.");
  }

  const modelId = config.credentials.modelId || 'claude-3-5-haiku-20241022';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.credentials.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 2048,
      system: systemInstruction,
      messages: [
        { role: 'user', content: userContent }
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

async function callCustom(supabaseAdmin: any, orgId: string, systemInstruction: string, userContent: string, isTest: boolean): Promise<string> {
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
      prompt: `${systemInstruction}\n\n${userContent}`,
      system_instruction: systemInstruction,
      max_tokens: 2048,
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

// ============ MODEL LISTING ============

async function listGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=50`,
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.models || [])
      .filter((m: any) =>
        m.supportedGenerationMethods?.includes('generateContent') &&
        m.name?.includes('gemini')
      )
      .map((m: any) => m.name.replace('models/', ''))
      .sort();
  } catch { return []; }
}

async function listOpenAIModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return [];
    const data = await response.json();
    const chat = (data.data || [])
      .map((m: any) => m.id as string)
      .filter((id: string) =>
        id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')
      )
      .sort();
    return chat;
  } catch { return []; }
}

async function listClaudeModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).map((m: any) => m.id as string).sort();
  } catch { return []; }
}
