
import { supabase } from './supabaseClient';
import { CRMContact, CustomProperty } from '../types';

export const crmService = {
  // === CONTACTS ===
  async getContacts(organizationId: string): Promise<CRMContact[]> {
    if (!organizationId) {
      console.error('Organization ID required for getContacts');
      return [];
    }

    const { data, error } = await supabase
      .from('crm_contacts')
      .select('*')
      .eq('organization_id', organizationId);
    if (error) { console.error(error); return []; }
    
    return data.map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email || '',
      phone: c.phone || '',
      company: c.company || '',
      pipelineStageId: c.pipeline_stage || 'lead',
      avatar: c.avatar_url,
      createdAt: c.created_at ? new Date(c.created_at) : undefined,
      properties: c.custom_properties || {}
    }));
  },

  async saveContact(contact: CRMContact, organizationId: string) {
    if (!organizationId) throw new Error("Org ID required");
    
    const payload = {
       name: contact.name,
       email: contact.email,
       phone: contact.phone,
       company: contact.company,
       pipeline_stage: contact.pipelineStageId,
       avatar_url: contact.avatar,
       custom_properties: contact.properties,
       organization_id: organizationId
    };

    // Check if ID is a UUID (existing) or a temporary timestamp string (new)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contact.id);
    
    let error;
    if (isUUID) {
         const { error: err } = await supabase.from('crm_contacts').upsert({ id: contact.id, ...payload });
         error = err;
    } else {
         const { error: err } = await supabase.from('crm_contacts').insert(payload);
         error = err;
    }
    
    if (error) throw error;
  },

  async deleteContact(id: string, organizationId: string) {
      if (!organizationId) throw new Error("Organization ID required");
      const { error } = await supabase
        .from('crm_contacts')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);
      if (error) throw error;
  },

  // === PROPERTIES ===

  async getProperties(organizationId: string): Promise<CustomProperty[]> {
    if (!organizationId) {
      console.error('Organization ID required for getProperties');
      return [];
    }

    const { data, error } = await supabase
      .from('crm_property_definitions')
      .select('*')
      .eq('organization_id', organizationId);
    if (error) { console.error(error); return []; }
    return data.map((p: any) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      options: p.options || undefined
    }));
  },

    async addProperty(property: CustomProperty, organizationId: string) {
      const payload: any = {
        id: property.id,
        name: property.name,
        type: property.type,
        organization_id: organizationId
      };
      if (property.type === 'select' && property.options) {
      payload.options = property.options;
      }
      const { error } = await supabase.from('crm_property_definitions').insert(payload);
      if (error) throw error;
    },

  async deleteProperty(id: string, organizationId: string) {
    if (!organizationId) throw new Error("Organization ID required");
    const { error } = await supabase
      .from('crm_property_definitions')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);
    if (error) throw error;
  }
};
