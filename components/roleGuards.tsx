/**
 * roleGuards.tsx
 * 
 * Componentes y hooks para proteger la UI basada en roles
 * Usado en componentes para mostrar/ocultar características según permisos
 */

import React from 'react';
import { User } from '../types';
import { rolePermissionService } from '../services/rolePermissionService';

/**
 * Hook para verificar permisos
 */
export const useRolePermission = (user: User | null) => {
  if (!user) {
    return {
      isAdmin: false,
      isManager: false,
      isCommunity: false,
      canManageUsers: false,
      canManageSettings: false,
      canManageIntegrations: false,
      canManageProperties: false,
      canCreateCampaigns: false,
      canDownloadData: false,
      canViewStatistics: false,
      canAccessView: (view: string) => false
    };
  }

  const config = rolePermissionService.getRoleConfig(user.role);

  return {
    isAdmin: user.role === 'admin',
    isManager: user.role === 'manager',
    isCommunity: user.role === 'community',
    canManageUsers: config.canManageUsers,
    canManageSettings: config.canManageSettings,
    canManageIntegrations: config.canManageIntegrations,
    canManageProperties: config.canManageProperties,
    canCreateCampaigns: config.canCreateCampaigns,
    canDownloadData: config.canDownloadData,
    canViewStatistics: config.canViewStatistics,
    canAccessView: (view: string) => rolePermissionService.canAccessView(user, view)
  };
};

/**
 * Componente protegido que solo renderiza si el usuario tiene el rol requerido
 */
interface RoleGuardProps {
  user: User | null;
  roles: Array<'admin' | 'manager' | 'community'>;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ user, roles, children, fallback = null }) => {
  if (!user || !roles.includes(user.role)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
};

/**
 * Componente para mostrar botón solo si tiene permiso
 */
interface PermissionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  user: User | null;
  permission: (user: User) => boolean;
  children: React.ReactNode;
  tooltip?: string;
}

export const PermissionButton: React.FC<PermissionButtonProps> = ({
  user,
  permission,
  children,
  tooltip,
  disabled = false,
  ...props
}) => {
  if (!user || !permission(user)) {
    return null;
  }

  return (
    <button {...props} disabled={disabled} title={tooltip}>
      {children}
    </button>
  );
};

/**
 * Wrapper para features que requieren permisos
 */
interface FeatureGuardProps {
  user: User | null;
  feature: 'manageUsers' | 'manageSettings' | 'manageIntegrations' | 'manageProperties' | 'createCampaigns' | 'downloadData' | 'viewStatistics';
  children: React.ReactNode;
  deniedMessage?: string;
}

export const FeatureGuard: React.FC<FeatureGuardProps> = ({
  user,
  feature,
  children,
  deniedMessage = 'You do not have permission to access this feature.'
}) => {
  if (!user) {
    return <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">{deniedMessage}</div>;
  }

  const permissions: Record<string, (user: User) => boolean> = {
    manageUsers: (u) => rolePermissionService.isAdmin(u),
    manageSettings: (u) => rolePermissionService.isAdmin(u) || rolePermissionService.isManager(u),
    manageIntegrations: (u) => rolePermissionService.isAdmin(u),
    manageProperties: (u) => rolePermissionService.isAdmin(u),
    createCampaigns: (u) => rolePermissionService.isAdmin(u),
    downloadData: (u) => rolePermissionService.isAdmin(u),
    viewStatistics: (u) => rolePermissionService.isAdmin(u) || rolePermissionService.isManager(u)
  };

  const hasPermission = permissions[feature]?.(user) || false;

  if (!hasPermission) {
    return <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-700">{deniedMessage}</div>;
  }

  return <>{children}</>;
};

/**
 * Componente para mostrar nivel de acceso del usuario
 */
interface RoleBadgeProps {
  user: User | null;
  className?: string;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ user, className = '' }) => {
  if (!user) return null;

  const roleColors: Record<string, string> = {
    admin: 'bg-red-100 text-red-800',
    manager: 'bg-blue-100 text-blue-800',
    community: 'bg-green-100 text-green-800'
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrator',
    manager: 'Manager',
    community: 'Community Agent'
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${roleColors[user.role] || 'bg-gray-100 text-gray-800'} ${className}`}>
      {roleLabels[user.role] || user.role}
    </span>
  );
};

/**
 * Hook para validar acceso a recurso específico
 */
export const useResourceAccess = async (
  user: User | null,
  resourceType: string,
  resourceId: string,
  resourceOrgId: string
): Promise<boolean> => {
  if (!user) return false;

  try {
    const hasAccess = await rolePermissionService.canAccessResource(
      user,
      resourceType,
      resourceId,
      resourceOrgId
    );
    return hasAccess;
  } catch (error) {
    console.error('Error checking resource access:', error);
    return false;
  }
};
