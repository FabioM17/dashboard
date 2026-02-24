// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

console.log("Hello from Functions!")

Deno.serve(async (req) => {
  // Simple CORS handling and OPTIONS preflight
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,apikey",
  }

  if (req.method === "OPTIONS") {
    return new Response(JSON.stringify({}), { status: 204, headers: corsHeaders })
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE') || ''
    const PUBLIC_BUCKET = (Deno.env.get('PUBLIC_BUCKET') || 'false') === 'true'
    const BUCKET = 'whatsapp-media'

    console.log('[Edge Function] PUBLIC_BUCKET mode:', PUBLIC_BUCKET);

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
      return new Response(JSON.stringify({ data: null, error: { message: 'Server not configured' } }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Import supabase client for Deno (ESM build)
    // Using jsdelivr +esm build ensures compatibility in Deno edge environment
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

    const body = await req.json().catch(() => null)
    if (!body.paths || body.paths.length === 0) {
      return new Response(JSON.stringify({ data: null, error: { message: 'paths array cannot be empty' } }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!body || !Array.isArray(body.paths)) {
      return new Response(JSON.stringify({ data: null, error: { message: 'Invalid body. Expected { paths: string[], expiresIn?: number }' } }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const paths: string[] = body.paths
    const expiresIn: number = typeof body.expiresIn === 'number' ? body.expiresIn : 3600

    console.log('[Edge Function] Processing paths:', paths);
    console.log('[Edge Function] Expires in:', expiresIn);

    const signedUrls: Record<string, string> = {}

    for (const p of paths) {
      try {
        if (!p || typeof p !== 'string') continue

        // Strip bucket prefix if path includes it (e.g., "whatsapp-media/images/file.jpg" -> "images/file.jpg")
        const cleanPath = p.startsWith(`${BUCKET}/`) ? p.substring(BUCKET.length + 1) : p
        console.log(`[Edge Function] Original path: "${p}", Clean path: "${cleanPath}"`);

        if (PUBLIC_BUCKET) {
          // Public URL pattern for Supabase Storage public buckets
          signedUrls[p] = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${encodeURI(cleanPath)}`
          console.log(`[Edge Function] Generated public URL: ${signedUrls[p]}`);
          continue
        }

        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(cleanPath, expiresIn)
        if (error || !data || !data.signedUrl) {
          console.error('Error creating signed URL for', p, error)
          // Do not fail whole request; include null to indicate failure per path
          signedUrls[p] = ''
        } else {
          signedUrls[p] = data.signedUrl
          console.log(`[Edge Function] Generated signed URL for "${p}": ${data.signedUrl}`);
        }
      } catch (e) {
        console.error('Unexpected error for path', p, e)
        signedUrls[p] = ''
      }
    }

    console.log('[Edge Function] Final signed URLs:', signedUrls);
    return new Response(JSON.stringify({ data: { signedUrls }, error: null }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('Handler error', err)
    return new Response(JSON.stringify({ data: null, error: { message: 'Internal server error' } }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-signed-urls' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
