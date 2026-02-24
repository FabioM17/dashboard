// authorizationService.ts - Permission and authorization checks
import { User, UserRole } from '../types';

export const authorizationService = {
  /**
   * ADMIN - Control total de la organización
   * - Cambiar/eliminar/vincular cuentas
   * - Incluir APIs
   * - Crear/quitar propiedades
   * - Descargar bases de datos
   * - Gestionar equipo completo
   */
  
  /**
   * MANAGER - Supervisor de equipo
   * - Crear/modificar usuarios del equipo
   * - Supervisar equipo asignado
   * - Ver conversaciones del equipo
   * - Gestionar tareas del equipo
   */
  
  /**
   * COMMUNITY - Acceso limitado a leads
   * - Ver solo leads asignados
   * - Responder mensajes
   * - No puede crear ni modificar usuarios
   */

  // ===== MENSAJE =====
  canSendMessage(user: User): boolean {
    // Admin, Manager y Community pueden enviar mensajes
    // Pero Community solo en conversaciones asignadas
    return user.role !== undefined;
  },

  // ===== CONFIGURACIÓN GENERAL =====
  canEditSettings(user: User): boolean {
    // Solo Admin puede editar configuración
    return user.role === 'admin';
  },

  canManageIntegrations(user: User): boolean {
    // Solo Admin puede integrar APIs
    return user.role === 'admin';
  },

  canDownloadDatabase(user: User): boolean {
    // Solo Admin puede descargar BD
    return user.role === 'admin';
  },

  // ===== PROPIEDADES CRM =====
  canCreateProperties(user: User): boolean {
    // Solo Admin puede crear propiedades
    return user.role === 'admin';
  },

  canDeleteProperties(user: User): boolean {
    // Solo Admin puede eliminar propiedades
    return user.role === 'admin';
  },

  canManageContacts(user: User): boolean {
    // Admin: todos los contactos
    // Manager: contactos del equipo
    // Community: solo leads asignados (controlado en frontend/backend)
    return user.role === 'admin' || user.role === 'manager';
  },

  // ===== CAMPAÑAS =====
  canCreateCampaigns(user: User): boolean {
    // Solo Admin puede crear campañas
    return user.role === 'admin';
  },

  // ===== TAREAS =====
  canManageTasks(user: User): boolean {
    // Admin: todas las tareas
    // Manager: tareas del equipo
    // Community: no puede gestionar tareas
    return user.role === 'admin' || user.role === 'manager';
  },

  // ===== CONVERSACIONES =====
  canViewConversation(user: User, conversationOrgId?: string, assignedLeads?: string[]): boolean {
    // Admin: todas las conversaciones
    // Manager: conversaciones del equipo (validado en backend)
    // Community: solo leads asignados
    if (user.role === 'admin' || user.role === 'manager') {
      return true;
    }
    if (user.role === 'community' && assignedLeads) {
      return assignedLeads.includes(user.id);
    }
    return false;
  },

  canAddNotes(user: User): boolean {
    // Admin, Manager y Community pueden agregar notas
    return user.role !== undefined;
  },

  canDeleteMessages(user: User): boolean {
    // Solo Admin puede eliminar mensajes
    return user.role === 'admin';
  },

  canArchiveConversations(user: User): boolean {
    // Admin y Manager pueden archivar
    return user.role === 'admin' || user.role === 'manager';
  },

  // ===== GESTIÓN DE EQUIPO =====
  canManageTeam(user: User): boolean {
    // Solo Admin puede gestionar equipo completo
    return user.role === 'admin';
  },

  canManageTeamMembers(user: User): boolean {
    // Admin: gestionar todos
    // Manager: gestionar equipo asignado
    return user.role === 'admin' || user.role === 'manager';
  },

  canInviteUsers(user: User): boolean {
    // Solo Admin puede invitar usuarios
    return user.role === 'admin';
  },

  canChangeUserRoles(user: User): boolean {
    // Solo Admin puede cambiar roles
    return user.role === 'admin';
  },

  canDeleteUsers(user: User): boolean {
    // Solo Admin puede eliminar usuarios
    return user.role === 'admin';
  },

  // ===== ESTADÍSTICAS =====
  canViewStatistics(user: User): boolean {
    // Admin: estadísticas globales
    // Manager: estadísticas del equipo
    // Community: no acceso a estadísticas
    return user.role === 'admin' || user.role === 'manager';
  },

  // ===== ACCESO A VISTAS =====
  canAccessView(user: User, view: string): boolean {
    const viewAccess: Record<UserRole, string[]> = {
      admin: ['chats', 'crm', 'stats', 'settings', 'tasks', 'team', 'properties', 'integrations'],
      manager: ['chats', 'crm', 'stats', 'tasks', 'team'],
      community: ['chats']
    };
    return viewAccess[user.role]?.includes(view) || false;
  },

  // ===== ACCESO A RECURSOS =====
  belongsToOrganization(user: User, organizationId: string): boolean {
    return user.organizationId === organizationId;
  },

  canAccessResource(user: User, resourceOrgId: string): boolean {
    return this.belongsToOrganization(user, resourceOrgId);
  },

  // Get allowed actions for user role
  getAllowedActions(role: UserRole): string[] {
    const actions: Record<UserRole, string[]> = {
      admin: [
        'send_message',
        'edit_settings',
        'manage_integrations',
        'download_database',
        'create_properties',
        'delete_properties',
        'manage_contacts',
        'create_campaigns',
        'manage_tasks',
        'view_conversations',
        'add_notes',
        'delete_messages',
        'archive_conversations',
        'manage_team',
        'invite_users',
        'change_roles',
        'delete_users',
        'view_statistics'
      ],
      manager: [
        'send_message',
        'manage_contacts',
        'manage_tasks',
        'view_statistics'
      ],
      community: [
        'send_message',
        'view_conversations',
        'add_notes'
      ]
    };
    return actions[role] || [];
  },

  // Check if user has specific permission
  hasPermission(user: User, permission: string): boolean {
    const allowed = this.getAllowedActions(user.role);
    return allowed.includes(permission);
  }
};
