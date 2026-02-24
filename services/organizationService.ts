import { supabase } from './supabaseClient';

export interface Organization {
  id: string;
  name: string;
  support_email?: string;
  created_at: string;
}

export interface OrganizationUpdatePayload {
  name?: string;
  support_email?: string;
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
      const { data, error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', organizationId)
        .select()
        .single();

      if (error) {
        console.error('Error updating organization details:', error);
        throw error;
      }

      return data as Organization;
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
      const { data, error } = await supabase
        .from('organizations')
        .insert([
          {
            name: name.trim(),
            ...(supportEmail && { support_email: supportEmail.trim() })
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Error creating organization:', error);
        throw error;
      }

      return data as Organization;
    } catch (err: any) {
      console.error('Exception in createOrganization:', err);
      throw err;
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
  }
};
