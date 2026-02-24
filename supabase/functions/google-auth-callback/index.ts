import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://dashboardchat.docreativelatam.com";
const REDIRECT_URI = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/google-auth-callback`;

// ─── Helpers ────────────────────────────────────────────────────────
const getAllowedOrigin = (requestOrigin: string | null, stateOrigin: string | null): string => {
  if (requestOrigin?.includes("localhost")) return requestOrigin;
  if (stateOrigin) return stateOrigin;
  return FRONTEND_URL;
};

/** Build a redirect URL to the frontend with auth result params */
const buildRedirectUrl = (baseOrigin: string, params: Record<string, string>) => {
  const url = new URL(baseOrigin);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
};

const redirect = (url: string) =>
  new Response(null, { status: 302, headers: { Location: url } });

// ─── Main handler ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");
  const requestOrigin = req.headers.get("origin");

  // Parse state (JSON encoded by the frontend)
  let organizationId = "";
  let stateOrigin: string | null = null;
  try {
    if (stateRaw) {
      const s = JSON.parse(decodeURIComponent(stateRaw));
      organizationId = s.organization_id || "";
      stateOrigin = s.origin || null;
    }
  } catch (_) {
    console.warn("[google-auth-callback] Could not parse state:", stateRaw);
  }

  const allowedOrigin = getAllowedOrigin(requestOrigin, stateOrigin);

  console.log("=== GOOGLE AUTH CALLBACK ===");
  console.log("code:", code ? "present" : "missing");
  console.log("organizationId:", organizationId);
  console.log("allowedOrigin:", allowedOrigin);

  // ── Error from Google ──────────────────────────────────────────────
  if (error) {
    console.error("Google OAuth error:", error, errorDesc);
    return redirect(buildRedirectUrl(allowedOrigin, {
      google_auth: "error",
      google_auth_message: errorDesc || "OAuth falló",
    }));
  }

  if (!code) {
    return redirect(buildRedirectUrl(allowedOrigin, {
      google_auth: "error",
      google_auth_message: "Código no proporcionado",
    }));
  }

  if (!organizationId) {
    return redirect(buildRedirectUrl(allowedOrigin, {
      google_auth: "error",
      google_auth_message: "organization_id no encontrado",
    }));
  }

  try {
    // ── 1. Exchange code for tokens ──────────────────────────────────
    console.log("[google-auth-callback] Exchanging code for tokens …");
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    console.log("[google-auth-callback] Token response status:", tokenRes.status);

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("[google-auth-callback] Token exchange failed:", tokenData);
      return redirect(buildRedirectUrl(allowedOrigin, {
        google_auth: "error",
        google_auth_message: tokenData.error_description || "No se pudo obtener tokens",
      }));
    }

    const { access_token, refresh_token } = tokenData;
    console.log("[google-auth-callback] access_token:", access_token ? "YES" : "NO");
    console.log("[google-auth-callback] refresh_token:", refresh_token ? "YES" : "NO");

    // ── 2. Get user email ────────────────────────────────────────────
    let gmailAddress = "";
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (userRes.ok) {
        const u = await userRes.json();
        gmailAddress = u.email || "";
      }
    } catch (e) {
      console.warn("[google-auth-callback] Could not fetch userinfo:", e);
    }
    console.log("[google-auth-callback] gmailAddress:", gmailAddress);

    // ── 3. Save to integration_settings ──────────────────────────────
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error: upsertError } = await supabaseAdmin
      .from("integration_settings")
      .upsert(
        {
          organization_id: organizationId,
          service_name: "gmail",
          credentials: {
            access_token,
            refresh_token: refresh_token || null,
            gmail_address: gmailAddress,
            connected_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id, service_name" }
      );

    if (upsertError) {
      console.error("[google-auth-callback] Upsert error:", upsertError);
      return redirect(buildRedirectUrl(allowedOrigin, {
        google_auth: "error",
        google_auth_message: upsertError.message,
      }));
    }

    console.log("[google-auth-callback] ✅ Credentials saved for org:", organizationId);

    // ── 4. Redirect back to frontend with success params ─────────────
    return redirect(buildRedirectUrl(allowedOrigin, {
      google_auth: "success",
      google_auth_email: gmailAddress,
    }));
  } catch (err: any) {
    console.error("[google-auth-callback] Unexpected error:", err);
    return redirect(buildRedirectUrl(allowedOrigin, {
      google_auth: "error",
      google_auth_message: String(err),
    }));
  }
});
