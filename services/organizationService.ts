import { supabase } from './supabaseClient';
import { OrganizationMembership, UserRole } from '../types';

export interface Organization {
  id: string;
  name: string;
  support_email?: string;
  created_by?: string;
  created_at: string;
}

export interface OrganizationUpdatePayload {
  name?: string;
  support_email?: string;
}

export interface CreatorOrgLimitStatus {
  createdCount: number;
  maxOrganizations: number;
  remainingSlots: number;
  canCreate: boolean;
}

export const organizationService = {
  /**
   * Obtiene los detalles completos de una organización
   * @param organizationId - ID de la organización
   * @returns Datos de la organización o null si no existe
   */
  async getOrganizationDetails(organizationId: string): Promise<Organization | null> {
    if (!organizationId) {
      console.error('Organization ID required for getOrganizationDetails');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();

      if (error) {
        console.error('Error fetching organization details:', error);
        return null;
      }

      return data as Organization;
    } catch (err) {
      console.error('Exception in getOrganizationDetails:', err);
      return null;
    }
  },

  /**
   * Actualiza los detalles de una organización
   * @param organizationId - ID de la organización
   * @param updates - Objeto con los campos a actualizar
   * @returns Datos actualizados o null si falla
   */
  async updateOrganizationDetails(
    organizationId: string,
    updates: OrganizationUpdatePayload
  ): Promise<Organization | null> {
    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    if (!updates || Object.keys(updates).length === 0) {
      throw new Error('At least one field must be provided for update');
    }

    try {
      const { error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', organizationId);

      if (error) {
        console.error('Error updating organization details:', error);
        throw error;
      }

      const { data: updatedData, error: fetchError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();

      if (fetchError) {
        console.error('Error fetching updated organization:', fetchError);
        throw fetchError;
      }

      return updatedData as Organization;
    } catch (err: any) {
      console.error('Exception in updateOrganizationDetails:', err);
      throw err;
    }
  },

  /**
   * Obtiene solo el nombre de la organización
   * @param organizationId - ID de la organización
   * @returns Nombre de la organización o null
   */
  async getOrganizationName(organizationId: string): Promise<string | null> {
    if (!organizationId) {
      console.error('Organization ID required for getOrganizationName');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single();

      if (error) {
        console.error('Error fetching organization name:', error);
        return null;
      }

      return data?.name || null;
    } catch (err) {
      console.error('Exception in getOrganizationName:', err);
      return null;
    }
  },

  /**
   * Obtiene solo el email de soporte de la organización
   * @param organizationId - ID de la organización
   * @returns Email de soporte o null
   */
  async getOrganizationSupportEmail(organizationId: string): Promise<string | null> {
    if (!organizationId) {
      console.error('Organization ID required for getOrganizationSupportEmail');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('support_email')
        .eq('id', organizationId)
        .single();

      if (error) {
        console.error('Error fetching organization support email:', error);
        return null;
      }

      return data?.support_email || null;
    } catch (err) {
      console.error('Exception in getOrganizationSupportEmail:', err);
      return null;
    }
  },

  /**
   * Actualiza solo el nombre de la organización
   * @param organizationId - ID de la organización
   * @param name - Nuevo nombre
   * @returns Datos actualizados o null si falla
   */
  async updateOrganizationName(
    organizationId: string,
    name: string
  ): Promise<Organization | null> {
    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    if (!name || name.trim().length === 0) {
      throw new Error('Organization name cannot be empty');
    }

    return this.updateOrganizationDetails(organizationId, { name: name.trim() });
  },

  /**
   * Actualiza solo el email de soporte de la organización
   * @param organizationId - ID de la organización
   * @param email - Nuevo email de soporte
   * @returns Datos actualizados o null si falla
   */
  async updateOrganizationSupportEmail(
    organizationId: string,
    email: string
  ): Promise<Organization | null> {
    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    if (!email || email.trim().length === 0) {
      throw new Error('Support email cannot be empty');
    }

    // Validación básica de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      throw new Error('Invalid email format');
    }

    return this.updateOrganizationDetails(organizationId, { support_email: email.trim() });
  },

  /**
   * Verifica si una organización existe
   * @param organizationId - ID de la organización
   * @returns true si existe, false en caso contrario
   */
  async organizationExists(organizationId: string): Promise<boolean> {
    if (!organizationId) {
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', organizationId)
        .single();

      if (error) {
        console.error('Error checking organization existence:', error);
        return false;
      }

      return !!data;
    } catch (err) {
      console.error('Exception in organizationExists:', err);
      return false;
    }
  },

  /**
   * Obtiene múltiples organizaciones (para admins)
   * @returns Lista de organizaciones o array vacío si falla
   */
  async getAllOrganizations(): Promise<Organization[]> {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching all organizations:', error);
        return [];
      }

      return (data || []) as Organization[];
    } catch (err) {
      console.error('Exception in getAllOrganizations:', err);
      return [];
    }
  },

  /**
   * Crea una nueva organización
   * @param name - Nombre de la organización
   * @param supportEmail - Email de soporte (opcional)
   * @returns Datos de la organización creada o null si falla
   */
  async createOrganization(
    name: string,
    supportEmail?: string
  ): Promise<Organization | null> {
    if (!name || name.trim().length === 0) {
      throw new Error('Organization name cannot be empty');
    }

    try {
      // Use SECURITY DEFINER RPC to create the organization.
      // This bypasses the RLS INSERT policy (which relies on a STABLE function chain
      // that can fail in some auth contexts) and performs the quota check server-side.
      const { data, error } = await supabase
        .rpc('create_organization_for_user', {
          p_name: name.trim(),
          ...(supportEmail ? { p_support_email: supportEmail.trim() } : {})
        });

      if (error) {
        // Surface the server-side quota message directly to the UI.
        console.error('Error creating organization:', error);
        throw new Error(error.message || error.details || 'Error al crear la organización');
      }

      return data as Organization;
    } catch (err: any) {
      console.error('Exception in createOrganization:', err);
      throw err;
    }
  },

  /**
   * Returns creator quota status for organization creation.
   * This is the foundation for package-based limits.
   */
  async getCreatorOrgLimitStatus(userId: string): Promise<CreatorOrgLimitStatus | null> {
    if (!userId) return null;

    try {
      const { data, error } = await supabase
        .rpc('get_creator_org_limit_status', { p_user_id: userId })
        .single();

      if (error) {
        console.error('Error getting creator organization limit status:', error);
        return null;
      }

      return {
        createdCount: data?.created_count ?? 0,
        maxOrganizations: data?.max_organizations ?? 1,
        remainingSlots: data?.remaining_slots ?? 0,
        canCreate: data?.can_create ?? false,
      };
    } catch (err) {
      console.error('Exception in getCreatorOrgLimitStatus:', err);
      return null;
    }
  },

  /**
   * Suscribirse a cambios en tiempo real de una organización
   * @param organizationId - ID de la organización
   * @param callback - Función a ejecutar cuando cambie
   * @returns Función para desuscribirse
   */
  subscribeToOrganizationChanges(
    organizationId: string,
    callback: (org: Organization) => void
  ) {
    if (!organizationId) {
      console.error('Organization ID required for subscribeToOrganizationChanges');
      return () => {};
    }

    const channel = supabase
      .channel(`organization:${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'organizations',
          filter: `id=eq.${organizationId}`
        },
        (payload: any) => {
          if (payload.new) {
            callback(payload.new as Organization);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // ── Multi-Organization Methods ──────────────────────────────────────

  /**
   * Get all organizations a user belongs to
   */
  async getUserOrganizations(userId: string): Promise<OrganizationMembership[]> {
    if (!userId) return [];

    try {
      const { data, error } = await supabase
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
        .eq('user_id', userId)
        .order('is_default', { ascending: false });

      if (error) {
        console.warn('Join query failed, using fallback:', error.message);
        // Fallback: fetch without join
        const { data: rawMembers } = await supabase
          .from('organization_members')
          .select('id, user_id, organization_id, role, is_default, created_at')
          .eq('user_id', userId);

        if (!rawMembers || rawMembers.length === 0) return [];

        const orgIds = rawMembers.map((m: any) => m.organization_id);
        const { data: orgs } = await supabase
          .from('organizations')
          .select('id, name')
          .in('id', orgIds);

        const orgMap = new Map((orgs || []).map((o: any) => [o.id, o.name]));

        return rawMembers.map((m: any) => ({
          id: m.id,
          userId: m.user_id,
          organizationId: m.organization_id,
          organizationName: orgMap.get(m.organization_id) || 'Sin nombre',
          role: m.role as UserRole,
          isDefault: m.is_default,
          createdAt: new Date(m.created_at),
        }));
      }

      return (data || []).map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        organizationId: m.organization_id,
        organizationName: m.organizations?.name || 'Sin nombre',
        role: m.role as UserRole,
        isDefault: m.is_default,
        createdAt: new Date(m.created_at),
      }));
    } catch (err) {
      console.error('Exception in getUserOrganizations:', err);
      return [];
    }
  },

  /**
   * Switch active organization for the current user.
   * Calls the DB function that updates profiles and marks default.
   */
  async switchOrganization(organizationId: string): Promise<{ success: boolean; role: UserRole }> {
    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    try {
      const { data, error } = await supabase.rpc('switch_organization', {
        target_org_id: organizationId,
      });

      if (error) {
        console.error('Error switching organization:', error);
        throw error;
      }

      return {
        success: data?.success ?? false,
        role: (data?.role as UserRole) || 'community',
      };
    } catch (err: any) {
      console.error('Exception in switchOrganization:', err);
      throw err;
    }
  },

  /**
   * Add a membership record when a user creates or is invited to an org
   */
  async addMembership(
    userId: string,
    organizationId: string,
    role: UserRole,
    isDefault = false
  ): Promise<void> {
    const { error } = await supabase
      .from('organization_members')
      .upsert(
        { user_id: userId, organization_id: organizationId, role, is_default: isDefault },
        { onConflict: 'user_id,organization_id' }
      );

    if (error) {
      console.error('Error adding membership:', error);
      throw error;
    }
  },

  /**
   * Remove a membership (leave an organization)
   */
  async removeMembership(userId: string, organizationId: string): Promise<void> {
    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('user_id', userId)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error removing membership:', error);
      throw error;
    }
  }
};
