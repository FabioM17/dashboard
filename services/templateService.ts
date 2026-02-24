
import { supabase } from './supabaseClient';
import { Template } from '../types';

export const templateService = {
  
  // 1. Obtener Templates
  async getTemplates(organizationId: string | undefined): Promise<Template[]> {
    if (!organizationId) return [];
    const { data, error } = await supabase
      .from('meta_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });

    if (error) {
      console.error("Error fetching templates:", error);
      return [];
    }

    return data.map((t: any) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      language: t.language,
      status: t.status,
      body: t.body
    }));
  },

  // 2. Sync with Meta (Calls Edge Function)
  async syncWithMeta(organizationId: string) {
     const { data, error } = await supabase.functions.invoke('whatsapp-sync-templates', {
         body: { organization_id: organizationId }
     });

     if (error) {
         console.error("Function Error:", error);
         throw new Error(error.message || "Failed to sync templates.");
     }
     
     if (data?.error) {
         throw new Error(data.error);
     }
  },

  // 3. Eliminar Template (Local DB)
  async deleteTemplate(id: string, organizationId: string) {
    if (!organizationId) throw new Error("Organization ID required");
    const { error } = await supabase
      .from('meta_templates')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);
    if (error) throw error;
  },

  // Deprecated: createTemplate and verifyTemplate removed as we sync from Meta now.
};
