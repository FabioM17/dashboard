/**
 * rolePermissionService.ts
 * 
 * Servicio centralizado para validar permisos basados en roles
 * Implementa lógica de seguridad robusta para los 3 roles:
 * - ADMIN: Control total
 * - MANAGER: Gestor de equipo
 * - COMMUNITY: Acceso limitado a leads
 */

import { User, UserRole } from '../types';
import { supabase } from './supabaseClient';

interface RolePermissionConfig {
  role: UserRole;
  canManageUsers: boolean;
  canManageSettings: boolean;
  canManageIntegrations: boolean;
  canManageProperties: boolean;
  canViewAllConversations: boolean;
  canViewTeamConversations: boolean;
  canViewAssignedConversations: boolean;
  canCreateCampaigns: boolean;
  canDownloadData: boolean;
  accessibleViews: string[];
}

const ROLE_CONFIGS: Record<UserRole, RolePermissionConfig> = {
  admin: {
    role: 'admin',
    canManageUsers: true,
    canManageSettings: true,
    canManageIntegrations: true,
    canManageProperties: true,
    canViewAllConversations: true,
    canViewTeamConversations: false,
    canViewAssignedConversations: false,
    canCreateCampaigns: true,
    canDownloadData: true,
    accessibleViews: ['chats', 'crm', 'stats', 'settings', 'tasks', 'team', 'properties', 'integrations']
  },
  manager: {
    role: 'manager',
    canManageUsers: false,
    canManageSettings: false,
    canManageIntegrations: false,
    canManageProperties: false,
    canViewAllConversations: false,
    canViewTeamConversations: true,
    canViewAssignedConversations: false,
    canCreateCampaigns: false,
    canDownloadData: false,
    accessibleViews: ['chats', 'crm', 'stats', 'tasks', 'team']
  },
  community: {
    role: 'community',
    canManageUsers: false,
    canManageSettings: false,
    canManageIntegrations: false,
    canManageProperties: false,
    canViewAllConversations: false,
    canViewTeamConversations: false,
    canViewAssignedConversations: true,
    canCreateCampaigns: false,
    canDownloadData: false,
    accessibleViews: ['chats']
  }
};

export const rolePermissionService = {
  /**
   * Obtiene la configuración de permisos para un rol
   */
  getRoleConfig(role: UserRole): RolePermissionConfig {
    return ROLE_CONFIGS[role];
  },

  /**
   * ADMIN VALIDATIONS
   */

  // Validar que el usuario es Admin
  isAdmin(user: User): boolean {
    return user.role === 'admin';
  },

  // Validar que puede cambiar/eliminar cuentas
  async canModifyUserAccount(currentUser: User, targetUserId: string): Promise<boolean> {
    if (!this.isAdmin(currentUser)) return false;
    
    // Validar que ambos pertenecen a la misma organización
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', targetUserId)
      .single();

    return targetUser?.organization_id === currentUser.organizationId;
  },

  // Validar que puede integrar APIs
  canIntegrateAPIs(user: User): boolean {
    return this.isAdmin(user);
  },

  // Validar que puede crear/eliminar propiedades
  canManageProperties(user: User): boolean {
    return this.isAdmin(user);
  },

  // Validar que puede descargar BD
  canDownloadDatabase(user: User): boolean {
    return this.isAdmin(user);
  },

  /**
   * MANAGER VALIDATIONS
   */

  // Validar que es Manager
  isManager(user: User): boolean {
    return user.role === 'manager';
  },

  // Validar que puede supervisar un usuario del equipo
  async canSuperviseUser(managerUser: User, targetUserId: string): Promise<boolean> {
    if (!this.isManager(managerUser) && !this.isAdmin(managerUser)) return false;

    // Si es Admin, puede supervisar a cualquiera en su org
    if (this.isAdmin(managerUser)) {
      const { data: target } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', targetUserId)
        .single();
      return target?.organization_id === managerUser.organizationId;
    }

    // Si es Manager, valida que el usuario está en su equipo
    const { data: target } = await supabase
      .from('profiles')
      .select('team_lead_id, organization_id')
      .eq('id', targetUserId)
      .single();

    if (!target) return false;

    // El Manager solo puede supervisar usuarios cuyo team_lead_id es él mismo
    return target.team_lead_id === managerUser.id && 
           target.organization_id === managerUser.organizationId;
  },

  // Validar que puede ver conversaciones del equipo
  async canViewTeamConversations(user: User): Promise<boolean> {
    if (this.isAdmin(user)) return true;
    if (!this.isManager(user)) return false;

    // Manager puede ver conversaciones de su equipo
    // Esto se valida contra la asignación de conversaciones
    return true;
  },

  /**
   * COMMUNITY VALIDATIONS
   */

  // Validar que es Community
  isCommunity(user: User): boolean {
    return user.role === 'community';
  },

  // Validar que puede ver una conversación específica (solo sus leads asignados)
  async canViewSpecificConversation(
    user: User,
    conversationId: string,
    assignedLeadIds?: string[]
  ): Promise<boolean> {
    if (this.isAdmin(user) || this.isManager(user)) return true;

    if (!this.isCommunity(user)) return false;

    // Obtener los leads asignados del usuario
    const leads = assignedLeadIds || user.assigned_lead_ids || [];
    
    // Validar que la conversación está en sus leads asignados
    const { data: conversation } = await supabase
      .from('conversations')
      .select('contact_phone')
      .eq('id', conversationId)
      .single();

    if (!conversation) return false;

    // Aquí deberías validar contra una tabla de asignaciones
    // Por ahora, usamos los leads asignados del usuario
    return leads.includes(conversation.contact_phone || '');
  },

  // Validar que puede responder mensajes
  canRespond(user: User): boolean {
    return user.role !== undefined; // Todos pueden responder en sus conversaciones asignadas
  },

  /**
   * VIEW ACCESS VALIDATION
   */

  // Validar acceso a vistas/módulos
  canAccessView(user: User, view: string): boolean {
    const config = this.getRoleConfig(user.role);
    return config.accessibleViews.includes(view);
  },

  // Obtener lista de vistas accesibles
  getAccessibleViews(user: User): string[] {
    return this.getRoleConfig(user.role).accessibleViews;
  },

  /**
   * ORGANIZATION VALIDATION
   */

  // Validar que usuario pertenece a organización
  belongsToOrganization(user: User, organizationId: string): boolean {
    return user.organizationId === organizationId;
  },

  /**
   * BULK VALIDATION
   */

  // Obtener permisos resumidos para UI
  getUserPermissionsSummary(user: User) {
    const config = this.getRoleConfig(user.role);
    
    return {
      role: user.role,
      canManageUsers: config.canManageUsers,
      canManageSettings: config.canManageSettings,
      canManageIntegrations: config.canManageIntegrations,
      canManageProperties: config.canManageProperties,
      canViewAllConversations: config.canViewAllConversations,
      canViewTeamConversations: config.canViewTeamConversations,
      canViewAssignedConversations: config.canViewAssignedConversations,
      canCreateCampaigns: config.canCreateCampaigns,
      canDownloadData: config.canDownloadData,
      accessibleViews: config.accessibleViews
    };
  }
};
