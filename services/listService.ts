import { CRMList } from '../types';
import { supabase } from './supabaseClient';

export const listService = {
  async getLists(organizationId: string): Promise<CRMList[]> {
    try {
      const { data, error } = await supabase
        .from('lists')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        filters: l.filters || [],
        manualContactIds: l.manual_contact_ids || [],
        inactiveContactIds: l.inactive_contact_ids || [],
        createdAt: new Date(l.created_at)
      }));
    } catch (error) {
      console.error('Error fetching lists:', error);
      return [];
    }
  },

  async saveList(list: CRMList, organizationId: string): Promise<CRMList> {
    try {
      const listData = {
        id: list.id,
        name: list.name,
        filters: list.filters,
        manual_contact_ids: list.manualContactIds || [],
        inactive_contact_ids: list.inactiveContactIds || [],
        organization_id: organizationId,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('lists')
        .upsert(listData)
        .select()
        .single();

      if (error) throw error;

      const savedList = {
        id: data.id,
        name: data.name,
        filters: data.filters || [],
        manualContactIds: data.manual_contact_ids || [],
        inactiveContactIds: data.inactive_contact_ids || [],
        createdAt: new Date(data.created_at)
      };

      // Trigger workflow enrollment sync for any active workflows using this list
      // Fire-and-forget: don't block the save if this fails
      try {
        supabase.functions.invoke('workflows-manage?action=sync-list', {
          body: { list_id: data.id, organization_id: organizationId }
        }).then(({ error: syncErr }) => {
          if (syncErr) {
            console.warn('[listService] sync-list warning:', syncErr);
          } else {
            console.log('[listService] sync-list triggered for list:', data.id);
          }
        });
      } catch (syncErr) {
        console.warn('[listService] Error triggering sync-list (non-fatal):', syncErr);
      }

      return savedList;
    } catch (error) {
      console.error('Error saving list:', error);
      throw error;
    }
  },

  async deleteList(id: string, organizationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('lists')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting list:', error);
      throw error;
    }
  },

  /**
   * Get contacts that belong to a list (resolves filters and manual_contact_ids)
   */
  async getListContacts(listId: string, organizationId: string): Promise<any[]> {
    try {
      console.log('[listService] Getting contacts for list:', listId, 'org:', organizationId);
      
      // Get list details
      const { data: listData, error: listError } = await supabase
        .from('lists')
        .select('manual_contact_ids, inactive_contact_ids, filters')
        .eq('id', listId)
        .eq('organization_id', organizationId)
        .single();

      if (listError) {
        console.error('[listService] Error fetching list:', listError);
        throw listError;
      }

      console.log('[listService] List data:', listData);

      const manualIds = listData?.manual_contact_ids || [];
      const inactiveIds = listData?.inactive_contact_ids || [];
      const filters = listData?.filters || [];

      console.log('[listService] Manual IDs:', manualIds.length, 'Inactive IDs:', inactiveIds.length, 'Filters:', filters.length);

      // For now, simplified logic: get contacts from manual_contact_ids
      // excluding those in inactive_contact_ids
      // TODO: Extend with dynamic filter evaluation

      const activeContactIds = manualIds.filter((id: string) => !inactiveIds.includes(id));

      console.log('[listService] Active contact IDs:', activeContactIds.length);

      // Build query with filters
      let query = supabase
        .from('crm_contacts')
        .select('id, name, email, phone, company, avatar_url')
        .eq('organization_id', organizationId);

      // Apply filters if present
      if (filters && filters.length > 0) {
        console.log('[listService] Applying filters:', filters);
        for (const filter of filters) {
          const field = filter.field;
          const comparison = filter.comparison;
          const value = filter.value;

          switch (comparison) {
            case 'equals':
              query = query.eq(field, value);
              break;
            case 'contains':
              query = query.ilike(field, `%${value}%`);
              break;
            case 'starts_with':
              query = query.ilike(field, `${value}%`);
              break;
            case 'ends_with':
              query = query.ilike(field, `%${value}`);
              break;
            case 'not_equals':
              query = query.neq(field, value);
              break;
            case 'greater_than':
              query = query.gt(field, value);
              break;
            case 'less_than':
              query = query.lt(field, value);
              break;
            default:
              console.warn('[listService] Unknown comparison:', comparison);
          }
        }
      }

      // If we have manual contact IDs, filter by them
      if (activeContactIds.length > 0) {
        console.log('[listService] Filtering by manual contact IDs');
        query = query.in('id', activeContactIds);
      }

      // Exclude inactive contacts
      if (inactiveIds.length > 0) {
        console.log('[listService] Excluding inactive contact IDs:', inactiveIds.length);
        query = query.not('id', 'in', `(${inactiveIds.map((id: string) => `"${id}"`).join(',')})`);
      }

      query = query.order('name');

      const { data: contacts, error: contactsError } = await query;

      if (contactsError) {
        console.error('[listService] Error fetching contacts:', contactsError);
        throw contactsError;
      }

      console.log('[listService] Found contacts:', contacts?.length || 0);
      return contacts || [];
    } catch (error) {
      console.error('[listService] Error fetching list contacts:', error);
      return [];
    }
  }
};
