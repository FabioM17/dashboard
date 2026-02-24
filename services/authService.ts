
import { supabase } from './supabaseClient';
import { User, UserRole } from '../types';

export const authService = {
  // Login with Email/Password
  async signIn(email: string, pass: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) throw error;
    return data;
  },

  // Sign up with Email/Password
  async signUp(email: string, pass: string, metadata?: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    organizationName?: string;
    country?: string;
    whatsappNumber?: string;
    companySize?: string;
    platformUse?: string;
    industry?: string;
    botName?: string;
  }) {
    const redirectTo = 'https://dashboardchat.docreativelatam.com';
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        emailRedirectTo: redirectTo,
        data: metadata || {} // Store metadata in user_metadata
      }
    });
    if (error) throw error;

    // Llamar Edge Function para crear org/profile/metadata
    if (data.user) {
      try {
        console.log("📞 Calling create-org-admin Edge Function...");
        const { data: edgeFunctionResult, error: edgeFunctionError } = await supabase.functions.invoke('create-org-admin', {
          body: {
            userId: data.user.id,
            email: email,
            metadata: metadata || {}
          }
        });

        if (edgeFunctionError) {
          console.error("⚠️ Edge Function error:", edgeFunctionError);
          // No lanzamos error, solo log
        } else {
          console.log("✅ Organization, profile and metadata created:", edgeFunctionResult);
        }
      } catch (err) {
        console.error("⚠️ Error calling Edge Function:", err);
        // No lanzamos error, el usuario se creó en auth
      }
    }

    return data;
  },

  // Verify onboarding - checks if user is verified and returns their data
  async verifyOnboarding() {
    try {
      // Get current session to ensure we have the JWT token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("No session available. User may not be authenticated.");
      }

      console.log("🔵 Calling verify-onboarding to confirm email verification");
      
      // Invoke Edge Function to verify
      const { data, error } = await supabase.functions.invoke('create-org-admin', {
        body: {}, // No body needed, just verification
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      if (error) throw error;
      return data;
    } catch (err) {
      console.error("❌ verifyOnboarding error:", err);
      throw err;
    }
  },

  // Legacy method for backward compatibility - now just calls verifyOnboarding
  async completeOnboarding(payload?: any) {
    console.log("⚠️ completeOnboarding is deprecated. Use verifyOnboarding instead.");
    return this.verifyOnboarding();
  },

  // Logout
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Get Current Session User mapped to our App Type
  // Ahora acepta una 'session' opcional para evitar llamar a getSession() si ya la tenemos
  async getCurrentUser(existingSession?: any): Promise<User | null> {
    let session = existingSession;

    if (!session) {
        const { data } = await supabase.auth.getSession();
        session = data.session;
    }

    if (!session) return null;

    // Fetch profile details from the 'profiles' table we created in SQL
    // Usamos maybeSingle() en lugar de single() para evitar errores 406 si no existe fila
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) {
        console.warn("Error fetching profile, using fallback:", error.message);
    }

    // Fallback if profile doesn't exist yet
    const userRole = (profile?.role as UserRole) || 'community';

    const user: User = {
      id: session.user.id,
      organizationId: profile?.organization_id || '',
      name: profile?.full_name || session.user.email || 'User',
      email: session.user.email || '',
      avatar: profile?.avatar_url || `https://ui-avatars.com/api/?name=${session.user.email}`,
      role: userRole,
      team_lead_id: profile?.team_lead_id,
      assigned_lead_ids: profile?.assigned_lead_ids || []
    };

    return user;
  }
};
