
import { supabase } from './supabaseClient';
import { User, UserRole, LeadAssignment } from '../types';

export const teamService = {
  
  // 1. Obtener miembros del equipo (desde organization_members con datos de profiles)
  async getTeamMembers(organizationId: string): Promise<User[]> {
    // organization_members.user_id → auth.users (not profiles), so PostgREST can't join directly.
    // Do two separate queries instead.
    const { data: members, error } = await supabase
      .from('organization_members')
      .select('id, user_id, role, team_lead_id, assigned_lead_ids, is_default')
      .eq('organization_id', organizationId);

    if (error) {
      console.error("Error fetching team from organization_members:", error);
      return [];
    }

    if (!members || members.length === 0) return [];

    // Fetch profiles for all member user_ids
    const userIds = members.map((m: any) => m.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, phone')
      .in('id', userIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    const result = members.map((m: any) => {
      const profile = profileMap.get(m.user_id);
      return {
        id: profile?.id || m.user_id,
        organizationId: organizationId,
        name: profile?.full_name || profile?.email?.split('@')[0] || 'Unknown',
        email: profile?.email || 'No Email',
        avatar: profile?.avatar_url || `https://ui-avatars.com/api/?name=${profile?.full_name || m.user_id}`,
        role: (m.role as UserRole) || 'community',
        team_lead_id: m.team_lead_id,
        assigned_lead_ids: m.assigned_lead_ids || [],
        phone: profile?.phone || undefined,
        verified: false,
        lastSignInAt: null,
        organizations: []
      };
    });

    return result.sort((a, b) => a.name.localeCompare(b.name));
  },

  // 2. Actualizar el rol de un usuario (en organization_members)
  async updateMemberRole(userId: string, newRole: UserRole, organizationId: string) {
    const { error } = await supabase
      .from('organization_members')
      .update({ role: newRole })
      .eq('user_id', userId)
      .eq('organization_id', organizationId);

    if (error) throw error;
  },

  // 3. Eliminar miembro de la organización
  async removeMember(userId: string, organizationId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.id === userId) {
      throw new Error("You cannot remove yourself via the team management interface.");
    }

    // Usar la función RPC delete_team_member_data que maneja multi-org correctamente
    const { data, error } = await supabase
      .rpc('delete_team_member_data', {
        requesting_user_id: user?.id,
        target_user_id: userId,
        target_org_id: organizationId
      });

    if (error) throw error;
    return data;
  },

  // 4. Invitar miembro (REAL)
  // Llama a la Edge Function que tiene permisos de Admin para enviar emails
  async inviteMember(email: string, name: string, role: UserRole, organizationId: string, phone?: string) {
    const redirectTo = 'https://dashboardchat.docreativelatam.com';

    const body: any = {
        email,
        name,
        role,
      organization_id: organizationId
    };

    body.redirect_to = redirectTo;

    // Agregar teléfono si se proporciona
    if (phone && phone.trim()) {
        body.phone = phone.trim();
    }

    const { data, error } = await supabase.functions.invoke('invite-user', {
        body
    });

    if (error) {
        console.error("Invite Error:", error);
        throw new Error(error.message || "Failed to invite user via server.");
    }

    return data;
  },

  // 5. Update member phone
  async updateMemberPhone(userId: string, phone?: string) {
    const { error } = await supabase
      .from('profiles')
      .update({ phone: phone || null })
      .eq('id', userId);

    if (error) throw error;
  },

  // === LEAD ASSIGNMENT (Manager → Community) ===

  // 6. Obtener asignaciones de leads para la organización
  async getLeadAssignments(organizationId: string): Promise<LeadAssignment[]> {
    const { data, error } = await supabase
      .from('user_assigned_leads')
      .select('*')
      .eq('organization_id', organizationId);
    
    if (error) {
      console.error('Error fetching lead assignments:', error);
      return [];
    }

    return (data || []).map((a: any) => ({
      id: a.id,
      userId: a.user_id,
      contactId: a.contact_id,
      assignedAt: new Date(a.assigned_at),
      assignedBy: a.assigned_by,
      organizationId: a.organization_id
    }));
  },

  // 7. Asignar un lead/contacto a un community user
  async assignLeadToUser(userId: string, contactId: string, assignedBy: string, organizationId: string): Promise<void> {
    // Verificar que no exista ya la asignación
    const { data: existing } = await supabase
      .from('user_assigned_leads')
      .select('id')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    
    if (existing) {
      console.log('Lead already assigned to this user');
      return;
    }

    const { error } = await supabase
      .from('user_assigned_leads')
      .insert({
        user_id: userId,
        contact_id: contactId,
        assigned_by: assignedBy,
        organization_id: organizationId
      });

    if (error) throw error;
  },

  // 8. Desasignar un lead de un community user
  async unassignLeadFromUser(userId: string, contactId: string, organizationId: string): Promise<void> {
    const { error } = await supabase
      .from('user_assigned_leads')
      .delete()
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .eq('organization_id', organizationId);

    if (error) throw error;
  },

  // 9. Asignar múltiples leads a un usuario (bulk)
  async assignMultipleLeadsToUser(userId: string, contactIds: string[], assignedBy: string, organizationId: string): Promise<void> {
    // Obtener asignaciones existentes para no duplicar
    const { data: existing } = await supabase
      .from('user_assigned_leads')
      .select('contact_id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId);
    
    const existingIds = new Set((existing || []).map((e: any) => e.contact_id));
    const newIds = contactIds.filter(id => !existingIds.has(id));

    if (newIds.length === 0) return;

    const rows = newIds.map(contactId => ({
      user_id: userId,
      contact_id: contactId,
      assigned_by: assignedBy,
      organization_id: organizationId
    }));

    const { error } = await supabase
      .from('user_assigned_leads')
      .insert(rows);

    if (error) throw error;
  },

  // 10. Asignar conversación a un agente
  async assignConversation(conversationId: string, agentId: string | null): Promise<void> {
    const { error } = await supabase
      .from('conversations')
      .update({ assigned_to: agentId })
      .eq('id', conversationId);

    if (error) throw error;
  },

  // 11. Asignar múltiples conversaciones a un agente (bulk)
  async assignMultipleConversations(conversationIds: string[], agentId: string | null): Promise<void> {
    const { error } = await supabase
      .from('conversations')
      .update({ assigned_to: agentId })
      .in('id', conversationIds);

    if (error) throw error;
  },

  // 12. Obtener leads asignados a un usuario específico
  async getAssignedLeadsForUser(userId: string, organizationId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('user_assigned_leads')
      .select('contact_id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId);
    
    if (error) {
      console.error('Error fetching assigned leads:', error);
      return [];
    }

    return (data || []).map((a: any) => a.contact_id);
  },

  // 13. Buscar usuarios existentes por email parcial (excluyendo miembros actuales de la org)
  async searchUsersByEmail(
    emailQuery: string,
    organizationId: string
  ): Promise<{ userId: string; email: string; fullName: string | null; avatarUrl: string | null }[]> {
    if (!emailQuery || emailQuery.trim().length < 2) return [];

    const { data, error } = await supabase
      .rpc('search_users_by_email', {
        p_email_query: emailQuery.trim(),
        p_organization_id: organizationId
      });

    if (error) {
      console.error('Error searching users:', error);
      throw new Error(error.message);
    }

    return (data || []).map((u: any) => ({
      userId: u.user_id,
      email: u.email,
      fullName: u.full_name,
      avatarUrl: u.avatar_url,
    }));
  },

  // 14. Agregar un usuario existente (registrado) a la organización
  async addExistingMember(
    targetUserId: string,
    organizationId: string,
    role: UserRole
  ): Promise<void> {
    const { error } = await supabase
      .rpc('add_existing_member_to_org', {
        p_target_user_id: targetUserId,
        p_organization_id: organizationId,
        p_role: role
      });

    if (error) {
      console.error('Error adding existing member:', error);
      throw new Error(error.message);
    }
  },
};
