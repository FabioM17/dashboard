import { supabase } from './supabaseClient';
import { WhatsAppPhoneNumber } from '../types';

function mapFromDB(row: any): WhatsAppPhoneNumber {
  return {
    id: row.id,
    organizationId: row.organization_id,
    phoneNumberId: row.phone_number_id,
    displayPhoneNumber: row.display_phone_number,
    verifiedName: row.verified_name || undefined,
    label: row.label || '',
    isDefault: row.is_default,
    qualityRating: row.quality_rating || 'UNKNOWN',
    messagingLimitTier: row.messaging_limit_tier || 'TIER_UNKNOWN',
    wabaId: row.waba_id || undefined,
    accessToken: row.access_token || undefined,
    businessId: row.business_id || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export const whatsappPhoneService = {

  /** Get all phone numbers for an organization */
  async getPhoneNumbers(organizationId: string): Promise<WhatsAppPhoneNumber[]> {
    const { data, error } = await supabase
      .from('whatsapp_phone_numbers')
      .select('*')
      .eq('organization_id', organizationId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching WhatsApp phone numbers:', error);
      return [];
    }

    return (data || []).map(mapFromDB);
  },

  /** Get the default phone number for an organization */
  async getDefaultPhoneNumber(organizationId: string): Promise<WhatsAppPhoneNumber | null> {
    const { data, error } = await supabase
      .from('whatsapp_phone_numbers')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_default', true)
      .limit(1)
      .single();

    if (error || !data) {
      // Fallback: get any phone number
      const { data: fallback } = await supabase
        .from('whatsapp_phone_numbers')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      return fallback ? mapFromDB(fallback) : null;
    }

    return mapFromDB(data);
  },

  /** Add a new phone number to the organization */
  async addPhoneNumber(
    organizationId: string,
    phoneNumberId: string,
    displayPhoneNumber: string,
    label: string,
    isDefault: boolean,
    verifiedName?: string,
    wabaId?: string,
    accessToken?: string,
    businessId?: string
  ): Promise<WhatsAppPhoneNumber | null> {
    const { data, error } = await supabase
      .from('whatsapp_phone_numbers')
      .upsert({
        organization_id: organizationId,
        phone_number_id: phoneNumberId,
        display_phone_number: displayPhoneNumber,
        verified_name: verifiedName || null,
        label: label || '',
        is_default: isDefault,
        waba_id: wabaId || null,
        access_token: accessToken || null,
        business_id: businessId || null,
      }, { onConflict: 'organization_id,phone_number_id' })
      .select()
      .single();

    if (error) {
      console.error('Error adding WhatsApp phone number:', error);
      throw new Error(error.message);
    }

    return data ? mapFromDB(data) : null;
  },

  /** Update a phone number label or default status */
  async updatePhoneNumber(
    id: string,
    organizationId: string,
    updates: { label?: string; isDefault?: boolean }
  ): Promise<void> {
    const updateData: Record<string, any> = {};
    if (updates.label !== undefined) updateData.label = updates.label;
    if (updates.isDefault !== undefined) updateData.is_default = updates.isDefault;

    const { error } = await supabase
      .from('whatsapp_phone_numbers')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error updating WhatsApp phone number:', error);
      throw new Error(error.message);
    }
  },

  /** Remove a phone number from the organization */
  async removePhoneNumber(id: string, organizationId: string): Promise<void> {
    const { error } = await supabase
      .from('whatsapp_phone_numbers')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error removing WhatsApp phone number:', error);
      throw new Error(error.message);
    }
  },

  /** Set a phone number as the default */
  async setDefault(id: string, organizationId: string): Promise<void> {
    await this.updatePhoneNumber(id, organizationId, { isDefault: true });
  },

  /**
   * Migrate existing phone number from integration_settings to whatsapp_phone_numbers table.
   * Called once to seed from the old single-number config.
   */
  async migrateFromIntegrationSettings(organizationId: string): Promise<WhatsAppPhoneNumber | null> {
    // Check if already migrated
    const existing = await this.getPhoneNumbers(organizationId);
    if (existing.length > 0) return existing[0];

    // Get old config
    const { data } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('service_name', 'whatsapp')
      .single();

    if (!data?.credentials) return null;

    const creds = data.credentials as any;
    const phoneNumberId = creds.phone_id || creds.phone_number_id;
    const displayPhone = creds.phone_number;

    if (!phoneNumberId) return null;

    return this.addPhoneNumber(
      organizationId,
      phoneNumberId,
      displayPhone || 'Unknown',
      'Principal',
      true,
      undefined,
      creds.waba_id || undefined,
      creds.access_token || undefined,
      creds.business_id || undefined
    );
  },

  /**
   * Read the CURRENT data in integration_settings and add/upsert it as a phone number.
   * Unlike migrateFromIntegrationSettings, this does NOT skip if phones already exist.
   */
  async addFromIntegrationSettings(organizationId: string): Promise<WhatsAppPhoneNumber | null> {
    const { data } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('service_name', 'whatsapp')
      .single();

    if (!data?.credentials) return null;

    const creds = data.credentials as any;
    const phoneNumberId = creds.phone_id || creds.phone_number_id;
    const displayPhone = creds.phone_number;

    if (!phoneNumberId) return null;

    // Check if this specific phone already exists
    const existing = await this.getPhoneNumbers(organizationId);
    const alreadyExists = existing.some(p => p.phoneNumberId === phoneNumberId);

    return this.addPhoneNumber(
      organizationId,
      phoneNumberId,
      displayPhone || 'Obteniendo...',
      '',
      existing.length === 0, // default only if first phone
      undefined,
      creds.waba_id || undefined,
      creds.access_token || undefined,
      creds.business_id || undefined
    );
  },

  /**
   * Fetch quality rating and verified name from Meta API for a phone number.
   * Requires the org's access_token from integration_settings.
   */
  async refreshPhoneInfo(
    id: string,
    organizationId: string
  ): Promise<void> {
    // Get phone
    const { data: phone } = await supabase
      .from('whatsapp_phone_numbers')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (!phone) return;

    // Get access token: prefer phone-level token, fallback to org-level integration_settings
    let accessToken = phone.access_token;
    if (!accessToken) {
      const { data: config } = await supabase
        .from('integration_settings')
        .select('credentials')
        .eq('organization_id', organizationId)
        .eq('service_name', 'whatsapp')
        .single();
      accessToken = (config?.credentials as any)?.access_token;
    }
    if (!accessToken) return;

    try {
      const fields = 'quality_rating,messaging_limit_tier,display_phone_number,verified_name';
      const url = `https://graph.facebook.com/v18.0/${phone.phone_number_id}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) return;

      const data = await response.json();

      await supabase
        .from('whatsapp_phone_numbers')
        .update({
          quality_rating: data.quality_rating || 'UNKNOWN',
          messaging_limit_tier: data.messaging_limit_tier || 'TIER_UNKNOWN',
          display_phone_number: data.display_phone_number || phone.display_phone_number,
          verified_name: data.verified_name || phone.verified_name,
        })
        .eq('id', id)
        .eq('organization_id', organizationId);
    } catch (error) {
      console.error('Error refreshing phone info from Meta API:', error);
    }
  },
};
