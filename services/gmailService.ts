import { supabase } from './supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://gfavwcnokzypvazyoqod.supabase.co';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const REDIRECT_URI = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/google-auth-callback`;

const STORAGE_KEY = 'google_auth_result';

/**
 * Gmail Integration Service
 * 
 * Uses direct Google OAuth2 flow:
 *   1. Open popup → Google consent screen
 *   2. Callback Edge Function exchanges code, saves tokens, 302 redirects to frontend
 *   3. Frontend (in the popup) detects ?google_auth= params, writes to localStorage
 *   4. Parent window detects the storage change and resolves
 */
export const gmailService = {

  STORAGE_KEY,

  /**
   * Initiate Google OAuth via popup.
   * Resolves when the popup writes the result to localStorage.
   */
  connectGmail(organizationId: string): Promise<{ success: boolean; email?: string; error?: string }> {
    return new Promise((resolve) => {
      if (!GOOGLE_CLIENT_ID) {
        resolve({ success: false, error: 'VITE_GOOGLE_CLIENT_ID no está configurado' });
        return;
      }

      // Clear any stale result
      localStorage.removeItem(STORAGE_KEY);

      const state = JSON.stringify({
        organization_id: organizationId,
        origin: window.location.origin,
      });

      const scopes = [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' ');

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scopes);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', state);

      console.log('[gmailService] Opening Google OAuth popup');

      const popup = window.open(
        authUrl.toString(),
        'google-gmail-auth',
        'width=500,height=650,menubar=0,toolbar=0,scrollbars=1'
      );

      if (!popup) {
        resolve({ success: false, error: 'Popup bloqueado. Permite popups para este sitio.' });
        return;
      }

      let done = false;

      const finish = (result: { success: boolean; email?: string; error?: string }) => {
        if (done) return;
        done = true;
        window.removeEventListener('storage', onStorage);
        clearInterval(pollTimer);
        localStorage.removeItem(STORAGE_KEY);
        resolve(result);
      };

      const processResult = (raw: string) => {
        try {
          const r = JSON.parse(raw);
          if (r.status === 'success') {
            console.log('[gmailService] ✅ Auth success:', r.email);
            finish({ success: true, email: r.email || '' });
          } else {
            console.error('[gmailService] ❌ Auth error:', r.message);
            finish({ success: false, error: r.message || 'Error en autenticación' });
          }
        } catch {
          finish({ success: false, error: 'Respuesta inválida del popup' });
        }
      };

      // Listen for storage events (fires when another tab/popup writes to localStorage)
      const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          processResult(e.newValue);
        }
      };
      window.addEventListener('storage', onStorage);

      // Also poll localStorage directly (storage event doesn't fire in same tab in some browsers)
      const pollTimer = setInterval(() => {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) processResult(raw);
      }, 800);
    });
  },

  /**
   * Get the current Gmail configuration for the organization
   */
  async getGmailConfig(organizationId: string): Promise<{
    gmail_address: string;
    access_token: string;
    refresh_token: string | null;
    connected_at: string;
  } | null> {
    if (!organizationId) return null;

    const { data, error } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('service_name', 'gmail')
      .single();

    if (error || !data?.credentials) return null;
    return data.credentials;
  },

  /**
   * Disconnect Gmail — remove tokens from integration_settings
   */
  async disconnectGmail(organizationId: string): Promise<void> {
    const { error } = await supabase
      .from('integration_settings')
      .delete()
      .eq('organization_id', organizationId)
      .eq('service_name', 'gmail');

    if (error) throw error;
    console.log('[gmailService] ✅ Gmail disconnected');
  },

  /**
   * Send an email via the gmail-send Edge Function.
   */
  async sendEmail(
    organizationId: string,
    to: string,
    subject: string,
    body: string,
    isHtml: boolean = false
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('gmail-send', {
        body: {
          organization_id: organizationId,
          to,
          subject,
          body,
          is_html: isHtml
        }
      });

      if (error) throw error;
      if (data?.error) return { success: false, error: data.error };

      return { success: true, messageId: data?.message_id };
    } catch (err: any) {
      console.error('[gmailService] sendEmail error:', err);
      return { success: false, error: String(err) };
    }
  }
};
