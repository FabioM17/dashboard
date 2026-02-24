import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const FACEBOOK_APP_ID = Deno.env.get("FACEBOOK_APP_ID") || "";
const FACEBOOK_APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://dashboardchat.docreativelatam.com";
const REDIRECT_URI = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/facebook-auth-callback`;

// Helper to determine allowed origin for CORS
const getAllowedOrigin = (requestOrigin: string | null, stateOrigin: string | null): string => {
  // In development, allow localhost
  if (requestOrigin?.includes('localhost')) return requestOrigin;
  // Use origin from state parameter if available
  if (stateOrigin) return stateOrigin;
  // Fallback to configured FRONTEND_URL
  return FRONTEND_URL;
};

interface FacebookTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface FacebookMeResponse {
  id: string;
  name?: string;
  email?: string;
}

interface FacebookWABAResponse {
  data: Array<{
    id: string;
    name?: string;
  }>;
}

Deno.serve(async (req) => {
  // Allow CORS
  if (req.method === "OPTIONS") {
    const requestOrigin = req.headers.get("origin") || FRONTEND_URL;
    const allowedOrigin = requestOrigin.includes('localhost') ? requestOrigin : FRONTEND_URL;
    
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }

  try {
    // Parse query params
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // organization_id + origin
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");
    const wantsJson = url.searchParams.get("format") === "json" || (req.headers.get("accept")?.includes("application/json") ?? false);
    
    // Extract origin from request headers
    const requestOrigin = req.headers.get("origin");
    
    // Try to parse state to get client origin and embedded signup data
    let stateOrigin: string | null = null;
    let embeddedSignupData: any = null;
    try {
      if (state) {
        const stateObj = JSON.parse(state);
        stateOrigin = stateObj.origin;
        embeddedSignupData = stateObj.embedded_signup;
      }
    } catch (e) {
      console.log("Could not parse state for origin and embedded data");
    }
    
    // Determine the allowed origin for CORS
    const allowedOrigin = getAllowedOrigin(requestOrigin, stateOrigin);
    let clientOrigin: string | null = allowedOrigin;

    console.log("=== FACEBOOK AUTH CALLBACK START ===");
    console.log("Request Origin:", requestOrigin);
    console.log("State Origin:", stateOrigin);
    console.log("Allowed Origin:", allowedOrigin);
    console.log("URL:", req.url);
    console.log("Code:", code);
    console.log("State:", state);
    console.log("Error:", error);
    console.log("ErrorDescription:", errorDescription);

    const buildPopupHtml = (payload: Record<string, unknown>, origin: string | null = null) => {
      const messageJson = JSON.stringify(payload);
      const finalOrigin = origin || clientOrigin || FRONTEND_URL;
      
      return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>Facebook Auth</title>
    <style>
      body { font-family: sans-serif; padding: 20px; text-align: center; }
      h1 { color: #10a37f; }
      p { color: #666; }
    </style>
  </head>
  <body>
    <h1>✅ Authentication Successful!</h1>
    <p>Processing login... closing popup soon.</p>
    <script>
      (function() {
        try {
          const message = ${messageJson};
          const targetOrigin = '${finalOrigin}';
          
          console.log('[FacebookAuth] Sending postMessage to:', targetOrigin);
          console.log('[FacebookAuth] Message:', message);
          
          if (window.opener) {
            window.opener.postMessage(message, targetOrigin);
            console.log('[FacebookAuth] Message sent to opener');
          } else {
            console.warn('[FacebookAuth] No window.opener available');
          }
          
          setTimeout(function() {
            window.close();
          }, 2000);
        } catch (error) {
          console.error('[FacebookAuth] Error:', error);
        }
      })();
    </script>
  </body>
</html>`;
    };

    // Handle OAuth errors
    if (error) {
      console.error("OAuth error:", error, errorDescription);
      const payload = {
        success: false,
        type: "FACEBOOK_AUTH_ERROR",
        timestamp: new Date().toISOString(),
        error: {
          code: error,
          message: errorDescription || "OAuth authorization failed",
          details: "User denied authorization or session expired",
        },
        metadata: {
          requestId: crypto.randomUUID(),
          apiVersion: "v1",
        },
      };

      if (wantsJson) {
        return new Response(JSON.stringify(payload), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": allowedOrigin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      }

      return new Response(buildPopupHtml(payload), {
        status: 400,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store",
        },
      });
    }

    if (!code) {
      const payload = {
        success: false,
        type: "MISSING_AUTHORIZATION_CODE",
        timestamp: new Date().toISOString(),
        error: {
          code: "missing_code",
          message: "Authorization code not provided",
          details: "The authorization code from Facebook is required to complete login",
        },
        metadata: {
          requestId: crypto.randomUUID(),
          apiVersion: "v1",
        },
      };

      if (wantsJson) {
        return new Response(JSON.stringify(payload), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": allowedOrigin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      }

      return new Response(buildPopupHtml(payload), {
        status: 400,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store",
        },
      });
    }

    let organizationId: string | null = null;
    if (state) {
      try {
        const parsed = JSON.parse(decodeURIComponent(state));
        if (parsed && typeof parsed === "object") {
          // Support multiple naming conventions
          const org = 
            (parsed as any).organization_id ??
            (parsed as any).organizationId ??
            (parsed as any).org_id;
          if (typeof org === "string") organizationId = org;
          const origin = (parsed as { origin?: unknown }).origin;
          if (typeof origin === "string" && /^https?:\/\//.test(origin)) {
            clientOrigin = origin;
          }
        }
      } catch (_) {
        organizationId = state;
      }
    }

    console.log("Parsed State:", { organizationId, clientOrigin });

    // Step 1: Exchange code for access token
    // For Embedded Signup v3 with popup, DO NOT include redirect_uri
    // The code comes from FB.login popup, not from a redirect callback
    const tokenUrl = `https://graph.facebook.com/v22.0/oauth/access_token`;
    
    console.log("=== TOKEN EXCHANGE REQUEST ===");
    console.log("Token URL:", tokenUrl);
    console.log("App ID:", FACEBOOK_APP_ID);
    console.log("Code:", code.substring(0, 50) + "...");

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        code: code,
        grant_type: "authorization_code",
        // DO NOT include redirect_uri for popup-based Embedded Signup
      }),
    });

    console.log("=== TOKEN EXCHANGE RESPONSE ===");
    console.log("Status:", tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("❌ Token exchange failed:", errorData);
      throw new Error(
        `Token exchange failed: ${errorData.error?.message || "Unknown error"}`
      );
    }

    const tokenData: FacebookTokenResponse = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in;

    console.log("=== TOKEN RESPONSE ===");
    console.log("AccessToken (first 50 chars):", accessToken?.substring(0, 50) + "...");
    console.log("ExpiresIn:", expiresIn);

    // Step 2: Get user info
    const meUrl = `https://graph.facebook.com/v20.0/me?fields=id,name,email&access_token=${accessToken}`;
    const meResponse = await fetch(meUrl);

    if (!meResponse.ok) {
      throw new Error("Failed to fetch user info");
    }

    const userData: FacebookMeResponse = await meResponse.json();
    const facebookUserId = userData.id;

    console.log("=== USER INFO RESPONSE ===");
    console.log("User:", JSON.stringify(userData));

    // Step 3: Get WABA list (WhatsApp Business Accounts) - Requires Advanced Access
    const wabaUrl = `https://graph.facebook.com/v20.0/me/owned_whatsapp_business_accounts?fields=id,name,phone_number_id&access_token=${accessToken}`;
    const wabaResponse = await fetch(wabaUrl);

    let wabaId: string | null = null;
    let phoneNumberId: string | null = null;
    let wabaName: string | null = null;

    if (wabaResponse.ok) {
      const wabaData = await wabaResponse.json() as { data?: Array<Record<string, unknown>> };
      console.log("=== WABA RESPONSE ===");
      console.log("WABA Data:", JSON.stringify(wabaData));
      
      if (wabaData.data && wabaData.data.length > 0) {
        const waba = wabaData.data[0];
        if (waba.id && typeof waba.id === 'string') {
          wabaId = waba.id;
        }
        if (waba.name && typeof waba.name === 'string') {
          wabaName = waba.name;
        }
        
        // Try to get phone_number_id from WABA directly
        if (waba.phone_number_id && typeof waba.phone_number_id === 'string') {
          phoneNumberId = waba.phone_number_id;
        } else if (wabaId) {
          // If not in main response, fetch phone numbers separately
          const phoneUrl = `https://graph.facebook.com/v20.0/${wabaId}/phone_numbers?access_token=${accessToken}`;
          const phoneResponse = await fetch(phoneUrl);
          
          if (phoneResponse.ok) {
            const phoneData = await phoneResponse.json() as { data?: Array<Record<string, unknown>> };
            console.log("=== PHONE NUMBERS RESPONSE ===");
            console.log("Phone Data:", JSON.stringify(phoneData));
            
            if (phoneData.data && phoneData.data.length > 0) {
              const phone = phoneData.data[0];
              if (phone.id && typeof phone.id === 'string') {
                phoneNumberId = phone.id;
              }
            }
          } else {
            const phoneError = await phoneResponse.json();
            console.log("Phone numbers fetch error:", JSON.stringify(phoneError));
          }
        }
      }
    } else {
      const wabaError = await wabaResponse.json();
      console.log("=== WABA FETCH ERROR (requires Advanced Access) ===");
      console.log("WABA Error:", JSON.stringify(wabaError));
    }

    // Step 4: Save to Supabase (if organization_id provided)
    if (organizationId) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Calculate expiration date (default to 60 days if not provided)
        const expiresInSeconds = expiresIn || 5184000; // 60 days default
        const expiresAt = new Date(
          Date.now() + expiresInSeconds * 1000
        ).toISOString();

        const credentials = {
          facebook_access_token: accessToken,
          facebook_user_id: facebookUserId,
          facebook_expires_at: expiresAt,
          waba_id: wabaId || embeddedSignupData?.waba_id,
          waba_name: wabaName,
          phone_number_id: phoneNumberId || embeddedSignupData?.phone_number_id,
          user_name: userData.name || "Unknown",
          user_email: userData.email || "N/A",
          // Embedded Signup Data
          business_id: embeddedSignupData?.business_id || null,
          ad_account_ids: embeddedSignupData?.ad_account_ids || [],
          page_ids: embeddedSignupData?.page_ids || [],
          dataset_ids: embeddedSignupData?.dataset_ids || [],
        };

        console.log("=== SAVING TO SUPABASE ===");
        console.log("Organization ID:", organizationId);
        console.log("Facebook Credentials:", JSON.stringify(credentials));

        const facebookUpsert = await supabase
          .from("integration_settings")
          .upsert(
            {
              service_name: "facebook",
              organization_id: organizationId,
              credentials: credentials,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "organization_id,service_name",
            }
          );

        console.log("Facebook Upsert Result:", facebookUpsert);
        if (facebookUpsert.error) {
          console.error("❌ Error saving Facebook data:", facebookUpsert.error);
        } else {
          console.log("✅ Facebook data saved successfully");
        }

        // Update WhatsApp access_token only (preserve existing data from service)
        console.log("=== UPDATING WHATSAPP ACCESS TOKEN ===");
        console.log("Organization ID:", organizationId);

        // First, get existing WhatsApp data
        const { data: existingWhatsApp, error: fetchError } = await supabase
          .from("integration_settings")
          .select("credentials")
          .eq("organization_id", organizationId)
          .eq("service_name", "whatsapp")
          .single()
          .returns<{ credentials: any }>();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error("❌ Error fetching existing WhatsApp data:", fetchError);
        }

        // Merge with existing credentials, only updating access_token
        const existingCredentials = existingWhatsApp?.credentials || {};
        const updatedCredentials = {
          ...existingCredentials,
          access_token: accessToken, // Update only the access token
          linked_from_facebook: true,
          facebook_linked_at: new Date().toISOString(),
        };

        console.log("Existing credentials:", JSON.stringify(existingCredentials));
        console.log("Updated credentials:", JSON.stringify(updatedCredentials));

        const whatsappUpsert = await supabase
          .from("integration_settings")
          .upsert(
            {
              service_name: "whatsapp",
              organization_id: organizationId,
              credentials: updatedCredentials,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "organization_id,service_name",
            }
          );

        console.log("WhatsApp Upsert Result:", whatsappUpsert);
        if (whatsappUpsert.error) {
          console.error("❌ Error saving WhatsApp data:", whatsappUpsert.error);
        } else {
          console.log("✅ WhatsApp access_token updated successfully");
        }

      } catch (dbError) {
        console.error("❌ Error saving to Supabase:", dbError);
        // Still return success to the popup, data was obtained from Facebook
      }
    }

    const payload = {
      success: true,
      type: "FACEBOOK_AUTH_SUCCESS",
      message: "WhatsApp Business Account successfully registered",
      timestamp: new Date().toISOString(),
      data: {
        // User information
        user: {
          id: facebookUserId,
          name: userData.name || "Unknown",
          email: userData.email || "N/A",
          facebookId: facebookUserId,
        },
        // Token information
        authentication: {
          accessToken: accessToken,
          expiresIn: expiresIn,
          tokenType: "bearer",
          refreshable: false,
        },
        // WhatsApp Business Account information
        whatsappBusiness: {
          wabaId: wabaId || embeddedSignupData?.waba_id || null,
          wabaName: wabaName || null,
          phoneNumberId: phoneNumberId || embeddedSignupData?.phone_number_id || null,
          hasPlatformAccess: Boolean(wabaId || embeddedSignupData?.waba_id),
        },
        // Embedded Signup Data from Facebook (v3)
        embeddedSignup: embeddedSignupData ? {
          phoneNumberId: embeddedSignupData.phone_number_id || null,
          wabaId: embeddedSignupData.waba_id || null,
          businessId: embeddedSignupData.business_id || null,
          adAccountIds: embeddedSignupData.ad_account_ids || [],
          pageIds: embeddedSignupData.page_ids || [],
          datasetIds: embeddedSignupData.dataset_ids || [],
        } : null,
      },
      metadata: {
        requestId: crypto.randomUUID(),
        apiVersion: "v1",
        processedAt: new Date().toISOString(),
      },
    };

    console.log("=== FINAL RESPONSE ===");
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.log("=== END CALLBACK ===\n");

    if (wantsJson) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
        },
      });
    }

    return new Response(buildPopupHtml(payload, clientOrigin), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Cache-Control": "no-cache, no-store",
      },
    });
  } catch (error) {
    console.error("Error in facebook-auth-callback:", error);
    
    // Get origin for error response
    const requestOrigin = req.headers.get("origin") || FRONTEND_URL;
    const errorAllowedOrigin = requestOrigin.includes('localhost') ? requestOrigin : FRONTEND_URL;
    
    const payload = {
      success: false,
      type: "FACEBOOK_AUTH_ERROR",
      error: "auth_error",
      message: error instanceof Error ? error.message : "Authentication failed",
    };

    return new Response(JSON.stringify(payload), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": errorAllowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }
});
