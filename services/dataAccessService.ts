/**
 * dataAccessService.ts
 * 
 * Controla el acceso a datos basándose en roles
 * Asegura que cada rol solo vea sus datos permitidos
 */

import { User } from '../types';
import { supabase } from './supabaseClient';

export const dataAccessService = {
  /**
   * CONVERSACIONES - Filtrar según rol
   */

  // Obtener conversaciones según permisos del usuario
  async getConversationsForUser(user: User) {
    if (user.role === 'admin') {
      // Admin ve todas las conversaciones de su organización
      return supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', user.organizationId)
        .order('updated_at', { ascending: false });
    }

    if (user.role === 'manager') {
      // Manager ve conversaciones de su equipo
      // Necesitas una tabla intermedia: conversations_assigned_to_team
      return supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', user.organizationId)
        .eq('team_lead_id', user.id)
        .order('updated_at', { ascending: false });
    }

    if (user.role === 'community') {
      // Community ve solo sus leads asignados
      // Necesitas una tabla: user_assigned_leads
      return supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', user.organizationId)
        .in('lead_id', user.assigned_lead_ids || [])
        .order('updated_at', { ascending: false });
    }

    return { data: [], error: 'Invalid role' };
  },

  /**
   * CONTACTOS CRM - Filtrar según rol
   */

  async getContactsForUser(user: User) {
    if (user.role === 'admin') {
      // Admin ve todos los contactos
      return supabase
        .from('crm_contacts')
        .select('*')
        .eq('organization_id', user.organizationId);
    }

    if (user.role === 'manager') {
      // Manager ve contactos de su equipo
      return supabase
        .from('crm_contacts')
        .select('*')
        .eq('organization_id', user.organizationId)
        .eq('team_lead_id', user.id);
    }

    if (user.role === 'community') {
      // Community ve solo sus leads asignados
      return supabase
        .from('crm_contacts')
        .select('*')
        .eq('organization_id', user.organizationId)
        .in('id', user.assigned_lead_ids || []);
    }

    return { data: [], error: 'Invalid role' };
  },

  /**
   * MENSAJES - Filtrar según rol
   */

  async getMessagesForUser(user: User, conversationId: string) {
    // Primero validar que puede ver esta conversación
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('organization_id', user.organizationId)
      .single();

    if (convError || !conversation) {
      return { data: [], error: 'Conversation not accessible' };
    }

    // Validar acceso según rol
    if (user.role === 'admin') {
      // Admin ve todos los mensajes
      return supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });
    }

    if (user.role === 'manager') {
      // Manager ve si la conversación está asignada a su equipo
      if (conversation.team_lead_id !== user.id) {
        return { data: [], error: 'Not authorized' };
      }
      return supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });
    }

    if (user.role === 'community') {
      // Community ve si el lead está asignado
      if (!user.assigned_lead_ids?.includes(conversation.contact_phone)) {
        return { data: [], error: 'Lead not assigned' };
      }
      return supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });
    }

    return { data: [], error: 'Invalid role' };
  },

  /**
   * USUARIOS DEL EQUIPO - Filtrar según rol
   */

  async getTeamMembersForUser(user: User) {
    if (user.role === 'admin') {
      // Admin ve todos los miembros de su organización
      return supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', user.organizationId);
    }

    if (user.role === 'manager') {
      // Manager ve solo su equipo
      return supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', user.organizationId)
        .eq('team_lead_id', user.id);
    }

    if (user.role === 'community') {
      // Community no ve equipo
      return { data: [], error: 'Not authorized' };
    }

    return { data: [], error: 'Invalid role' };
  },

  /**
   * TAREAS - Filtrar según rol
   */

  async getTasksForUser(user: User) {
    if (user.role === 'admin') {
      // Admin ve todas las tareas
      return supabase
        .from('tasks')
        .select('*')
        .eq('organization_id', user.organizationId);
    }

    if (user.role === 'manager') {
      // Manager ve tareas de su equipo
      return supabase
        .from('tasks')
        .select('*')
        .eq('organization_id', user.organizationId)
        .eq('assigned_to_team_lead', user.id);
    }

    if (user.role === 'community') {
      // Community no gestiona tareas
      return { data: [], error: 'Not authorized' };
    }

    return { data: [], error: 'Invalid role' };
  },

  /**
   * ESTADÍSTICAS - Filtrar según rol
   */

  async getStatisticsForUser(user: User) {
    if (user.role === 'admin') {
      // Admin ve estadísticas globales
      return {
        scope: 'organization',
        organizationId: user.organizationId
      };
    }

    if (user.role === 'manager') {
      // Manager ve estadísticas de su equipo
      return {
        scope: 'team',
        teamLeadId: user.id,
        organizationId: user.organizationId
      };
    }

    if (user.role === 'community') {
      // Community no accede a estadísticas
      return { error: 'Not authorized' };
    }
  },

  /**
   * Validador genérico de acceso a recurso
   */

  async canAccessResource(
    user: User,
    resourceType: string,
    resourceId: string,
    resourceOrgId: string
  ): Promise<boolean> {
    // Validar organización primero
    if (user.organizationId !== resourceOrgId) {
      return false;
    }

    // Admin siempre puede acceder
    if (user.role === 'admin') {
      return true;
    }

    // Manager puede acceder si el recurso está en su ámbito
    if (user.role === 'manager') {
      // Lógica específica según tipo de recurso
      switch (resourceType) {
        case 'conversation':
          const { data: conv } = await supabase
            .from('conversations')
            .select('team_lead_id')
            .eq('id', resourceId)
            .single();
          return conv?.team_lead_id === user.id;

        case 'contact':
          const { data: contact } = await supabase
            .from('crm_contacts')
            .select('team_lead_id')
            .eq('id', resourceId)
            .single();
          return contact?.team_lead_id === user.id;

        default:
          return false;
      }
    }

    // Community solo accede a leads asignados
    if (user.role === 'community') {
      return user.assigned_lead_ids?.includes(resourceId) || false;
    }

    return false;
  }
};
