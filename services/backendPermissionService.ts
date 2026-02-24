import { supabase } from './supabaseClient';

export interface ValidationRequest {
  action: string;
  userId: string;
  targetUserId?: string;
  organizationId: string;
  newRole?: string;
}

export interface ValidationResponse {
  authorized: boolean;
  error?: string;
  action?: string;
}

/**
 * Valida permisos en el backend antes de ejecutar acciones críticas
 * Este servicio hace llamadas al Edge Function validate-permissions
 * para seguridad de backend-first
 */
export const backendPermissionService = {
  /**
   * Valida si un usuario puede eliminar otro usuario
   */
  async canDeleteUser(userId: string, targetUserId: string, organizationId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('validate-permissions', {
        body: {
          action: 'delete_user',
          userId,
          targetUserId,
          organizationId,
        },
      });

      if (error) {
        console.error('Permission validation error:', error);
        return false;
      }

      return data?.authorized === true;
    } catch (error) {
      console.error('Error validating delete permission:', error);
      return false;
    }
  },

  /**
   * Valida si un usuario puede cambiar el rol de otro
   */
  async canChangeRole(
    userId: string,
    targetUserId: string,
    organizationId: string,
    newRole: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('validate-permissions', {
        body: {
          action: 'change_role',
          userId,
          targetUserId,
          organizationId,
          newRole,
        },
      });

      if (error) {
        console.error('Permission validation error:', error);
        return false;
      }

      return data?.authorized === true;
    } catch (error) {
      console.error('Error validating role change permission:', error);
      return false;
    }
  },

  /**
   * Valida si un usuario puede ver una conversación
   */
  async canViewConversation(
    userId: string,
    conversationId: string,
    organizationId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('validate-permissions', {
        body: {
          action: 'view_conversation',
          userId,
          targetUserId: conversationId,
          organizationId,
        },
      });

      if (error) {
        console.error('Permission validation error:', error);
        return false;
      }

      return data?.authorized === true;
    } catch (error) {
      console.error('Error validating view conversation permission:', error);
      return false;
    }
  },

  /**
   * Valida si un usuario puede crear una campaña
   */
  async canCreateCampaign(userId: string, organizationId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('validate-permissions', {
        body: {
          action: 'create_campaign',
          userId,
          organizationId,
        },
      });

      if (error) {
        console.error('Permission validation error:', error);
        return false;
      }

      return data?.authorized === true;
    } catch (error) {
      console.error('Error validating create campaign permission:', error);
      return false;
    }
  },

  /**
   * Valida si un usuario puede descargar datos
   */
  async canDownloadData(userId: string, organizationId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('validate-permissions', {
        body: {
          action: 'download_data',
          userId,
          organizationId,
        },
      });

      if (error) {
        console.error('Permission validation error:', error);
        return false;
      }

      return data?.authorized === true;
    } catch (error) {
      console.error('Error validating download data permission:', error);
      return false;
    }
  },

  /**
   * Validación genérica para cualquier acción
   */
  async validatePermission(request: ValidationRequest): Promise<ValidationResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('validate-permissions', {
        body: request,
      });

      if (error) {
        console.error('Permission validation error:', error);
        return {
          authorized: false,
          error: error.message,
        };
      }

      return {
        authorized: data?.authorized === true,
        error: data?.error,
        action: data?.action,
      };
    } catch (error) {
      console.error('Error validating permission:', error);
      return {
        authorized: false,
        error: 'Failed to validate permission',
      };
    }
  },
};
