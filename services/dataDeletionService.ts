/**
 * Data Deletion Service
 * 
 * Manages all data deletion operations for GDPR/Meta/Google compliance.
 * 
 * Levels:
 *  1. Anonymize personal data (any user)
 *  2. Remove a team member from current org (auth account is deleted only if user has no other org memberships)
 *  3. Delete entire organization data (org creator only, auth users are preserved)
 *  4. Preview deletion (dry run)
 */

import { supabase } from './supabaseClient';

export interface DeletionPreview {
  success: boolean;
  organization?: { id: string; name: string };
  counts?: Record<string, number>;
  members?: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    is_creator: boolean;
    has_other_organizations?: boolean;
  }>;
  phone_numbers?: Array<{
    id: string;
    display_phone_number: string;
    label: string;
    is_default: boolean;
    waba_id: string | null;
  }>;
  error?: string;
  message?: string;
}

export interface DeletionResult {
  success: boolean;
  level?: string;
  user_id?: string;
  organization_id?: string;
  organization_name?: string;
  member_ids?: string[];
  counts?: Record<string, number>;
  message?: string;
  error?: string;
}

const FUNCTION_NAME = 'delete-user-data';

async function callDeletionFunction(body: Record<string, any>): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No hay sesión activa');

  const response = await supabase.functions.invoke(FUNCTION_NAME, {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (response.error) {
    console.error(`[dataDeletionService] Edge function error:`, response.error);
    throw new Error(response.error.message || 'Error en el servicio de eliminación');
  }

  return response.data;
}

export const dataDeletionService = {

  /**
   * Check if the current user is the organization creator (first admin).
   * Only the creator can perform Level 2 & 3 deletions.
   */
  async isOrganizationCreator(userId: string, organizationId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('get_org_creator_id', { org_id: organizationId });

      if (error) {
        console.error('[dataDeletionService] Error checking creator:', error);
        return false;
      }

      return data === userId;
    } catch (err) {
      console.error('[dataDeletionService] isOrganizationCreator error:', err);
      return false;
    }
  },

  /**
   * LEVEL 1: Anonymize personal data.
   * Any user can anonymize their own data.
   * Admins can anonymize other users' data.
   */
  async anonymizeUserData(
    organizationId: string,
    targetUserId?: string
  ): Promise<DeletionResult> {
    try {
      const result = await callDeletionFunction({
        level: 'anonymize',
        organization_id: organizationId,
        target_user_id: targetUserId,
      });
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /**
    * LEVEL 2: Remove a team member and their org-scoped data.
   * Only the org creator can do this.
    * Cannot delete the creator themselves.
    * If the user belongs to other organizations, their account is preserved.
   */
  async deleteTeamMember(
    organizationId: string,
    targetUserId: string
  ): Promise<DeletionResult> {
    try {
      const result = await callDeletionFunction({
        level: 'delete_member',
        organization_id: organizationId,
        target_user_id: targetUserId,
      });
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /**
    * LEVEL 3: Delete the entire organization and all associated data.
   * Only the org creator can do this.
    * Preserves user accounts for multi-organization safety.
   */
  async deleteOrganization(
    organizationId: string
  ): Promise<DeletionResult> {
    try {
      const result = await callDeletionFunction({
        level: 'delete_organization',
        organization_id: organizationId,
      });
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /**
   * LEVEL 4: Preview what would be deleted (dry run).
   * Returns counts of all records that would be affected.
   */
  async previewDeletion(
    organizationId: string
  ): Promise<DeletionPreview> {
    try {
      const result = await callDeletionFunction({
        level: 'preview',
        organization_id: organizationId,
      });
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};
