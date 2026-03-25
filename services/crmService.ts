
import { supabase } from './supabaseClient';
import { CRMContact, CustomProperty, WhatsAppFlowResponse } from '../types';

export const crmService = {
  // === CONTACTS ===

  // Helper: map a raw DB row to CRMContact
  _mapRow(c: any): CRMContact {
    let properties: Record<string, any> = {};
    if (c.custom_properties) {
      if (typeof c.custom_properties === 'string') {
        try { properties = JSON.parse(c.custom_properties); } catch { properties = {}; }
      } else {
        properties = c.custom_properties;
      }
    }
    return {
      id: c.id,
      name: c.name,
      email: c.email || '',
      phone: c.phone || '',
      company: c.company || '',
      pipelineStageId: c.pipeline_stage || 'lead',
      avatar: c.avatar_url,
      createdAt: c.created_at ? new Date(c.created_at) : undefined,
      properties
    };
  },

  // Load a small set of contacts for non-table features (campaigns, pipeline, etc.)
  // Supabase default max_rows cap applies (~1000). For the CRM table, use getContactsPage().
  async getContacts(organizationId: string): Promise<CRMContact[]> {
    if (!organizationId) {
      console.error('Organization ID required for getContacts');
      return [];
    }
    const { data, error } = await supabase
      .from('crm_contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return (data || []).map((c: any) => this._mapRow(c));
  },

  // Server-side paginated fetch for the CRM table view.
  // Only fetches the rows for the requested page — never loads everything into memory.
  async getContactsPage(
    organizationId: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      sortField?: string;
      sortDir?: 'asc' | 'desc';
      filters?: Array<{ field: string; comparison: string; value: string }>;
    }
  ): Promise<{ data: CRMContact[]; total: number }> {
    const { page = 1, pageSize = 20, search = '', sortField, sortDir = 'asc', filters = [] } = options;
    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;
    const standardFields = ['name', 'email', 'phone', 'company', 'pipeline_stage'];

    let query = supabase
      .from('crm_contacts')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId);

    // Quick search across main text fields
    if (search.trim()) {
      query = query.or(
        `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,company.ilike.%${search}%`
      );
    }

    // Advanced filters (standard fields + JSONB custom properties)
    for (const f of filters) {
      if (!f.field || f.value === '') continue;
      const dbField = f.field === 'pipelineStageId' ? 'pipeline_stage' : f.field;
      const colPath = standardFields.includes(dbField) ? dbField : `custom_properties->>${f.field}`;
      switch (f.comparison) {
        case 'equals':     query = (query as any).filter(colPath, 'eq',    f.value); break;
        case 'contains':   query = (query as any).filter(colPath, 'ilike', `%${f.value}%`); break;
        case 'startsWith': query = (query as any).filter(colPath, 'ilike', `${f.value}%`); break;
        case 'endsWith':   query = (query as any).filter(colPath, 'ilike', `%${f.value}`); break;
        case 'gt':         query = (query as any).filter(colPath, 'gt',    f.value); break;
        case 'lt':         query = (query as any).filter(colPath, 'lt',    f.value); break;
      }
    }

    // Sort — standard fields are sortable directly; custom props fallback to created_at
    const dbSort = sortField === 'pipelineStageId' ? 'pipeline_stage' : (sortField || 'created_at');
    if (standardFields.includes(dbSort) || dbSort === 'created_at') {
      query = query.order(dbSort, { ascending: sortDir === 'asc' });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error, count } = await query.range(from, to);
    if (error) { console.error(error); return { data: [], total: 0 }; }
    return { data: (data || []).map((c: any) => this._mapRow(c)), total: count ?? 0 };
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
      if ((property.type === 'select' || property.type === 'multiselect' || property.type === 'country') && property.options) {
        payload.options = property.options;
      }
      const { error } = await supabase.from('crm_property_definitions').insert(payload);
      if (error) throw error;
    },

  async updateProperty(property: CustomProperty, organizationId: string) {
    if (!organizationId) throw new Error("Organization ID required");
    const payload: any = {
      name: property.name,
      type: property.type,
      options: (property.type === 'select' || property.type === 'multiselect' || property.type === 'country') && property.options ? property.options : null,
    };
    const { error } = await supabase
      .from('crm_property_definitions')
      .update(payload)
      .eq('id', property.id)
      .eq('organization_id', organizationId);
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
  },

  // === WHATSAPP FLOW RESPONSES ===

  async getFlowResponsesByContact(
    contactId: string,
    organizationId: string
  ): Promise<WhatsAppFlowResponse[]> {
    if (!contactId || !organizationId) return [];
    const { data, error } = await supabase
      .from('crm_flow_responses')
      .select('*')
      .eq('contact_id', contactId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) { console.error('getFlowResponsesByContact:', error); return []; }
    return (data || []).map((r: any): WhatsAppFlowResponse => ({
      id: r.id,
      organizationId: r.organization_id,
      contactId: r.contact_id,
      conversationId: r.conversation_id,
      flowToken: r.flow_token,
      templateName: r.template_name,
      phoneNumber: r.phone_number,
      responseData: r.response_data || {},
      rawResponseJson: r.raw_response_json,
      wasEncrypted: r.was_encrypted,
      wamid: r.wamid,
      createdAt: new Date(r.created_at),
    }));
  },

  async getFlowResponsesByPhone(
    phone: string,
    organizationId: string
  ): Promise<WhatsAppFlowResponse[]> {
    if (!phone || !organizationId) return [];
    const { data, error } = await supabase
      .from('crm_flow_responses')
      .select('*')
      .eq('phone_number', phone)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) { console.error('getFlowResponsesByPhone:', error); return []; }
    return (data || []).map((r: any): WhatsAppFlowResponse => ({
      id: r.id,
      organizationId: r.organization_id,
      contactId: r.contact_id,
      conversationId: r.conversation_id,
      flowToken: r.flow_token,
      templateName: r.template_name,
      phoneNumber: r.phone_number,
      responseData: r.response_data || {},
      rawResponseJson: r.raw_response_json,
      wasEncrypted: r.was_encrypted,
      wamid: r.wamid,
      createdAt: new Date(r.created_at),
    }));
  }
};
