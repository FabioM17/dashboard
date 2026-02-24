// services/apiKeyService.ts
// Service for managing API keys and endpoint configurations per organization

import { supabase } from './supabaseClient';

export interface ApiKey {
  id: string;
  organization_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiEndpointConfig {
  id: string;
  organization_id: string;
  endpoint_name: string;
  method: string;
  is_enabled: boolean;
  rate_limit_per_minute: number;
  created_at: string;
  updated_at: string;
}

// Available scopes
export const API_SCOPES = [
  { value: 'contacts:read', label: 'Contacts - Read', description: 'View contacts from your CRM' },
  { value: 'contacts:write', label: 'Contacts - Write', description: 'Create and update contacts' },
  { value: 'messages:read', label: 'Messages - Read', description: 'Read conversation messages' },
  { value: 'messages:send', label: 'Messages - Send', description: 'Send messages to conversations' },
  { value: 'conversations:read', label: 'Conversations - Read', description: 'View conversations' },
  { value: 'conversations:write', label: 'Conversations - Write', description: 'Update conversations' },
  { value: 'templates:read', label: 'Templates - Read', description: 'View message templates' },
] as const;

// Available endpoints with their required scopes
export const API_ENDPOINTS = [
  { name: 'contacts', method: 'GET', label: 'GET /contacts', description: 'List all contacts', requiredScope: 'contacts:read' },
  { name: 'contacts', method: 'POST', label: 'POST /contacts', description: 'Create a new contact', requiredScope: 'contacts:write' },
  { name: 'contacts', method: 'PUT', label: 'PUT /contacts/:id', description: 'Update a contact', requiredScope: 'contacts:write' },
  { name: 'contacts', method: 'DELETE', label: 'DELETE /contacts/:id', description: 'Delete a contact', requiredScope: 'contacts:write' },
  { name: 'contacts-search', method: 'POST', label: 'POST /contacts/search', description: 'Search contacts with filters', requiredScope: 'contacts:read' },
  { name: 'conversations', method: 'GET', label: 'GET /conversations', description: 'List all conversations', requiredScope: 'conversations:read' },
  { name: 'conversations', method: 'PUT', label: 'PUT /conversations/:id', description: 'Update a conversation', requiredScope: 'conversations:write' },
  { name: 'messages', method: 'GET', label: 'GET /messages', description: 'Get messages from a conversation', requiredScope: 'messages:read' },
  { name: 'send-message', method: 'POST', label: 'POST /send-message', description: 'Send a message', requiredScope: 'messages:send' },
  { name: 'templates', method: 'GET', label: 'GET /templates', description: 'List message templates', requiredScope: 'templates:read' },
] as const;

/**
 * Generate a cryptographically secure API key
 * Format: dk_live_<32 random hex chars> (total ~40 chars)
 */
function generateApiKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const hex = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  return `dk_live_${hex}`;
}

/**
 * SHA-256 hash of a string (for storing API key hashes)
 */
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const apiKeyService = {

  /**
   * Get all API keys for an organization (without the actual key)
   */
  async getApiKeys(organizationId: string): Promise<ApiKey[]> {
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching API keys:', error);
      throw error;
    }
    return data || [];
  },

  /**
   * Create a new API key. Returns the full plaintext key ONCE.
   * After this, only the prefix and hash are stored.
   */
  async createApiKey(
    organizationId: string,
    name: string,
    scopes: string[],
    createdBy: string,
    expiresAt?: string
  ): Promise<{ key: ApiKey; plaintextKey: string }> {
    const plaintextKey = generateApiKey();
    const keyHash = await hashKey(plaintextKey);
    const keyPrefix = plaintextKey.substring(0, 12); // "dk_live_xxxx"

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        organization_id: organizationId,
        name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        scopes,
        created_by: createdBy,
        expires_at: expiresAt || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating API key:', error);
      throw error;
    }

    return { key: data, plaintextKey };
  },

  /**
   * Revoke (deactivate) an API key
   */
  async revokeApiKey(keyId: string, organizationId: string): Promise<void> {
    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', keyId)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error revoking API key:', error);
      throw error;
    }
  },

  /**
   * Re-activate a previously revoked API key
   */
  async activateApiKey(keyId: string, organizationId: string): Promise<void> {
    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: true })
      .eq('id', keyId)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error activating API key:', error);
      throw error;
    }
  },

  /**
   * Delete an API key permanently
   */
  async deleteApiKey(keyId: string, organizationId: string): Promise<void> {
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', keyId)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error deleting API key:', error);
      throw error;
    }
  },

  /**
   * Update the name or scopes of an API key
   */
  async updateApiKey(
    keyId: string,
    organizationId: string,
    updates: { name?: string; scopes?: string[] }
  ): Promise<void> {
    const { error } = await supabase
      .from('api_keys')
      .update(updates)
      .eq('id', keyId)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error updating API key:', error);
      throw error;
    }
  },

  // ==========================================
  // Endpoint Configuration
  // ==========================================

  /**
   * Get all endpoint configurations for an organization
   */
  async getEndpointConfigs(organizationId: string): Promise<ApiEndpointConfig[]> {
    const { data, error } = await supabase
      .from('api_endpoint_configs')
      .select('*')
      .eq('organization_id', organizationId)
      .order('endpoint_name', { ascending: true });

    if (error) {
      console.error('Error fetching endpoint configs:', error);
      throw error;
    }
    return data || [];
  },

  /**
   * Initialize default endpoint configurations for an organization
   */
  async seedEndpointDefaults(organizationId: string): Promise<void> {
    const { error } = await supabase.rpc('seed_api_endpoint_defaults', {
      org_id: organizationId,
    });

    if (error) {
      console.error('Error seeding endpoint defaults:', error);
      throw error;
    }
  },

  /**
   * Toggle an endpoint on/off
   */
  async toggleEndpoint(
    configId: string,
    organizationId: string,
    isEnabled: boolean
  ): Promise<void> {
    const { error } = await supabase
      .from('api_endpoint_configs')
      .update({ is_enabled: isEnabled })
      .eq('id', configId)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error toggling endpoint:', error);
      throw error;
    }
  },

  /**
   * Update rate limit for an endpoint
   */
  async updateEndpointRateLimit(
    configId: string,
    organizationId: string,
    rateLimit: number
  ): Promise<void> {
    const { error } = await supabase
      .from('api_endpoint_configs')
      .update({ rate_limit_per_minute: rateLimit })
      .eq('id', configId)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error updating rate limit:', error);
      throw error;
    }
  },

  /**
   * Get the base URL for the external API
   */
  getApiBaseUrl(): string {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://gfavwcnokzypvazyoqod.supabase.co';
    return `${supabaseUrl}/functions/v1/external-api`;
  },
};
