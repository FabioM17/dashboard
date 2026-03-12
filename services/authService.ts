
import { supabase } from './supabaseClient';
import { User, UserRole, OrganizationMembership } from '../types';

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
    // scope:'local' clears the local session only, no server call → avoids 403.
    // The SIGNED_OUT event still fires so the app navigates away correctly.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
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

    // Fetch user's organization memberships
    let organizations: OrganizationMembership[] = [];
    try {
      const { data: memberships, error: memberError } = await supabase
        .from('organization_members')
        .select(`
          id,
          user_id,
          organization_id,
          role,
          is_default,
          created_at,
          organizations (name)
        `)
        .eq('user_id', session.user.id)
        .order('is_default', { ascending: false });

      console.log('🏢 organization_members query result:', { memberships, memberError });

      if (memberError) {
        console.warn('⚠️ Join query failed, trying separate queries:', memberError.message);
        // Fallback: fetch memberships without join, then fetch org names separately
        const { data: rawMembers } = await supabase
          .from('organization_members')
          .select('id, user_id, organization_id, role, is_default, created_at')
          .eq('user_id', session.user.id);

        console.log('🏢 Fallback raw members:', rawMembers);

        if (rawMembers && rawMembers.length > 0) {
          const orgIds = rawMembers.map((m: any) => m.organization_id);
          const { data: orgs } = await supabase
            .from('organizations')
            .select('id, name')
            .in('id', orgIds);

          const orgMap = new Map((orgs || []).map((o: any) => [o.id, o.name]));

          organizations = rawMembers.map((m: any) => ({
            id: m.id,
            userId: m.user_id,
            organizationId: m.organization_id,
            organizationName: orgMap.get(m.organization_id) || 'Sin nombre',
            role: m.role as UserRole,
            isDefault: m.is_default,
            createdAt: new Date(m.created_at),
          }));
        }
      } else {
        organizations = (memberships || []).map((m: any) => ({
          id: m.id,
          userId: m.user_id,
          organizationId: m.organization_id,
          organizationName: m.organizations?.name || 'Sin nombre',
          role: m.role as UserRole,
          isDefault: m.is_default,
          createdAt: new Date(m.created_at),
        }));
      }
    } catch (err) {
      console.warn('Could not fetch organization memberships:', err);
    }

    // If no memberships found but user has an org in profile, create a synthetic one
    if (organizations.length === 0 && profile?.organization_id) {
      console.log('🏢 No memberships found, creating synthetic from profile org');
      let orgName = 'Mi Organización';
      let roleFromMembership: UserRole = 'community';
      try {
        // Fetch org name
        const { data: orgData } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', profile.organization_id)
          .maybeSingle();
        if (orgData?.name) orgName = orgData.name;

        // Fetch role from organization_members (NOT from deleted profile.role column)
        const { data: memberData } = await supabase
          .from('organization_members')
          .select('role')
          .eq('user_id', session.user.id)
          .eq('organization_id', profile.organization_id)
          .maybeSingle();
        if (memberData?.role) roleFromMembership = memberData.role as UserRole;
      } catch (_) {}
      organizations = [{
        id: 'synthetic',
        userId: session.user.id,
        organizationId: profile.organization_id,
        organizationName: orgName,
        role: roleFromMembership,
        isDefault: true,
        createdAt: new Date(),
      }];
    }

    console.log('🏢 Final organizations for user:', organizations.length, organizations.map((o: any) => o.organizationName));

    // Get active org membership for team context
    const activeOrgId = profile?.organization_id;
    let activeOrgMembership: any = null;
    
    if (activeOrgId && organizations.length > 0) {
      activeOrgMembership = organizations.find((o: any) => o.organizationId === activeOrgId);
    }

    // Fallback if profile doesn't exist yet
    const userRole = (activeOrgMembership?.role as UserRole) || 'community';
    
    // Get team_lead_id and assigned_lead_ids from organization_members for active org
    let teamLeadId: string | undefined = undefined;
    let assignedLeadIds: string[] = [];
    
    if (activeOrgId && session.user.id) {
      try {
        const { data: membership } = await supabase
          .from('organization_members')
          .select('team_lead_id, assigned_lead_ids')
          .eq('user_id', session.user.id)
          .eq('organization_id', activeOrgId)
          .maybeSingle();
        
        if (membership) {
          teamLeadId = membership.team_lead_id;
          assignedLeadIds = membership.assigned_lead_ids || [];
        }
      } catch (err) {
        console.warn('Could not fetch team context from organization_members:', err);
      }
    }

    const user: User = {
      id: session.user.id,
      organizationId: profile?.organization_id || '',
      name: profile?.full_name || session.user.email || 'User',
      email: session.user.email || '',
      avatar: profile?.avatar_url || `https://ui-avatars.com/api/?name=${session.user.email}`,
      role: userRole,
      team_lead_id: teamLeadId,
      assigned_lead_ids: assignedLeadIds,
      organizations,
    };

    return user;
  }
};
