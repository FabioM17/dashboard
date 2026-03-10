// supabase/functions/form-submit/index.ts
//
// Public form submission endpoint — NO API KEY REQUIRED.
// Security model:
//   1. form_id is resolved to an organization_id server-side (never trusted from client).
//   2. Origin header is validated against the form's allowed_origins whitelist (if set).
//   3. Per-IP rate limiting (in-memory sliding window, 10 req/min per form+IP).
//   4. All text inputs are sanitized (HTML stripped, length capped).
//   5. Uses service role key for DB operations — bypasses RLS safely.
//
// Route: POST /form-submit/{form_id}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ─── Rate limiter ────────────────────────────────────────────────────────────
// Key: sha256(ip):formId  →  { count, windowStart }
// Window: 60 seconds, max 10 submissions per IP per form
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

async function checkRateLimit(ip: string, formId: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const ipData = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', ipData);
  const ipHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  const key = `${ipHash}:${formId}`;
  const now = Date.now();

  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true; // allowed
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false; // blocked
  }
  entry.count++;
  return true; // allowed
}

// ─── Sanitize ─────────────────────────────────────────────────────────────────
function sanitize(value: unknown, maxLength = 500): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  // Strip HTML tags
  const stripped = str.replace(/<[^>]*>/g, '');
  return stripped.slice(0, maxLength);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function errorResponse(status: number, message: string, details?: string) {
  return new Response(
    JSON.stringify({ error: message, ...(details ? { details } : {}) }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

function successResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ─── CORS preflight ───────────────────────────────────────────────────────────
function corsPreflightResponse(allowedOrigin: string) {
  return new Response('ok', {
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

// ─── Origin validation ────────────────────────────────────────────────────────
// Returns the validated origin to use in CORS response header,
// or null if the origin is not allowed.
function validateOrigin(requestOrigin: string | null, allowedOrigins: string[]): string | null {
  // No origin restriction configured → allow all (respond with '*')
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return '*';
  }
  if (!requestOrigin) {
    // No Origin header (e.g. server-side request) — reject when whitelist is set
    return null;
  }
  // Normalize: strip trailing slash
  const normalizedRequest = requestOrigin.replace(/\/$/, '').toLowerCase();
  for (const allowed of allowedOrigins) {
    const normalizedAllowed = allowed.replace(/\/$/, '').toLowerCase();
    if (normalizedRequest === normalizedAllowed) {
      return requestOrigin; // return original casing for header
    }
    // Support wildcard subdomain: *.example.com
    if (normalizedAllowed.startsWith('*.')) {
      const domain = normalizedAllowed.slice(2);
      if (normalizedRequest.endsWith(`.${domain}`) || normalizedRequest === domain) {
        return requestOrigin;
      }
    }
  }
  return null; // not in whitelist
}

// ─── Parse form_id from URL ───────────────────────────────────────────────────
function parseFormId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  // Path like: /form-submit/{uuid} or /functions/v1/form-submit/{uuid}
  const idx = parts.findIndex(p => p === 'form-submit');
  if (idx >= 0 && parts[idx + 1]) {
    return parts[idx + 1];
  }
  // Fallback: last segment
  const last = parts[parts.length - 1];
  // Validate UUID format
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(last)) {
    return last;
  }
  return null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const requestOrigin = req.headers.get('origin');

  // Handle CORS preflight (before form lookup to be fast)
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(requestOrigin || '*');
  }

  if (req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed', 'Only POST is accepted');
  }

  // 1. Extract form_id from URL
  const formId = parseFormId(url);
  if (!formId) {
    return errorResponse(400, 'Missing form ID', 'URL must be /form-submit/{form_id}');
  }

  // 2. Validate UUID format to avoid unnecessary DB queries
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formId)) {
    return errorResponse(400, 'Invalid form ID format');
  }

  // 3. Fetch the form from DB (service role → bypasses RLS)
  const { data: form, error: formError } = await supabase
    .from('crm_forms')
    .select('id, organization_id, name, fields, allowed_origins, is_active, submission_count')
    .eq('id', formId)
    .single();

  if (formError || !form) {
    return errorResponse(404, 'Form not found or has been deleted');
  }

  if (!form.is_active) {
    return errorResponse(403, 'This form is no longer accepting submissions');
  }

  // 4. Validate Origin against the form's allowed_origins
  const allowedOrigin = validateOrigin(requestOrigin, form.allowed_origins || []);
  if (allowedOrigin === null) {
    console.warn(`[form-submit] Origin rejected: ${requestOrigin} for form ${formId}`);
    return errorResponse(403, 'Origin not allowed', 'This domain is not authorized to submit this form');
  }

  // 5. Rate limit by IP
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const allowed = await checkRateLimit(clientIp, formId);
  if (!allowed) {
    return errorResponse(429, 'Too many requests', 'Please wait a moment before submitting again');
  }

  // 6. Parse and validate body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  // 7. Validate required fields from form definition
  const fields: Array<{ key: string; label: string; required: boolean; isBase: boolean; type: string }> =
    Array.isArray(form.fields) ? form.fields : [];

  const missingFields: string[] = [];
  for (const field of fields) {
    if (field.required) {
      const val = body[field.key];
      if (val === undefined || val === null || String(val).trim() === '') {
        missingFields.push(field.label || field.key);
      }
    }
  }
  if (missingFields.length > 0) {
    return errorResponse(400, `Missing required fields: ${missingFields.join(', ')}`);
  }

  // 8. Map known base fields and sanitize; put the rest in custom_properties
  const BASE_FIELD_KEYS = new Set(['name', 'email', 'phone', 'company', 'pipelineStageId']);

  const contactData: Record<string, unknown> = {
    organization_id: form.organization_id, // ALWAYS from DB, never from client
    pipeline_stage: 'lead',                 // default
    custom_properties: {} as Record<string, unknown>,
    // source tracking
    source: 'form',
    source_form_id: formId,
  };

  for (const field of fields) {
    const rawValue = body[field.key];
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') continue;

    const sanitized = sanitize(rawValue);

    if (field.key === 'name')            contactData.name = sanitized;
    else if (field.key === 'email')      contactData.email = sanitized.toLowerCase();
    else if (field.key === 'phone')      contactData.phone = sanitized;
    else if (field.key === 'company')    contactData.company = sanitized;
    else if (field.key === 'pipelineStageId') contactData.pipeline_stage = sanitized;
    else {
      // Custom property — goes into custom_properties object
      (contactData.custom_properties as Record<string, unknown>)[field.key] = sanitized;
    }
  }

  // Ensure name is present (required by schema)
  if (!contactData.name) {
    // Try to build a name from email if name field not in form
    const emailField = body['email'] || body['correo'];
    if (emailField) {
      contactData.name = sanitize(String(emailField).split('@')[0]);
    } else {
      return errorResponse(400, 'Name is required but was not provided or is empty');
    }
  }

  // 9. Insert contact (service role → bypasses RLS)
  // Note: organization_id is set server-side from the form record
  const { data: contact, error: insertError } = await supabase
    .from('crm_contacts')
    .insert({
      name: contactData.name,
      email: contactData.email || null,
      phone: contactData.phone || null,
      company: contactData.company || null,
      pipeline_stage: contactData.pipeline_stage || 'lead',
      custom_properties: contactData.custom_properties,
      organization_id: form.organization_id, // enforced server-side
    })
    .select('id, name, email')
    .single();

  if (insertError) {
    console.error(`[form-submit] Insert error for form ${formId}:`, insertError);
    return errorResponse(500, 'Could not save your submission. Please try again later.');
  }

  // 10. Increment submission counter (fire-and-forget, don't block response)
  supabase
    .from('crm_forms')
    .update({ submission_count: (form.submission_count || 0) + 1 })
    .eq('id', formId)
    .then(({ error }) => {
      if (error) console.warn('[form-submit] Could not increment submission_count:', error.message);
    });

  // 11. Return success
  return new Response(
    JSON.stringify({ success: true, id: contact.id }),
    {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin,
      },
    }
  );
});
