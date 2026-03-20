import { supabase } from './supabaseClient';
import { WhatsAppFlow } from '../types';

function toFlow(row: any): WhatsAppFlow {
  return {
    id: row.id,
    organization_id: row.organization_id,
    meta_flow_id: row.meta_flow_id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status,
    flow_type: row.flow_type,
    body_text: row.body_text,
    cta_text: row.cta_text,
    first_screen: row.first_screen ?? undefined,
    field_mappings: row.field_mappings ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const whatsappFlowService = {
  async list(orgId: string): Promise<WhatsAppFlow[]> {
    const { data, error } = await supabase
      .from('whatsapp_flows')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    if (error) { console.error('[whatsappFlowService] list:', error); return []; }
    return (data ?? []).map(toFlow);
  },

  async create(
    payload: Omit<WhatsAppFlow, 'id' | 'created_at' | 'updated_at'>,
    orgId: string
  ): Promise<WhatsAppFlow> {
    const { data, error } = await supabase
      .from('whatsapp_flows')
      .insert({
        organization_id: orgId,
        meta_flow_id: payload.meta_flow_id.trim(),
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        status: payload.status,
        flow_type: payload.flow_type,
        body_text: payload.body_text.trim(),
        cta_text: payload.cta_text.trim(),
        first_screen: payload.first_screen?.trim() || null,
        field_mappings: payload.field_mappings,
      })
      .select()
      .single();
    if (error) throw error;
    return toFlow(data);
  },

  async update(
    id: string,
    payload: Partial<Omit<WhatsAppFlow, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>,
    orgId: string
  ): Promise<WhatsAppFlow> {
    const updateData: Record<string, any> = {};
    if (payload.meta_flow_id !== undefined) updateData.meta_flow_id = payload.meta_flow_id.trim();
    if (payload.name !== undefined) updateData.name = payload.name.trim();
    if (payload.description !== undefined) updateData.description = payload.description?.trim() || null;
    if (payload.status !== undefined) updateData.status = payload.status;
    if (payload.flow_type !== undefined) updateData.flow_type = payload.flow_type;
    if (payload.body_text !== undefined) updateData.body_text = payload.body_text.trim();
    if (payload.cta_text !== undefined) updateData.cta_text = payload.cta_text.trim();
    if (payload.first_screen !== undefined) updateData.first_screen = payload.first_screen?.trim() || null;
    if (payload.field_mappings !== undefined) updateData.field_mappings = payload.field_mappings;

    const { data, error } = await supabase
      .from('whatsapp_flows')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();
    if (error) throw error;
    return toFlow(data);
  },

  async delete(id: string, orgId: string): Promise<void> {
    const { error } = await supabase
      .from('whatsapp_flows')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId);
    if (error) throw error;
  },

  /** Calls the whatsapp-sync-flows edge function, which fetches all flows
   *  from the Meta API (using stored WABA credentials) and upserts them.
   *  Returns the refreshed list of flows. */
  async syncWithMeta(orgId: string): Promise<{ flows: WhatsAppFlow[]; inserted: number; updated: number; message: string }> {
    const { data, error } = await supabase.functions.invoke('whatsapp-sync-flows', {
      body: { organization_id: orgId },
    });
    if (error) throw new Error(error.message || 'Error al sincronizar con Meta.');
    if (data?.error) throw new Error(data.error);
    return {
      flows: (data.flows ?? []).map((row: any): WhatsAppFlow => ({
        id: row.id,
        organization_id: row.organization_id ?? orgId,
        meta_flow_id: row.meta_flow_id,
        name: row.name,
        description: row.description ?? undefined,
        status: row.status,
        flow_type: row.flow_type,
        body_text: row.body_text,
        cta_text: row.cta_text,
        first_screen: row.first_screen ?? undefined,
        field_mappings: row.field_mappings ?? {},
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      inserted: data.inserted ?? 0,
      updated: data.updated ?? 0,
      message: data.message ?? '',
    };
  },
};
