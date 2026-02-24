import { supabase } from './supabaseClient';

/**
 * Procesa el token de invitación/verificación desde la URL
 * Supabase no procesa automáticamente los tokens en el hash,
 * así que necesitamos hacerlo manualmente
 */
export const tokenProcessingService = {
  /**
   * Flag to mark that we're in invitation flow
   * Persists in sessionStorage so it survives URL cleanup
   */
  INVITATION_FLOW_FLAG: 'isInvitationFlow',
  VERIFICATION_TYPE_FLAG: 'verificationType', // 'invite' or 'signup'

  /**
   * Mark that user came from invitation flow
   */
  markAsInvitationFlow(type: 'invite' | 'signup' = 'invite'): void {
    sessionStorage.setItem(this.INVITATION_FLOW_FLAG, 'true');
    sessionStorage.setItem(this.VERIFICATION_TYPE_FLAG, type);
    console.log(`🚩 Marked as ${type} flow in sessionStorage`);
  },

  /**
   * Clear the invitation flow flag
   */
  clearInvitationFlow(): void {
    sessionStorage.removeItem(this.INVITATION_FLOW_FLAG);
    sessionStorage.removeItem(this.VERIFICATION_TYPE_FLAG);
    console.log("🧹 Cleared invitation flow flags");
  },

  /**
   * Get verification type (invite or signup)
   */
  getVerificationType(): 'invite' | 'signup' | null {
    const type = sessionStorage.getItem(this.VERIFICATION_TYPE_FLAG);
    return type as 'invite' | 'signup' | null;
  },

  /**
   * Extrae y procesa el token de la URL
   * Convierte ?token_hash=XXX en el hash (#) para que Supabase lo procese
   */
  async processInvitationToken(): Promise<boolean> {
    console.log("🔍 Checking for invitation token in URL...");
    
    // Check if we already have a processed token in hash
    const hash = window.location.hash;
    if (hash.includes('access_token') || hash.includes('token_hash')) {
      console.log("✅ Token already in hash:", hash.substring(0, 50) + "...");
      
      // Extract type from hash params
      const hashParams = new URLSearchParams(hash.substring(1));
      const typeInHash = hashParams.get('type');
      
      if (typeInHash) {
        const verificationType: 'invite' | 'signup' = typeInHash === 'signup' ? 'signup' : 'invite';
        console.log(`🏷️ Detected ${verificationType} type in hash`);
        this.markAsInvitationFlow(verificationType);
      } else {
        // Si no hay type en hash, asumimos signup (es el caso más común)
        // Ya que Supabase envía tokens para signup/email confirmation
        console.log("⚠️ No type in hash, assuming SIGNUP flow (email confirmation)");
        this.markAsInvitationFlow('signup');
      }
      
      return true;
    }

    // Check if token is in query params (from email redirect)
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');

    if (tokenHash) {
      console.log("📧 Found token in query params, type:", type);
      
      // Determinar si es signup o invite
      const verificationType: 'invite' | 'signup' = type === 'signup' ? 'signup' : 'invite';
      
      // Mark as invitation flow BEFORE processing token
      // This flag persists after URL cleanup
      this.markAsInvitationFlow(verificationType);

      // Wait for Supabase to process it
      // The verifyOtp function verifies email tokens
      try {
        console.log(`🔐 Verifying ${verificationType} token with Supabase...`);
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change') || 'invite',
        });

        if (error) {
          console.error("❌ Token verification failed:", error);
          this.clearInvitationFlow();
          return false;
        }

        console.log("✅ Token verified successfully, user:", data.user?.email);
        
        // Clean up URL - remove query params and replace with hash for SPA routing
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        console.log("🧹 URL cleaned, but invitation flow flag persists");
        
        return true;
      } catch (err) {
        console.error("❌ Error processing token:", err);
        this.clearInvitationFlow();
        return false;
      }
    }

    console.log("⚠️ No invitation token found in URL");
    return false;
  },

  /**
   * Detects if user came from invitation link
   * Uses both URL params AND sessionStorage flag for persistence
   */
  isInvitationFlow(): boolean {
    // Check sessionStorage flag (set during token processing)
    const flagFromStorage = sessionStorage.getItem(this.INVITATION_FLOW_FLAG) === 'true';
    
    // Also check URL params as fallback
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    
    const hasTokenInHash = hash.includes('token_hash');
    const hasTokenInQuery = params.has('token_hash');
    const isInviteType = params.get('type') === 'invite' || params.get('type') === 'signup';
    
    const result = flagFromStorage || hasTokenInHash || (hasTokenInQuery && isInviteType);
    console.log("🔗 isInvitationFlow:", { flagFromStorage, hasTokenInHash, hasTokenInQuery, isInviteType, result });
    return result;
  }
};
