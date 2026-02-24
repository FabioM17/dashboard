
import { supabase } from './supabaseClient';
import { User, UserRole, LeadAssignment } from '../types';

export const teamService = {
  
  // 1. Obtener miembros del equipo (perfiles asociados a la organización)
  async getTeamMembers(organizationId: string): Promise<User[]> {
    // Query a profiles table - Supabase RLS requiere columnas de auth.users
    // Usamos una vista o función que tenga acceso a last_sign_in_at
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, role, phone, last_sign_in_at, organization_id')
      .eq('organization_id', organizationId)
      .order('full_name', { ascending: true });

    if (error) {
      // Si la columna last_sign_in_at no existe en la view, fallback
      console.warn("Note: last_sign_in_at not available in query, using alternative method");
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .order('full_name', { ascending: true });

      if (profilesError) {
        console.error("Error fetching team:", profilesError);
        return [];
      }

      return profilesData.map((p: any) => ({
        id: p.id,
        organizationId: p.organization_id,
        name: p.full_name || p.email?.split('@')[0] || 'Unknown',
        email: p.email || 'No Email',
        avatar: p.avatar_url || `https://ui-avatars.com/api/?name=${p.full_name}`,
        role: (p.role as UserRole) || 'community',
        phone: p.phone || p.phone_number || undefined,
        verified: false,
        lastSignInAt: null
      }));
    }

    return data.map((p: any) => ({
      id: p.id,
      organizationId: p.organization_id,
      name: p.full_name || p.email?.split('@')[0] || 'Unknown',
      email: p.email || 'No Email',
      avatar: p.avatar_url || `https://ui-avatars.com/api/?name=${p.full_name}`,
      role: (p.role as UserRole) || 'community',
      phone: p.phone || p.phone_number || undefined,
      verified: !!p.last_sign_in_at,  // ✅ Verified si last_sign_in_at existe (ya ingresó)
      lastSignInAt: p.last_sign_in_at || null // ✅ Guardar fecha de último login
    }));
  },

  // 2. Actualizar el rol de un usuario
  async updateMemberRole(userId: string, newRole: UserRole) {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) throw error;
  },

  // 3. Eliminar miembro
  async removeMember(userId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.id === userId) {
        throw new Error("You cannot remove yourself via the team management interface.");
    }

    // En un entorno real, también deberíamos llamar a una Edge Function para borrarlo de auth.users
    // Por ahora, borramos el acceso al perfil
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) throw error;
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
  }
};
