import { supabase } from './supabaseClient';

interface FacebookAuthData {
  accessToken: string;
  expiresIn: number;
  facebookUserId: string;
  wabaId: string | null;
  userName: string;
  userEmail: string;
}

interface FacebookAuthResponse {
  success: boolean;
  data?: FacebookAuthData;
  error?: string;
  message?: string;
}

const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID || '';
const WHATSAPP_CONFIG_ID = import.meta.env.VITE_WHATSAPP_CONFIG_ID || '';
const WHATSAPP_ONBOARDING_URL = import.meta.env.VITE_WHATSAPP_ONBOARDING_URL || '';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const REDIRECT_URI = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/facebook-auth-callback`;

const DEFAULT_ONBOARDING_EXTRAS = {
  sessionInfoVersion: '3',
  version: 'v3',
};

const buildOnboardingUrl = (organizationId: string): string => {
  const state = JSON.stringify({
    organization_id: organizationId,
    origin: window.location.origin,
  });

  // Use direct OAuth URL if provided
  if (WHATSAPP_ONBOARDING_URL && WHATSAPP_ONBOARDING_URL.includes('facebook.com/v') && WHATSAPP_ONBOARDING_URL.includes('dialog/oauth')) {
    const url = new URL(WHATSAPP_ONBOARDING_URL);
    url.searchParams.set('state', encodeURIComponent(state));
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    return url.toString();
  }

  if (!FACEBOOK_APP_ID || !WHATSAPP_CONFIG_ID) {
    throw new Error('Missing WhatsApp onboarding configuration.');
  }

  // Fallback: use direct OAuth dialog
  const url = new URL('https://www.facebook.com/v24.0/dialog/oauth');
  url.searchParams.set('client_id', FACEBOOK_APP_ID);
  url.searchParams.set('config_id', WHATSAPP_CONFIG_ID);
  url.searchParams.set('extras', JSON.stringify(DEFAULT_ONBOARDING_EXTRAS));
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('override_default_response_type', 'true');
  url.searchParams.set('state', encodeURIComponent(state));
  url.searchParams.set('display', 'popup');
  return url.toString();
};

class FacebookAuthService {
  /**
   * Initiate Facebook OAuth flow with embedded signup
   * Opens popup with embedded WhatsApp signup
   */
  initiateOAuthFlow(organizationId: string): void {
    if (!FACEBOOK_APP_ID || !WHATSAPP_CONFIG_ID) {
      console.error('Missing Facebook or WhatsApp configuration');
      alert('WhatsApp configuration is missing. Please contact the administrator.');
      return;
    }

    const signupPageUrl = `${window.location.origin}/facebook-embedded-signup.html?app_id=${FACEBOOK_APP_ID}&config_id=${WHATSAPP_CONFIG_ID}&organization_id=${organizationId}`;

    console.log('[FacebookAuthService] Opening embedded signup popup');

    const popup = window.open(
      signupPageUrl,
      'facebook-whatsapp-signup',
      'width=600,height=700,menubar=0,toolbar=0,scrollbars=1'
    );

    if (!popup) {
      alert('Popup blocked. Please allow popups for this site.');
      return;
    }

    const self = this;
    let cleanupDone = false;

    const cleanup = () => {
      if (cleanupDone) return;
      cleanupDone = true;
      window.removeEventListener('message', handleMessage);
      clearInterval(timeoutCheck);
      console.log('[FacebookAuthService] Event listeners cleaned up');
    };

    const handleMessage = (event: MessageEvent) => {
      console.log('[FacebookAuthService] Message received from:', event.origin);
      const payload = event.data || {};
      console.log('[FacebookAuthService] Message type:', payload.type);

      // Handle auth code (for backend exchange)
      if (payload.type === 'FACEBOOK_AUTH_CODE_RECEIVED') {
        console.log('[FacebookAuthService] 📨 Auth code received from popup');
        const code = payload.code;
        const orgId = payload.organizationId || organizationId;
        
        self.exchangeAuthCode(code, orgId);
        cleanup();
        return;
      }

      // Handle embedded signup finished (direct from Meta)
      if (payload.type === 'WA_EMBEDDED_SIGNUP_FINISHED') {
        console.log('[FacebookAuthService] ✅ Embedded signup FINISHED');
        const wabaData = payload.data || {};
        console.log('[FacebookAuthService] WABA data:', wabaData);
        
        // Send to backend to exchange code (if we have one)
        // For now, we'll just dispatch success with whatever Meta gave us
        window.dispatchEvent(
          new CustomEvent('facebookAuthSuccess', {
            detail: {
              wabaId: wabaData.waba_id || null,
              phoneNumberId: wabaData.phone_number_id || null,
              businessId: wabaData.business_id || null,
              fromEmbeddedSignup: true,
            },
          })
        );
        
        cleanup();
        setTimeout(() => {
          if (!popup.closed) popup.close();
        }, 500);
        return;
      }

      // Handle embedded signup cancelled
      if (payload.type === 'WA_EMBEDDED_SIGNUP_CANCELLED') {
        console.log('[FacebookAuthService] ⚠️ Embedded signup CANCELLED');
        cleanup();
        if (!popup.closed) popup.close();
        return;
      }

      // Handle embedded signup error
      if (payload.type === 'WA_EMBEDDED_SIGNUP_ERROR') {
        console.error('[FacebookAuthService] ❌ Embedded signup ERROR:', payload.data);
        alert(`WhatsApp signup failed: ${payload.data?.error_message || 'Unknown error'}`);
        cleanup();
        if (!popup.closed) popup.close();
        return;
      }
    };

    window.addEventListener('message', handleMessage);

    // Timeout check (5 minutes)
    const timeoutCheck = setInterval(() => {
      if (popup.closed) {
        console.log('[FacebookAuthService] Popup closed by user');
        cleanup();
        clearInterval(timeoutCheck);
      }
    }, 1000);

    console.log('[FacebookAuthService] Listening for messages from popup...');
  }

  /**
   * Exchange authorization code for access token
   * This is called from the main window to avoid CORS issues
   */
  async exchangeAuthCode(code: string, organizationId: string): Promise<void> {
    try {
      console.log('[FacebookAuthService] Exchanging auth code for token');
      
      const callbackUrl = `${window.location.origin}/functions/v1/facebook-auth-callback`;
      const state = JSON.stringify({
        org_id: organizationId,
        origin: window.location.origin
      });
      
      const url = `${callbackUrl}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}&format=json`;
      
      console.log('[FacebookAuthService] Calling backend exchange endpoint');
      
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[FacebookAuthService] Backend response received:', data);
      
      if (data.success && data.data) {
        console.log('[FacebookAuthService] ✅ Token exchange successful');
        
        window.dispatchEvent(
          new CustomEvent('facebookAuthSuccess', {
            detail: data.data,
          })
        );
      } else {
        console.error('[FacebookAuthService] ❌ Exchange failed:', data.message);
        alert(`Authentication failed: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('[FacebookAuthService] ❌ Exchange error:', error);
      alert(`Exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle the OAuth callback in a redirect scenario
   * Call this in a callback page: /auth/facebook/callback
   */
  async handleOAuthCallback(organizationId: string): Promise<FacebookAuthResponse> {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      if (error) {
        return {
          success: false,
          error: error,
          message: errorDescription || 'OAuth error',
        };
      }

      if (!code) {
        return {
          success: false,
          error: 'missing_code',
          message: 'No authorization code received',
        };
      }

      // Exchange code for token via Edge Function
      const callbackResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/facebook-auth-callback?code=${encodeURIComponent(code)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!callbackResponse.ok) {
        const errorData = await callbackResponse.json();
        return {
          success: false,
          error: errorData.error || 'token_exchange_failed',
          message: errorData.message || 'Failed to exchange code for token',
        };
      }

      const result: FacebookAuthResponse = await callbackResponse.json();

      if (result.success && result.data) {
        // Save to database
        const saveResult = await this.saveAuthData(result.data, organizationId);
        return saveResult;
      }

      return result;
    } catch (error) {
      console.error('Error in handleOAuthCallback:', error);
      return {
        success: false,
        error: 'unknown_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Save Facebook auth data to integration_settings
   */
  async saveAuthData(
    authData: FacebookAuthData,
    organizationId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const expiresAt = new Date(
        Date.now() + authData.expiresIn * 1000
      ).toISOString();

      const credentials = {
        facebook_access_token: authData.accessToken,
        facebook_user_id: authData.facebookUserId,
        facebook_expires_at: expiresAt,
        waba_id: authData.wabaId,
        user_name: authData.userName,
        user_email: authData.userEmail,
      };

      const { error } = await supabase
        .from('integration_settings')
        .upsert(
          {
            service_name: 'facebook',
            organization_id: organizationId,
            credentials: credentials,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'organization_id,service_name',
          }
        );

      if (error) {
        console.error('Error saving to integration_settings:', error);
        return {
          success: false,
          error: error.message || 'Failed to save auth data',
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Error in saveAuthData:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Retrieve stored Facebook auth from integration_settings
   */
  async getAuthData(organizationId: string) {
    try {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('credentials')
        .eq('service_name', 'facebook')
        .eq('organization_id', organizationId)
        .single()
        .returns<{ credentials: any }>();

      if (error) {
        if (error.code === 'PGRST116') {
          // No row found - not an error
          return null;
        }
        throw error;
      }

      return data?.credentials || null;
    } catch (error) {
      console.error('Error fetching auth data:', error);
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(authData: any): boolean {
    if (!authData?.facebook_expires_at) return true;
    return new Date(authData.facebook_expires_at) < new Date();
  }

  /**
   * Disconnect Facebook
   */
  async disconnect(organizationId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('integration_settings')
        .delete()
        .eq('service_name', 'facebook')
        .eq('organization_id', organizationId);

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Error disconnecting Facebook:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const facebookAuthService = new FacebookAuthService();
