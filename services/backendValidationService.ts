/**
 * backendValidationService.ts
 * 
 * Servicio para hacer llamadas a Edge Functions que validan permisos en backend
 * Esto es crítico para seguridad - validar en frontend + backend
 */

import { supabase } from './supabaseClient';
import { User } from '../types';

export const backendValidationService = {
  /**
   * Validar que usuario puede eliminar otro usuario
   * Se ejecuta en backend para seguridad
   */
  async validateCanDeleteUser(
    currentUserId: string,
    targetUserId: string,
    organizationId: string
  ): Promise<boolean> {
    try {
      // Llamar Edge Function que valida en backend
      const { data, error } = await supabase.functions.invoke('validate-user-deletion', {
        body: {
          currentUserId,
          targetUserId,
          organizationId
        }
      });

      if (error) {
        console.error('Backend validation error:', error);
        return false;
      }

      return data?.authorized === true;
    } catch (err) {
      console.error('Exception in validateCanDeleteUser:', err);
      return false;
    }
  },

  /**
   * Validar que usuario puede cambiar rol a otro usuario
   */
  async validateCanChangeRole(
    currentUserId: string,
    targetUserId: string,
    newRole: string,
    organizationId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('validate-role-change', {
        body: {
          currentUserId,
          targetUserId,
          newRole,
          organizationId
        }
      });

      if (error) return false;
      return data?.authorized === true;
    } catch (err) {
      console.error('Exception in validateCanChangeRole:', err);
      return false;
    }
  },

  /**
   * Validar que usuario puede ver conversación
   */
  async validateConversationAccess(
    userId: string,
    conversationId: string,
    organizationId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('validate-conversation-access', {
        body: {
          userId,
          conversationId,
          organizationId
        }
      });

      if (error) return false;
      return data?.authorized === true;
    } catch (err) {
      console.error('Exception in validateConversationAccess:', err);
      return false;
    }
  },

  /**
   * Validar que usuario puede crear campaña
   */
  async validateCanCreateCampaign(
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('validate-campaign-creation', {
        body: {
          userId,
          organizationId
        }
      });

      if (error) return false;
      return data?.authorized === true;
    } catch (err) {
      console.error('Exception in validateCanCreateCampaign:', err);
      return false;
    }
  },

  /**
   * Validar que usuario puede descargar datos
   */
  async validateCanDownloadData(
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('validate-data-download', {
        body: {
          userId,
          organizationId
        }
      });

      if (error) return false;
      return data?.authorized === true;
    } catch (err) {
      console.error('Exception in validateCanDownloadData:', err);
      return false;
    }
  },

  /**
   * Asignar leads a Community user (solo Manager/Admin)
   */
  async assignLeadsToUser(
    managerId: string,
    userId: string,
    leadIds: string[],
    organizationId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('assign-leads-to-user', {
        body: {
          managerId,
          userId,
          leadIds,
          organizationId
        }
      });

      if (error) return false;
      return data?.success === true;
    } catch (err) {
      console.error('Exception in assignLeadsToUser:', err);
      return false;
    }
  },

  /**
   * Crear equipo (Manager supervisa Community users)
   */
  async createTeamHierarchy(
    managerId: string,
    memberId: string,
    organizationId: string,
    roleInTeam: 'team_lead' | 'agent'
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('create-team-hierarchy', {
        body: {
          managerId,
          memberId,
          organizationId,
          roleInTeam
        }
      });

      if (error) return false;
      return data?.success === true;
    } catch (err) {
      console.error('Exception in createTeamHierarchy:', err);
      return false;
    }
  },

  /**
   * Obtener resumen de permisos del usuario (llamada backend)
   */
  async getUserPermissionsSummary(userId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase.functions.invoke('get-user-permissions', {
        body: { userId }
      });

      if (error) return null;
      return data;
    } catch (err) {
      console.error('Exception in getUserPermissionsSummary:', err);
      return null;
    }
  }
};
