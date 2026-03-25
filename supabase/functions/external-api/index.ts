// supabase/functions/external-api/index.ts
//
// External API Gateway - Authenticates via API Key (X-API-Key header)
// Routes requests to the appropriate handler based on path and method.
// Validates: API key, scopes, endpoint enabled status, and rate limits.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================
// CORS Headers
// ============================================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Content-Type': 'application/json',
};

// ============================================================
// Helper: SHA-256 hash
// ============================================================
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// Helper: JSON error response
// ============================================================
function errorResponse(status: number, message: string, details?: string) {
  return new Response(
    JSON.stringify({ error: message, details: details || undefined }),
    { status, headers: corsHeaders }
  );
}

// ============================================================
// Helper: JSON success response
// ============================================================
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

// ============================================================
// Helper: Parse route from URL path
// Path format: /external-api/{endpoint}[/{id}]
// ============================================================
function parseRoute(url: URL): { endpoint: string; id?: string } {
  const parts = url.pathname.split('/').filter(Boolean);
  // Remove "external-api" prefix if present (Supabase function name)
  const funcIdx = parts.indexOf('external-api');
  const relevantParts = funcIdx >= 0 ? parts.slice(funcIdx + 1) : parts;
  
  return {
    endpoint: relevantParts[0] || '',
    id: relevantParts[1] || undefined,
  };
}

// ============================================================
// Main Handler
// ============================================================
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Extract API Key from header
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return errorResponse(401, 'Missing API key', 'Include your API key in the X-API-Key header');
    }

    // 2. Hash the key and look it up
    const keyHash = await hashKey(apiKey);
    const { data: keyRecord, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single();

    if (keyError || !keyRecord) {
      return errorResponse(401, 'Invalid or revoked API key');
    }

    // 3. Check expiration
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
      return errorResponse(401, 'API key has expired');
    }

    const organizationId = keyRecord.organization_id;
    const scopes: string[] = keyRecord.scopes || [];

    // 4. Parse route
    const url = new URL(req.url);
    const { endpoint, id } = parseRoute(url);
    const method = req.method.toUpperCase();

    if (!endpoint) {
      return errorResponse(400, 'No endpoint specified', 'Use /external-api/{endpoint}');
    }

    // 5. Map endpoint+method to a scope requirement
    const endpointName =
      endpoint === 'contacts' && id === 'search' && method === 'POST' ? 'contacts-search' :
      endpoint === 'contacts' && id === 'bulk'  && method === 'POST' ? 'contacts-bulk' :
      endpoint;
    
    const scopeMap: Record<string, Record<string, string>> = {
      'contacts': {
        'GET': 'contacts:read',
        'POST': 'contacts:write',
        'PUT': 'contacts:write',
        'DELETE': 'contacts:write',
      },
      'contacts-search': { 'POST': 'contacts:read' },
      'contacts-bulk':   { 'POST': 'contacts:write' },
      'conversations': {
        'GET': 'conversations:read',
        'PUT': 'conversations:write',
      },
      'messages': { 'GET': 'messages:read' },
      'send-message': { 'POST': 'messages:send' },
      'templates': { 'GET': 'templates:read' },
    };

    const requiredScope = scopeMap[endpointName]?.[method];
    if (!requiredScope) {
      return errorResponse(404, 'Endpoint not found', `${method} /${endpoint} is not a valid API endpoint`);
    }

    // 6. Check scope
    if (!scopes.includes(requiredScope)) {
      return errorResponse(403, 'Insufficient scope', `This API key does not have the "${requiredScope}" scope`);
    }

    // 7. Check if endpoint is enabled + enforce rate limit
    // contacts-bulk shares the contacts/POST config row
    const configEndpoint = endpointName === 'contacts-bulk' ? 'contacts' : endpointName;
    const configMethod   = endpointName === 'contacts-bulk' ? 'POST' : method;

    const { data: endpointConfig } = await supabase
      .from('api_endpoint_configs')
      .select('is_enabled, rate_limit_per_minute')
      .eq('organization_id', organizationId)
      .eq('endpoint_name', configEndpoint)
      .eq('method', configMethod)
      .single();

    if (endpointConfig && !endpointConfig.is_enabled) {
      return errorResponse(403, 'Endpoint disabled', `The ${method} /${endpoint} endpoint has been disabled by your organization admin`);
    }

    // Enforce rate limit using a rolling-minute counter in api_rate_counters
    if (endpointConfig?.rate_limit_per_minute) {
      const windowStart = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
      const counterKey  = `${keyRecord.id}:${configEndpoint}:${configMethod}:${windowStart}`;

      const { data: counterRow } = await supabase
        .from('api_rate_counters')
        .select('count')
        .eq('counter_key', counterKey)
        .maybeSingle();

      const currentCount = counterRow?.count ?? 0;
      if (currentCount >= endpointConfig.rate_limit_per_minute) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded', retryAfterSeconds: 60 }),
          { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } }
        );
      }

      // Increment counter (fire-and-forget)
      supabase.rpc('increment_rate_counter', {
        p_key: counterKey,
        p_expires_at: new Date(Math.floor(Date.now() / 60000) * 60000 + 120000).toISOString()
      }).then(() => {});
    }

    // 8. Update last_used_at (fire-and-forget)
    supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRecord.id)
      .then(() => {});

    // 9. Route to handler
    switch (endpointName) {
      case 'contacts':
        return await handleContacts(method, id, organizationId, req);
      case 'contacts-search':
        return await handleContactsSearch(organizationId, req);
      case 'contacts-bulk':
        return await handleContactsBulk(organizationId, req);
      case 'conversations':
        return await handleConversations(method, id, organizationId, req);
      case 'messages':
        return await handleMessages(organizationId, req, url);
      case 'send-message':
        return await handleSendMessage(organizationId, req);
      case 'templates':
        return await handleTemplates(organizationId, url);
      default:
        return errorResponse(404, 'Endpoint not found');
    }
  } catch (err) {
    console.error('External API Error:', err);
    return errorResponse(500, 'Internal server error');
  }
});

// ============================================================
// HANDLERS
// ============================================================

// --- CONTACTS ---
async function handleContacts(method: string, id: string | undefined, orgId: string, req: Request) {
  switch (method) {
    case 'GET': {
      if (id) {
        // GET /contacts/:id
        const { data, error } = await supabase
          .from('crm_contacts')
          .select('*')
          .eq('id', id)
          .eq('organization_id', orgId)
          .single();
        if (error || !data) return errorResponse(404, 'Contact not found');
        return jsonResponse({ data });
      } else {
        // GET /contacts?limit=50&offset=0
        const url = new URL(req.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
        const offset = parseInt(url.searchParams.get('offset') || '0');
        
        const { data, error, count } = await supabase
          .from('crm_contacts')
          .select('*', { count: 'exact' })
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) return errorResponse(500, 'Error fetching contacts', error.message);
        return jsonResponse({ data, pagination: { total: count, limit, offset } });
      }
    }
    case 'POST': {
      const body = await req.json();
      const { name, email, phone, company, pipeline_stage, custom_properties } = body;
      if (!name) return errorResponse(400, 'Name is required');

      const { data, error } = await supabase
        .from('crm_contacts')
        .insert({
          name, email, phone, company,
          pipeline_stage: pipeline_stage || 'lead',
          custom_properties: custom_properties || {},
          organization_id: orgId,
        })
        .select()
        .single();

      if (error) return errorResponse(500, 'Error creating contact', error.message);
      return jsonResponse({ data }, 201);
    }
    case 'PUT': {
      if (!id) return errorResponse(400, 'Contact ID required');
      const body = await req.json();
      const { name, email, phone, company, pipeline_stage, custom_properties } = body;

      const { data, error } = await supabase
        .from('crm_contacts')
        .update({ name, email, phone, company, pipeline_stage, custom_properties })
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single();

      if (error) return errorResponse(500, 'Error updating contact', error.message);
      if (!data) return errorResponse(404, 'Contact not found');
      return jsonResponse({ data });
    }
    case 'DELETE': {
      if (!id) return errorResponse(400, 'Contact ID required');
      const { error } = await supabase
        .from('crm_contacts')
        .delete()
        .eq('id', id)
        .eq('organization_id', orgId);

      if (error) return errorResponse(500, 'Error deleting contact', error.message);
      return jsonResponse({ message: 'Contact deleted' });
    }
    default:
      return errorResponse(405, 'Method not allowed');
  }
}

// --- CONTACTS SEARCH ---
async function handleContactsSearch(orgId: string, req: Request) {
  const body = await req.json();
  const { query, field, pipeline_stage, limit: rawLimit, offset: rawOffset } = body;
  
  const limit = Math.min(rawLimit || 50, 100);
  const offset = rawOffset || 0;

  let q = supabase
    .from('crm_contacts')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId);

  if (query && field) {
    q = q.ilike(field, `%${query}%`);
  } else if (query) {
    q = q.or(`name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`);
  }
  if (pipeline_stage) {
    q = q.eq('pipeline_stage', pipeline_stage);
  }

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return errorResponse(500, 'Error searching contacts', error.message);
  return jsonResponse({ data, pagination: { total: count, limit, offset } });
}

// --- CONTACTS BULK UPSERT ---
// POST /contacts/bulk
// Body: { contacts: Array<{ name, email, phone, company, pipeline_stage, custom_properties }>, upsert_on?: 'phone' | 'email' }
// Max 100 contacts per request. Upserts by phone (default) or email if upsert_on is set.
async function handleContactsBulk(orgId: string, req: Request) {
  const body = await req.json();
  const { contacts: rawContacts, upsert_on = 'phone' } = body;

  if (!Array.isArray(rawContacts) || rawContacts.length === 0) {
    return errorResponse(400, 'contacts array is required and must not be empty');
  }
  if (rawContacts.length > 100) {
    return errorResponse(400, 'Maximum 100 contacts per bulk request');
  }

  const results: { index: number; status: 'created' | 'updated' | 'error'; id?: string; error?: string }[] = [];

  for (let i = 0; i < rawContacts.length; i++) {
    const c = rawContacts[i];
    if (!c.name) {
      results.push({ index: i, status: 'error', error: 'name is required' });
      continue;
    }

    // Check for existing contact by upsert key
    let existingId: string | null = null;
    if (upsert_on === 'phone' && c.phone) {
      const { data: existing } = await supabase
        .from('crm_contacts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('phone', c.phone)
        .maybeSingle();
      existingId = existing?.id ?? null;
    } else if (upsert_on === 'email' && c.email) {
      const { data: existing } = await supabase
        .from('crm_contacts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('email', c.email)
        .maybeSingle();
      existingId = existing?.id ?? null;
    }

    const payload = {
      name: c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      company: c.company ?? null,
      pipeline_stage: c.pipeline_stage || 'lead',
      custom_properties: c.custom_properties || {},
      organization_id: orgId,
    };

    if (existingId) {
      const { data, error } = await supabase
        .from('crm_contacts')
        .update(payload)
        .eq('id', existingId)
        .select('id')
        .single();
      if (error) results.push({ index: i, status: 'error', error: error.message });
      else results.push({ index: i, status: 'updated', id: data.id });
    } else {
      const { data, error } = await supabase
        .from('crm_contacts')
        .insert(payload)
        .select('id')
        .single();
      if (error) results.push({ index: i, status: 'error', error: error.message });
      else results.push({ index: i, status: 'created', id: data.id });
    }
  }

  const created = results.filter(r => r.status === 'created').length;
  const updated = results.filter(r => r.status === 'updated').length;
  const errors  = results.filter(r => r.status === 'error').length;

  return jsonResponse({ summary: { created, updated, errors, total: rawContacts.length }, results }, 207);
}

// --- CONVERSATIONS ---
async function handleConversations(method: string, id: string | undefined, orgId: string, req: Request) {
  switch (method) {
    case 'GET': {
      if (id) {
        const { data, error } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', id)
          .eq('organization_id', orgId)
          .single();
        if (error || !data) return errorResponse(404, 'Conversation not found');
        return jsonResponse({ data });
      } else {
        const url = new URL(req.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const status = url.searchParams.get('status');
        const platform = url.searchParams.get('platform');

        let q = supabase
          .from('conversations')
          .select('*', { count: 'exact' })
          .eq('organization_id', orgId);

        if (status) q = q.eq('status', status);
        if (platform) q = q.eq('platform', platform);

        const { data, error, count } = await q
          .order('last_message_time', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) return errorResponse(500, 'Error fetching conversations', error.message);
        return jsonResponse({ data, pagination: { total: count, limit, offset } });
      }
    }
    case 'PUT': {
      if (!id) return errorResponse(400, 'Conversation ID required');
      const body = await req.json();
      const { status, assigned_to, tags } = body;

      const updates: Record<string, unknown> = {};
      if (status !== undefined) updates.status = status;
      if (assigned_to !== undefined) updates.assigned_to = assigned_to;
      if (tags !== undefined) updates.tags = tags;

      const { data, error } = await supabase
        .from('conversations')
        .update(updates)
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single();

      if (error) return errorResponse(500, 'Error updating conversation', error.message);
      if (!data) return errorResponse(404, 'Conversation not found');
      return jsonResponse({ data });
    }
    default:
      return errorResponse(405, 'Method not allowed');
  }
}

// --- MESSAGES ---
async function handleMessages(orgId: string, req: Request, url: URL) {
  const conversationId = url.searchParams.get('conversation_id');
  if (!conversationId) {
    return errorResponse(400, 'conversation_id query parameter is required');
  }

  // Verify conversation belongs to org
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('organization_id', orgId)
    .single();

  if (!conv) return errorResponse(404, 'Conversation not found');

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const { data, error, count } = await supabase
    .from('messages')
    .select('*', { count: 'exact' })
    .eq('conversation_id', conversationId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return errorResponse(500, 'Error fetching messages', error.message);
  return jsonResponse({ data, pagination: { total: count, limit, offset } });
}

// --- SEND MESSAGE ---
async function handleSendMessage(orgId: string, req: Request) {
  const body = await req.json();
  const { conversation_id, text, type, sender_id, metadata } = body;

  if (!conversation_id) return errorResponse(400, 'conversation_id is required');
  if (!text) return errorResponse(400, 'text is required');

  // Verify conversation belongs to org
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, contact_phone')
    .eq('id', conversation_id)
    .eq('organization_id', orgId)
    .single();

  if (!conv) return errorResponse(404, 'Conversation not found');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id,
      text,
      type: type || 'text',
      sender_id: sender_id || 'api',
      is_incoming: false,
      is_ai: false,
      status: 'sent',
      metadata: metadata || {},
      organization_id: orgId,
      author_name: 'API',
    })
    .select()
    .single();

  if (error) return errorResponse(500, 'Error sending message', error.message);

  // Update conversation last_message
  await supabase
    .from('conversations')
    .update({
      last_message: text,
      last_message_time: new Date().toISOString(),
    })
    .eq('id', conversation_id);

  return jsonResponse({ data }, 201);
}

// --- TEMPLATES ---
async function handleTemplates(orgId: string, url: URL) {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const status = url.searchParams.get('status');

  let q = supabase
    .from('meta_templates')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId);

  if (status) q = q.eq('status', status);

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return errorResponse(500, 'Error fetching templates', error.message);
  return jsonResponse({ data, pagination: { total: count, limit, offset } });
}
