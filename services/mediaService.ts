// Helper to call the Supabase Edge Function that generates signed URLs.
// Expects Vite environment variables in the frontend build:
// - VITE_SUPABASE_URL (e.g. https://xyz.supabase.co)
// - VITE_SUPABASE_ANON_KEY (anon/public key)
// - Optionally VITE_SUPABASE_FUNCTIONS_URL to override the functions base URL

export async function getSignedUrls(paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  if (!Array.isArray(paths) || paths.length === 0) return {}

  const FUNCTIONS_URL = (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string) || `${(import.meta.env.VITE_SUPABASE_URL as string)}/functions/v1/generate-signed-urls`
  const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

  console.log('[mediaService] Requesting signed URLs for:', paths);
  console.log('[mediaService] Functions URL:', FUNCTIONS_URL);

  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ANON_KEY ? { 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY } : {}),
    },
    body: JSON.stringify({ paths, expiresIn }),
  })

  console.log('[mediaService] Response status:', res.status);

  const json = await res.json().catch(() => null)
  console.log('[mediaService] Response body:', json);

  if (!res.ok) {
    const msg = json?.error?.message || `Failed to fetch signed urls (status ${res.status})`
    console.error('[mediaService] Error:', msg);
    throw new Error(msg)
  }

  const signedUrls = (json?.data?.signedUrls) || {}
  console.log('[mediaService] Signed URLs received:', signedUrls);
  
  return signedUrls
}

export default getSignedUrls
